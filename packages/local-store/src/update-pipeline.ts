/**
 * Update pipeline: validation, staging, the atomic pointer switch, rollback
 * and the published-source download. Everything here runs under the writer
 * lease; staged rows are invisible until one transaction switches the pointer.
 */
import type {
  DatasetUpdateFailureReason,
  DatasetUpdatePipeline,
  DatasetUpdateState,
  LocalDatasetCandidate,
  PublishedBundleLoader,
  PublishedDatasetManifest,
  PublishedDatasetReader,
} from '@intermed/domain';
import type { DatasetEventBus } from './events';
import { isQuotaError } from './introspect';
import type { DatasetWriterLock, WriterLease } from './locks';
import type { MaintenanceTask } from './maintenance';
import type { Retention } from './retention';
import type { Preferences } from './preferences';
import {
  CATALOGUE_STORE_NAMES,
  catalogueTable,
  catalogueTables,
  emptyMeta,
  scopedCatalogueTable,
  toLocalGeneration,
  type CatalogueRows,
  type CatalogueStoreName,
  type GenerationRecord,
  type LocalDatasetDatabase,
} from './schema';
import { bundleByteLength } from './synthetic-bundle';
import { toCatalogueRows } from './rows';
import { checkBundle, checkManifest } from './validate';

/** Outcome of one guarded staging write batch. */
type StageWrite =
  'written' | 'lease-lost' | 'cleared' | 'cleared-quiet' | 'count-mismatch';

type StageOutcome =
  | { readonly ok: true; readonly generationId: string }
  | { readonly ok: false; readonly state: DatasetUpdateState };

/** Everything the update pipeline needs from the rest of the store. */
export interface PipelineDeps {
  readonly dataset: string;
  readonly now: () => number;
  readonly reader?: PublishedDatasetReader | undefined;
  readonly loader?: PublishedBundleLoader | undefined;
  readonly onStaged?:
    | ((progress: {
        readonly generationId: string;
        readonly store: CatalogueStoreName;
        readonly count: number;
      }) => void | Promise<void>)
    | undefined;
  readonly onMaintenance?:
    ((task: MaintenanceTask) => void | Promise<void>) | undefined;
  readonly database: () => LocalDatasetDatabase | null;
  readonly requireDatabase: () => LocalDatasetDatabase;
  readonly open: () => Promise<DatasetUpdateState>;
  readonly state: () => DatasetUpdateState;
  readonly writerLock: () => DatasetWriterLock | null;
  readonly events: DatasetEventBus;
  readonly readClearEpoch: () => Promise<number>;
  readonly currentGenerationRecord: () => Promise<GenerationRecord | null>;
  readonly setState: (next: DatasetUpdateState) => DatasetUpdateState;
  readonly refresh: () => Promise<DatasetUpdateState>;
  readonly writeStatus: (
    updateStatus: string,
    failureReason: string | null,
  ) => Promise<void>;
  readonly fail: (
    reason: DatasetUpdateFailureReason,
  ) => Promise<DatasetUpdateState>;
  readonly maintenance: {
    run(task: MaintenanceTask, work: () => Promise<void>): Promise<void>;
  };
  readonly retention: Retention;
  readonly preferences: Preferences;
}

export interface UpdatePipeline {
  readonly updates: DatasetUpdatePipeline;
  rollback(): Promise<boolean>;
}

export function createUpdatePipeline(deps: PipelineDeps): UpdatePipeline {
  /** Run work under the writer lease; refused work reports `writer-busy`. */
  async function withWriter(
    work: (
      lease: WriterLease,
      clearEpoch: number,
    ) => Promise<DatasetUpdateState>,
  ): Promise<DatasetUpdateState> {
    await deps.open();
    const db = deps.database();
    const writerLock = deps.writerLock();
    if (!db || !writerLock) return deps.state();
    const outcome = await writerLock.withExclusiveUpdate((lease) =>
      // The clear epoch captured here is what an in-flight update may write
      // under: a clear that completes later wins over it (Greptile G4).
      deps.readClearEpoch().then((clearEpoch) => work(lease, clearEpoch)),
    );
    return outcome.ok ? outcome.value : deps.fail('writer-busy');
  }

  function candidateOf(
    manifest: PublishedDatasetManifest,
  ): LocalDatasetCandidate {
    return {
      generationId: manifest.datasetVersionId,
      version: manifest.version,
      publishedAt: manifest.publishedAt ?? null,
    };
  }

  async function cleanupPartial(generationId: string): Promise<void> {
    const db = deps.requireDatabase();
    const record = await db.generations.get(generationId);
    if (!record || record.status === 'ready') return;
    await deps.retention.deleteGenerationRows(generationId);
  }

  /**
   * State of an aborted staging run (Codex review fix #4): a completed clear
   * wins quietly, a cut-short run reports why it stopped, and a writer that
   * lost its lease reports `writer-busy` while touching nothing.
   */
  async function abortStaging(
    outcome: StageWrite,
  ): Promise<DatasetUpdateState> {
    if (outcome === 'cleared-quiet') return deps.refresh();
    if (outcome === 'lease-lost') return deps.fail('writer-busy');
    if (outcome === 'count-mismatch') return deps.fail('count-mismatch');
    return deps.fail('local-data-cleared');
  }

  async function stageUnlocked(
    manifest: PublishedDatasetManifest,
    bundleText: string,
    lease: WriterLease,
    clearEpoch: number,
  ): Promise<StageOutcome> {
    const db = deps.requireDatabase();
    const generationId = manifest.datasetVersionId;
    const existing = await db.generations.get(generationId);
    // A ready generation is only skipped when its rows are all there; an
    // evicted one is re-staged, replacing its rows (Greptile G7).
    if (
      existing?.status === 'ready' &&
      (await deps.retention.countsMatch(existing, (name) =>
        catalogueTable(db, name),
      ))
    )
      return { ok: true, generationId };
    if (existing) await deps.retention.deleteGenerationRows(generationId);
    const manifestProblem = checkManifest(manifest, deps.dataset);
    if (manifestProblem)
      return { ok: false, state: await deps.fail(manifestProblem) };
    const current = await deps.currentGenerationRecord();
    const currentGeneration = current ? toLocalGeneration(current) : null;
    const candidate = candidateOf(manifest);
    deps.setState({
      status: 'staging',
      generation: currentGeneration,
      candidate,
    });
    const bundle = checkBundle(manifest, bundleText);
    if (!bundle.ok) return { ok: false, state: await deps.fail(bundle.reason) };
    const rows: CatalogueRows = toCatalogueRows(generationId, bundle.snapshot);
    const record: GenerationRecord = {
      generationId,
      dataset: manifest.dataset,
      version: manifest.version,
      schemaVersion: manifest.schemaVersion,
      sourceIds: manifest.sourceIds,
      publishedAt: manifest.publishedAt ?? null,
      importedAt: manifest.importedAt,
      downloadedAt: new Date(deps.now()).toISOString(),
      checksum: manifest.checksum,
      coverage: manifest.coverage,
      recordCounts: manifest.recordCounts,
      synthetic: bundle.synthetic,
      status: 'staging',
      stagedAt: new Date(deps.now()).toISOString(),
      readyAt: null,
      lastUsedAt: null,
    };
    try {
      // Every staging write batch is guarded (Codex #4, Greptile G1): the
      // record it writes for must still exist and the lease must still be
      // ours, checked inside the batch transaction itself.
      const created = await db.transaction(
        'rw',
        [db.writerLock, db.generations, db.meta],
        async (transaction): Promise<StageWrite> => {
          const meta = await transaction.meta.get('dataset-state');
          if ((meta?.clearEpoch ?? 0) !== clearEpoch) return 'cleared-quiet';
          if (!(await lease.revalidate(transaction.writerLock)))
            return 'lease-lost';
          await transaction.generations.put(record);
          return 'written';
        },
      );
      if (created !== 'written')
        return { ok: false, state: await abortStaging(created) };
      for (const name of CATALOGUE_STORE_NAMES) {
        const items = rows[name];
        const written = await db.transaction(
          'rw',
          [db.writerLock, db.generations, catalogueTable(db, name)],
          async (transaction): Promise<StageWrite> => {
            const staged = await transaction.generations.get(generationId);
            if (!staged) return 'cleared';
            if (!(await lease.revalidate(transaction.writerLock)))
              return 'lease-lost';
            if (items.length > 0)
              await scopedCatalogueTable(transaction, name).bulkPut(
                items as unknown as { generationId: string; id: string }[],
              );
            return 'written';
          },
        );
        if (written !== 'written')
          return { ok: false, state: await abortStaging(written) };
        await deps.onStaged?.({
          generationId,
          store: name,
          count: items.length,
        });
      }
      // Completion marker (Greptile G3): only after every batch is written and
      // the stored rows match the published counts does the generation become
      // `staged` and thus activatable.
      const completed = await db.transaction(
        'rw',
        [db.writerLock, db.generations, ...catalogueTables(db)],
        async (transaction): Promise<StageWrite> => {
          if (!(await lease.revalidate(transaction.writerLock)))
            return 'lease-lost';
          const staged = await transaction.generations.get(generationId);
          if (!staged) return 'cleared';
          if (
            !(await deps.retention.countsMatch(record, (name) =>
              scopedCatalogueTable(transaction, name),
            ))
          )
            return 'count-mismatch';
          await transaction
            .table('generations')
            .update(generationId, { status: 'staged' });
          return 'written';
        },
      );
      if (completed !== 'written')
        return { ok: false, state: await abortStaging(completed) };
    } catch (error) {
      await cleanupPartial(generationId);
      if (isQuotaError(error)) {
        await deps.writeStatus('storage-quota', 'storage-quota');
        return {
          ok: false,
          state: deps.setState({
            status: 'storage-quota',
            generation: currentGeneration,
          }),
        };
      }
      return { ok: false, state: await deps.fail('interrupted') };
    }
    return { ok: true, generationId };
  }

  async function activateUnlocked(
    generationId: string,
    lease: WriterLease,
    clearEpoch: number,
  ): Promise<DatasetUpdateState> {
    const db = deps.requireDatabase();
    const record = await db.generations.get(generationId);
    if (!record) return deps.fail('interrupted');
    const active = await db.meta.get('dataset-state');
    if (
      active?.activeGenerationId === generationId &&
      record.status === 'ready'
    )
      return deps.refresh();
    const activatedAt = new Date(deps.now()).toISOString();
    let abort: string = 'interrupted';
    try {
      await db.transaction(
        'rw',
        [db.generations, db.meta, db.writerLock, ...catalogueTables(db)],
        async (transaction) => {
          if (!(await lease.revalidate(transaction.writerLock))) {
            abort = 'lease-lost';
            throw new Error('The writer lease was lost');
          }
          const meta =
            (await transaction.meta.get('dataset-state')) ?? emptyMeta();
          if ((meta.clearEpoch ?? 0) !== clearEpoch) {
            abort = 'cleared';
            throw new Error('The local data was cleared');
          }
          const staged = await transaction.generations.get(generationId);
          if (!staged) throw new Error('The staged generation is missing');
          if (staged.status === 'staging') {
            abort = 'incomplete';
            throw new Error('The staged generation is incomplete');
          }
          if (
            !(await deps.retention.countsMatch(staged, (name) =>
              scopedCatalogueTable(transaction, name),
            ))
          ) {
            abort = 'count-mismatch';
            throw new Error('The staged generation is missing rows');
          }
          await transaction.generations.update(generationId, {
            status: 'ready',
            readyAt: staged.readyAt ?? activatedAt,
            lastUsedAt: activatedAt,
          });
          await transaction.meta.put({
            ...meta,
            activeGenerationId: generationId,
            previousGenerationId:
              meta.activeGenerationId &&
              meta.activeGenerationId !== generationId
                ? meta.activeGenerationId
                : meta.previousGenerationId,
            updateStatus: 'ready',
            failureReason: null,
          });
        },
      );
    } catch {
      if (abort === 'cleared') return deps.refresh();
      if (abort === 'lease-lost') return deps.fail('writer-busy');
      if (abort === 'count-mismatch') return deps.fail('count-mismatch');
      await cleanupPartial(generationId);
      return deps.fail('interrupted');
    }
    // The pointer switch committed: the activation succeeded. Refresh and
    // broadcast first, then run maintenance in isolation (Codex review fix #2).
    const activated = await deps.refresh();
    deps.events.post({ type: 'activated', generationId });
    await postCommit(generationId);
    return activated;
  }

  /** Refresh, broadcast and run post-commit maintenance for one generation. */
  async function postCommit(generationId: string): Promise<void> {
    await deps.maintenance.run(
      { kind: 'preference-reconciliation', generationId },
      () => deps.preferences.reconcilePreferences(generationId),
    );
    await deps.maintenance.run({ kind: 'generation-gc' }, async () => {
      await deps.retention.collectGenerations();
    });
  }

  async function stageAndActivateUnlocked(
    manifest: PublishedDatasetManifest,
    bundleText: string,
    lease: WriterLease,
    clearEpoch: number,
  ): Promise<DatasetUpdateState> {
    const staged = await stageUnlocked(manifest, bundleText, lease, clearEpoch);
    if (!staged.ok) return staged.state;
    return activateUnlocked(staged.generationId, lease, clearEpoch);
  }

  async function readManifest(): Promise<
    | { readonly ok: true; readonly manifest: PublishedDatasetManifest }
    | { readonly ok: false; readonly state: DatasetUpdateState }
  > {
    const current = await deps.currentGenerationRecord();
    const currentGeneration = current ? toLocalGeneration(current) : null;
    deps.setState({ status: 'checking', generation: currentGeneration });
    const reader = deps.reader;
    if (!reader)
      return { ok: false, state: await deps.fail('manifest-unavailable') };
    let result;
    try {
      result = await reader.getManifest(deps.dataset);
    } catch {
      return { ok: false, state: await deps.fail('manifest-unavailable') };
    }
    if (result.status === 'absent') {
      await recordCheck();
      return { ok: false, state: await deps.refresh() };
    }
    if (result.status !== 'available')
      return { ok: false, state: await deps.fail('manifest-unavailable') };
    const problem = checkManifest(result.value, deps.dataset);
    if (problem) return { ok: false, state: await deps.fail(problem) };
    await recordCheck();
    return { ok: true, manifest: result.value };
  }

  async function recordCheck(): Promise<void> {
    const db = deps.database();
    if (!db) return;
    const checkedAt = new Date(deps.now()).toISOString();
    await db.transaction('rw', db.meta, async (transaction) => {
      const record = await transaction.meta.get('dataset-state');
      if (record)
        await transaction.meta.put({
          ...record,
          lastSuccessfulCheckAt: checkedAt,
          updateStatus: 'checked',
          failureReason: null,
        });
    });
  }

  const updates: DatasetUpdatePipeline = {
    checkForUpdate: async () => {
      await deps.open();
      const result = await readManifest();
      if (!result.ok) return result.state;
      const current = await deps.currentGenerationRecord();
      const currentGeneration = current ? toLocalGeneration(current) : null;
      if (result.manifest.datasetVersionId === current?.generationId)
        return deps.refresh();
      return deps.setState({
        status: 'update-available',
        generation: currentGeneration,
        candidate: candidateOf(result.manifest),
      });
    },

    downloadAndActivate: () =>
      withWriter(async (lease, clearEpoch) => {
        const loader = deps.loader;
        const result = await readManifest();
        if (!result.ok) return result.state;
        const current = await deps.currentGenerationRecord();
        const currentGeneration = current ? toLocalGeneration(current) : null;
        if (result.manifest.datasetVersionId === current?.generationId)
          return deps.refresh();
        const candidate = candidateOf(result.manifest);
        const reader = deps.reader;
        if (!loader || !reader) return deps.fail('bundle-unavailable');
        deps.setState({
          status: 'downloading',
          generation: currentGeneration,
          candidate,
        });
        let descriptor;
        try {
          descriptor = await reader.getBundleDescriptor(
            result.manifest.datasetVersionId,
          );
        } catch {
          return deps.fail('bundle-unavailable');
        }
        if (descriptor.status !== 'available')
          return deps.fail('bundle-unavailable');
        if (
          descriptor.value.datasetVersionId !== result.manifest.datasetVersionId
        )
          return deps.fail('invalid-bundle');
        let bundle;
        try {
          bundle = await loader.loadBundle(descriptor.value);
        } catch {
          return deps.fail('bundle-unavailable');
        }
        if (bundle.status !== 'available')
          return deps.fail('bundle-unavailable');
        if (bundleByteLength(bundle.text) !== descriptor.value.byteSize)
          return deps.fail('invalid-bundle');
        return stageAndActivateUnlocked(
          result.manifest,
          bundle.text,
          lease,
          clearEpoch,
        );
      }),

    stageBundle: (manifest, bundleText) =>
      withWriter(async (lease, clearEpoch) => {
        const staged = await stageUnlocked(
          manifest,
          bundleText,
          lease,
          clearEpoch,
        );
        return staged.ok ? deps.refresh() : staged.state;
      }),

    activate: (generationId) =>
      withWriter((lease, clearEpoch) =>
        activateUnlocked(generationId, lease, clearEpoch),
      ),

    stageAndActivate: (manifest, bundleText) =>
      withWriter((lease, clearEpoch) =>
        stageAndActivateUnlocked(manifest, bundleText, lease, clearEpoch),
      ),
  };

  async function rollback(): Promise<boolean> {
    await deps.open();
    const db = deps.database();
    const writerLock = deps.writerLock();
    if (!db || !writerLock) return false;
    const outcome = await writerLock.withExclusiveUpdate(async () => {
      const activatedAt = new Date(deps.now()).toISOString();
      return db.transaction(
        'rw',
        db.generations,
        db.meta,
        async (): Promise<string | null> => {
          const meta = (await db.meta.get('dataset-state')) ?? emptyMeta();
          const previousId = meta.previousGenerationId;
          if (!previousId || !meta.activeGenerationId) return null;
          const previous = await db.generations.get(previousId);
          if (!previous || previous.status !== 'ready') return null;
          await db.generations.update(previousId, { lastUsedAt: activatedAt });
          await db.meta.put({
            ...meta,
            activeGenerationId: previousId,
            previousGenerationId: meta.activeGenerationId,
            updateStatus: 'ready',
            failureReason: null,
          });
          return previousId;
        },
      );
    });
    if (!outcome.ok || !outcome.value) return false;
    const rolledBackTo = outcome.value;
    await deps.refresh();
    deps.events.post({ type: 'activated', generationId: rolledBackTo });
    await deps.maintenance.run(
      { kind: 'preference-reconciliation', generationId: rolledBackTo },
      () => deps.preferences.reconcilePreferences(rolledBackTo),
    );
    return true;
  }

  return { updates, rollback };
}
