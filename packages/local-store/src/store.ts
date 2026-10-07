import type {
  ActiveIngredient,
  ActiveIngredientId,
  DatasetUpdateFailureReason,
  DatasetUpdatePipeline,
  DatasetUpdateState,
  FavoriteEntry,
  GenerationReader,
  LocalCatalogueStore,
  LocalDatasetCandidate,
  LocalDatasetGeneration,
  LocalPreferencesStore,
  MedicationIngredient,
  MedicationProduct,
  MedicationProductId,
  PublishedBundleLoader,
  PublishedDatasetManifest,
  PublishedDatasetReader,
  RecentSearchEntry,
} from '@intermed/domain';
import type { Table, Transaction } from 'dexie';
import { createDefaultEventBus, type DatasetEventBus } from './events';
import { foldForIndex } from './fold';
import { isQuotaError, isVersionError, readOnDiskSchema } from './introspect';
import { attachConnectionLifecycle } from './lifecycle';
import {
  createWriterLock,
  type DatasetWriterLock,
  type WriterLease,
} from './locks';
import { atcKey, toCatalogueRows } from './rows';
import {
  CATALOGUE_STORE_NAMES,
  LOCAL_DATASET_DB_NAME,
  LOCAL_DATASET_SCHEMA_GENERATION,
  LocalDatasetDatabase,
  type CatalogueRows,
  type CatalogueStoreName,
  type DatasetStateRecord,
  type GenerationRecord,
  type RowKey,
} from './schema';
import { bundleByteLength } from './synthetic-bundle';
import { checkBundle, checkManifest } from './validate';

/** Default published dataset key requested from the manifest reader. */
export const DEFAULT_DATASET_KEY = 'intermed-medication-catalogue';

/**
 * Cross-tab retention window for ready generations that are neither active nor
 * previous. Pins of other tabs cannot be observed from this tab, so any
 * generation activated inside this window is kept: conservative, never the
 * other way round.
 */
export const RETAIN_READY_FOR_MS = 24 * 60 * 60 * 1000;

/** Grace period before an abandoned staged generation is collected. */
export const STALE_STAGING_MS = 5 * 60 * 1000;

/** Progress notification used as a diagnostics and test seam during staging. */
export interface StagingProgress {
  readonly generationId: string;
  readonly store: CatalogueStoreName;
  readonly count: number;
}

export interface LocalDatasetStoreOptions {
  /** Database name. Tests use a fresh name per case. */
  readonly name?: string;
  /** Published dataset key requested from the injected manifest reader. */
  readonly dataset?: string;
  /** Clock injection, so retention and TTLs are deterministic in tests. */
  readonly now?: () => number;
  /** Writer lock injection. Defaults to the configured lock strategy. */
  readonly lock?: DatasetWriterLock;
  /**
   * Writer lock strategy. `auto` (default) uses the Web Locks API with the
   * persistent marker fallback; `marker` forces the fallback, which keeps test
   * runs hermetic where a process-wide Web Locks manager exists.
   */
  readonly lockStrategy?: 'auto' | 'web' | 'marker';
  /** Cross-tab event bus injection. Defaults to a BroadcastChannel bus. */
  readonly events?: DatasetEventBus;
  /** Retention window for ready generations (see RETAIN_READY_FOR_MS). */
  readonly retainReadyForMs?: number;
  /** Published manifest/descriptor reader. Absent in default mock mode. */
  readonly reader?: PublishedDatasetReader;
  /** Published bundle loader. Absent in default mock mode. */
  readonly loader?: PublishedBundleLoader;
  /** Diagnostics/test seam invoked after each staged store write. */
  readonly onStaged?: (progress: StagingProgress) => void | Promise<void>;
}

type StageOutcome =
  | { readonly ok: true; readonly generationId: string }
  | { readonly ok: false; readonly state: DatasetUpdateState };

type AnyCatalogueTable = Table<{ generationId: string; id: string }, RowKey>;

function catalogueTable(
  database: LocalDatasetDatabase,
  name: CatalogueStoreName,
): AnyCatalogueTable {
  // Every catalogue table carries the same row envelope, so staging and
  // deletion can iterate store names without repeating per-store code.
  return database[name] as unknown as AnyCatalogueTable;
}

/** The same table, bound to one open transaction instead of the ambient one. */
function scopedCatalogueTable(
  transaction: Transaction,
  name: CatalogueStoreName,
): AnyCatalogueTable {
  return transaction.table(name) as unknown as AnyCatalogueTable;
}

function toLocalGeneration(record: GenerationRecord): LocalDatasetGeneration {
  return {
    generationId: record.generationId,
    dataset: record.dataset,
    version: record.version,
    schemaVersion: record.schemaVersion,
    sourceIds: record.sourceIds,
    publishedAt: record.publishedAt,
    importedAt: record.importedAt,
    downloadedAt: record.downloadedAt,
    checksum: record.checksum,
    coverage: record.coverage,
    recordCounts: record.recordCounts,
    synthetic: record.synthetic,
  };
}

function emptyMeta(): DatasetStateRecord {
  return {
    key: 'dataset-state',
    schemaGeneration: LOCAL_DATASET_SCHEMA_GENERATION,
    activeGenerationId: null,
    previousGenerationId: null,
    lastSuccessfulCheckAt: null,
    updateStatus: 'never-downloaded',
    failureReason: null,
  };
}

/** Ask for persistent storage as best effort. Never a permanence claim. */
async function requestPersistentStorage(): Promise<void> {
  try {
    const storage = globalThis.navigator?.storage;
    if (storage && typeof storage.persist === 'function')
      await storage.persist();
  } catch {
    /* Best effort only: browsers may decline or restrict persistence. */
  }
}

/**
 * Create the local dataset store (infrastructure layer).
 *
 * Opening is idempotent and immediate: the store reads the active generation
 * locally first. Nothing is downloaded unless a caller explicitly runs the
 * update pipeline, so the default mock mode never writes a dataset into a
 * user's browser.
 */
export function createLocalDatasetStore(
  options: LocalDatasetStoreOptions = {},
): LocalCatalogueStore {
  const databaseName = options.name ?? LOCAL_DATASET_DB_NAME;
  const dataset = options.dataset ?? DEFAULT_DATASET_KEY;
  const now = options.now ?? (() => Date.now());
  const retainReadyForMs = options.retainReadyForMs ?? RETAIN_READY_FOR_MS;
  const events = options.events ?? createDefaultEventBus();
  const owner = `intermed-tab-${Math.random().toString(36).slice(2)}`;

  const listeners = new Set<() => void>();
  const pins = new Map<string, number>();
  let state: DatasetUpdateState = { status: 'opening' };
  let database: LocalDatasetDatabase | null = null;
  let writerLock: DatasetWriterLock | null = options.lock ?? null;
  let opening: Promise<DatasetUpdateState> | null = null;
  let unsubscribe: (() => void) | null = null;

  const setState = (next: DatasetUpdateState): DatasetUpdateState => {
    state = next;
    for (const listener of [...listeners]) listener();
    return next;
  };

  const requireDatabase = (): LocalDatasetDatabase => {
    if (!database) throw new Error('The local dataset store is not open');
    return database;
  };

  function carriedGeneration(): LocalDatasetGeneration | null {
    const current = state;
    return 'generation' in current ? current.generation : null;
  }

  function addPin(generationId: string): void {
    pins.set(generationId, (pins.get(generationId) ?? 0) + 1);
  }

  function removePin(generationId: string): void {
    const count = (pins.get(generationId) ?? 0) - 1;
    if (count > 0) pins.set(generationId, count);
    else pins.delete(generationId);
  }

  async function writeStatus(
    updateStatus: string,
    failureReason: string | null,
  ): Promise<void> {
    const db = database;
    if (!db) return;
    try {
      await db.transaction('rw', db.meta, async () => {
        const record = await db.meta.get('dataset-state');
        if (record)
          await db.meta.put({ ...record, updateStatus, failureReason });
      });
    } catch {
      /* Diagnostics only; never let metadata bookkeeping fail an update. */
    }
  }

  async function recordCheck(): Promise<void> {
    const db = database;
    if (!db) return;
    const checkedAt = new Date(now()).toISOString();
    await db.transaction('rw', db.meta, async () => {
      const record = await db.meta.get('dataset-state');
      if (record)
        await db.meta.put({
          ...record,
          lastSuccessfulCheckAt: checkedAt,
          updateStatus: 'checked',
          failureReason: null,
        });
    });
  }

  async function fail(
    reason: DatasetUpdateFailureReason,
  ): Promise<DatasetUpdateState> {
    await writeStatus('update-failed', reason);
    return setState({
      status: 'update-failed',
      reason,
      generation: carriedGeneration(),
    });
  }

  async function baseState(): Promise<DatasetUpdateState> {
    const db = database;
    if (!db) return state;
    const record = await db.meta.get('dataset-state');
    const activeGenerationId = record?.activeGenerationId ?? null;
    if (!activeGenerationId) return { status: 'never-downloaded' };
    const generation = await db.generations.get(activeGenerationId);
    if (!generation || generation.status !== 'ready')
      return { status: 'evicted', generationId: activeGenerationId };
    const rows = await db.products
      .where('generationId')
      .equals(activeGenerationId)
      .count();
    const expected = generation.recordCounts['products'] ?? 0;
    if (expected > 0 && rows === 0)
      return { status: 'evicted', generationId: activeGenerationId };
    return { status: 'ready', generation: toLocalGeneration(generation) };
  }

  const refresh = async (): Promise<DatasetUpdateState> =>
    setState(await baseState());

  async function ensureMetaRecord(): Promise<void> {
    const db = requireDatabase();
    await db.transaction('rw', db.meta, async () => {
      const record = await db.meta.get('dataset-state');
      if (!record) await db.meta.put(emptyMeta());
    });
  }

  async function openDatabase(): Promise<DatasetUpdateState> {
    await requestPersistentStorage();
    const factory = globalThis.indexedDB;
    if (!factory) return setState({ status: 'storage-unavailable' });
    try {
      const onDisk = await readOnDiskSchema(factory, databaseName);
      if (
        onDisk === 'foreign' ||
        (typeof onDisk === 'number' && onDisk > LOCAL_DATASET_SCHEMA_GENERATION)
      )
        return setState({ status: 'unsupported-schema' });
    } catch {
      return setState({ status: 'storage-restricted' });
    }
    const db = new LocalDatasetDatabase(databaseName);
    // An old tab must never block an upgrade or discard data: it closes its
    // connection and asks the user to reload.
    attachConnectionLifecycle(db, () => {
      database = null;
      setState({ status: 'reload-required' });
    });
    try {
      await db.open();
    } catch (error) {
      if (isVersionError(error))
        return setState({ status: 'unsupported-schema' });
      return setState({ status: 'storage-restricted' });
    }
    database = db;
    writerLock ??= createWriterLock(options.lockStrategy ?? 'auto', db, {
      now,
      owner,
    });
    await ensureMetaRecord();
    unsubscribe ??= events.subscribe((event) => {
      if (event.type === 'activated') void refresh();
    });
    return refresh();
  }

  const open = (): Promise<DatasetUpdateState> => (opening ??= openDatabase());

  async function withWriter(
    work: (lease: WriterLease) => Promise<DatasetUpdateState>,
  ): Promise<DatasetUpdateState> {
    await open();
    if (!database || !writerLock) return state;
    const outcome = await writerLock.withExclusiveUpdate(work);
    return outcome.ok ? outcome.value : fail('writer-busy');
  }

  async function currentGenerationRecord(): Promise<GenerationRecord | null> {
    const db = database;
    if (!db) return null;
    const record = await db.meta.get('dataset-state');
    const activeGenerationId = record?.activeGenerationId ?? null;
    if (!activeGenerationId) return null;
    const generation = await db.generations.get(activeGenerationId);
    return generation && generation.status === 'ready' ? generation : null;
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

  async function deleteGenerationRows(generationId: string): Promise<void> {
    const db = requireDatabase();
    for (const name of CATALOGUE_STORE_NAMES)
      await catalogueTable(db, name)
        .where('generationId')
        .equals(generationId)
        .delete();
    await db.generations.delete(generationId);
  }

  async function cleanupPartial(generationId: string): Promise<void> {
    const db = requireDatabase();
    const record = await db.generations.get(generationId);
    if (!record || record.status === 'ready') return;
    await deleteGenerationRows(generationId);
  }

  async function stageUnlocked(
    manifest: PublishedDatasetManifest,
    bundleText: string,
    lease: WriterLease,
  ): Promise<StageOutcome> {
    const db = requireDatabase();
    const generationId = manifest.datasetVersionId;
    const existing = await db.generations.get(generationId);
    if (existing?.status === 'ready') return { ok: true, generationId };
    const manifestProblem = checkManifest(manifest, dataset);
    if (manifestProblem)
      return { ok: false, state: await fail(manifestProblem) };
    const current = await currentGenerationRecord();
    const currentGeneration = current ? toLocalGeneration(current) : null;
    const candidate = candidateOf(manifest);
    setState({ status: 'staging', generation: currentGeneration, candidate });
    const bundle = checkBundle(manifest, bundleText);
    if (!bundle.ok) return { ok: false, state: await fail(bundle.reason) };
    const rows: CatalogueRows = toCatalogueRows(generationId, bundle.snapshot);
    const record: GenerationRecord = {
      generationId,
      dataset: manifest.dataset,
      version: manifest.version,
      schemaVersion: manifest.schemaVersion,
      sourceIds: manifest.sourceIds,
      publishedAt: manifest.publishedAt ?? null,
      importedAt: manifest.importedAt,
      downloadedAt: new Date(now()).toISOString(),
      checksum: manifest.checksum,
      coverage: manifest.coverage,
      recordCounts: manifest.recordCounts,
      synthetic: bundle.synthetic,
      status: 'staging',
      stagedAt: new Date(now()).toISOString(),
      readyAt: null,
    };
    try {
      // Every staging write batch starts by revalidating the writer lease, so
      // a writer whose lease was taken over stops writing at once instead of
      // racing (or cleaning up after) the new owner.
      const created = await db.transaction(
        'rw',
        db.writerLock,
        db.generations,
        async (transaction) => {
          if (!(await lease.revalidate(transaction.writerLock))) return false;
          await transaction.generations.put(record);
          return true;
        },
      );
      if (!created) return { ok: false, state: await fail('writer-busy') };
      for (const name of CATALOGUE_STORE_NAMES) {
        const items = rows[name];
        const written = await db.transaction(
          'rw',
          db.writerLock,
          catalogueTable(db, name),
          async (transaction) => {
            if (!(await lease.revalidate(transaction.writerLock))) return false;
            if (items.length > 0)
              await scopedCatalogueTable(transaction, name).bulkPut(
                items as unknown as { generationId: string; id: string }[],
              );
            return true;
          },
        );
        if (!written) return { ok: false, state: await fail('writer-busy') };
        await options.onStaged?.({
          generationId,
          store: name,
          count: items.length,
        });
      }
    } catch (error) {
      await cleanupPartial(generationId);
      if (isQuotaError(error)) {
        await writeStatus('storage-quota', 'storage-quota');
        return {
          ok: false,
          state: setState({
            status: 'storage-quota',
            generation: currentGeneration,
          }),
        };
      }
      return { ok: false, state: await fail('interrupted') };
    }
    return { ok: true, generationId };
  }

  async function activateUnlocked(
    generationId: string,
    lease: WriterLease,
  ): Promise<DatasetUpdateState> {
    const db = requireDatabase();
    const record = await db.generations.get(generationId);
    if (!record) return fail('interrupted');
    const active = await db.meta.get('dataset-state');
    if (active?.activeGenerationId === generationId) return refresh();
    const readyAt = new Date(now()).toISOString();
    let leaseLost = false;
    try {
      // One short transaction: revalidate the writer lease, mark the
      // generation ready and switch the pointer. Nothing but IndexedDB work
      // happens inside it.
      await db.transaction(
        'rw',
        db.generations,
        db.meta,
        db.writerLock,
        async (transaction) => {
          if (!(await lease.revalidate(transaction.writerLock))) {
            leaseLost = true;
            throw new Error('The writer lease was lost');
          }
          const meta =
            (await transaction.meta.get('dataset-state')) ?? emptyMeta();
          const staged = await transaction.generations.get(generationId);
          if (!staged) throw new Error('The staged generation is missing');
          if (staged.status !== 'ready')
            await transaction.generations.update(generationId, {
              status: 'ready',
              readyAt,
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
      // A writer that lost its lease leaves the database to its new owner: it
      // stops and runs no cleanup over rows that may no longer be its own.
      if (leaseLost) return fail('writer-busy');
      await cleanupPartial(generationId);
      return fail('interrupted');
    }
    await reconcilePreferences(generationId);
    events.post({ type: 'activated', generationId });
    await collectGenerations();
    return refresh();
  }

  async function stageAndActivateUnlocked(
    manifest: PublishedDatasetManifest,
    bundleText: string,
    lease: WriterLease,
  ): Promise<DatasetUpdateState> {
    const staged = await stageUnlocked(manifest, bundleText, lease);
    if (!staged.ok) return staged.state;
    return activateUnlocked(staged.generationId, lease);
  }

  async function readManifest(): Promise<
    | { readonly ok: true; readonly manifest: PublishedDatasetManifest }
    | { readonly ok: false; readonly state: DatasetUpdateState }
  > {
    const current = await currentGenerationRecord();
    const currentGeneration = current ? toLocalGeneration(current) : null;
    setState({ status: 'checking', generation: currentGeneration });
    const reader = options.reader;
    if (!reader)
      return { ok: false, state: await fail('manifest-unavailable') };
    let result;
    try {
      result = await reader.getManifest(dataset);
    } catch {
      return { ok: false, state: await fail('manifest-unavailable') };
    }
    if (result.status === 'absent') {
      await recordCheck();
      return {
        ok: false,
        state: await refresh(),
      };
    }
    if (result.status !== 'available')
      return { ok: false, state: await fail('manifest-unavailable') };
    const problem = checkManifest(result.value, dataset);
    if (problem) return { ok: false, state: await fail(problem) };
    await recordCheck();
    return { ok: true, manifest: result.value };
  }

  const updates: DatasetUpdatePipeline = {
    checkForUpdate: async () => {
      await open();
      const result = await readManifest();
      if (!result.ok) return result.state;
      const current = await currentGenerationRecord();
      const currentGeneration = current ? toLocalGeneration(current) : null;
      if (result.manifest.datasetVersionId === current?.generationId)
        return refresh();
      return setState({
        status: 'update-available',
        generation: currentGeneration,
        candidate: candidateOf(result.manifest),
      });
    },

    downloadAndActivate: () =>
      withWriter(async (lease) => {
        const loader = options.loader;
        const result = await readManifest();
        if (!result.ok) return result.state;
        const current = await currentGenerationRecord();
        const currentGeneration = current ? toLocalGeneration(current) : null;
        if (result.manifest.datasetVersionId === current?.generationId)
          return refresh();
        const candidate = candidateOf(result.manifest);
        const reader = options.reader;
        if (!loader || !reader) return fail('bundle-unavailable');
        setState({
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
          return fail('bundle-unavailable');
        }
        if (descriptor.status !== 'available')
          return fail('bundle-unavailable');
        if (
          descriptor.value.datasetVersionId !== result.manifest.datasetVersionId
        )
          return fail('invalid-bundle');
        let bundle;
        try {
          bundle = await loader.loadBundle(descriptor.value);
        } catch {
          return fail('bundle-unavailable');
        }
        if (bundle.status !== 'available') return fail('bundle-unavailable');
        if (bundleByteLength(bundle.text) !== descriptor.value.byteSize)
          return fail('invalid-bundle');
        return stageAndActivateUnlocked(result.manifest, bundle.text, lease);
      }),

    stageBundle: (manifest, bundleText) =>
      withWriter(async (lease) => {
        const staged = await stageUnlocked(manifest, bundleText, lease);
        return staged.ok ? refresh() : staged.state;
      }),

    activate: (generationId) =>
      withWriter((lease) => activateUnlocked(generationId, lease)),

    stageAndActivate: (manifest, bundleText) =>
      withWriter((lease) =>
        stageAndActivateUnlocked(manifest, bundleText, lease),
      ),
  };

  async function reconcilePreferences(generationId: string): Promise<void> {
    const db = requireDatabase();
    const favorites = await db.favorites.toArray();
    for (const favorite of favorites) {
      // Stable product id lookup: a favorite is never remapped to another id.
      const row = await db.products.get([generationId, favorite.productId]);
      if (row) {
        await db.favorites.put({
          ...favorite,
          status: 'available',
          lastKnownDisplayName: row.entity.commercialName,
          lastKnownDatasetVersionId: row.entity.datasetVersionId,
        });
      } else {
        await db.tombstones.put({
          productId: favorite.productId,
          lastKnownDisplayName: favorite.lastKnownDisplayName,
          removedAt: new Date(now()).toISOString(),
        });
        await db.favorites.put({ ...favorite, status: 'removed' });
      }
    }
  }

  const preferences: LocalPreferencesStore = {
    listFavorites: async () => {
      await open();
      return requireDatabase().favorites.toArray();
    },
    addFavorite: async (input) => {
      await open();
      const db = requireDatabase();
      const entry: FavoriteEntry = {
        productId: input.productId,
        createdAt: new Date(now()).toISOString(),
        lastKnownDisplayName: input.lastKnownDisplayName,
        lastKnownDatasetVersionId: input.lastKnownDatasetVersionId,
        status: 'unresolved',
      };
      await db.favorites.put(entry);
      const record = await currentGenerationRecord();
      if (record) await reconcilePreferences(record.generationId);
      return (await db.favorites.get(input.productId)) ?? entry;
    },
    removeFavorite: async (productId) => {
      await open();
      const db = requireDatabase();
      await db.favorites.delete(productId);
    },
    listRecentSearches: async () => {
      await open();
      return requireDatabase()
        .recentSearches.orderBy('occurredAt')
        .reverse()
        .toArray();
    },
    addRecentSearch: async (input) => {
      await open();
      const db = requireDatabase();
      const entry: RecentSearchEntry = {
        id: `${new Date(now()).toISOString()}#${input.query}`,
        query: input.query,
        occurredAt: new Date(now()).toISOString(),
        lastKnownDatasetVersionId: input.lastKnownDatasetVersionId,
      };
      await db.recentSearches.put(entry);
      return entry;
    },
    clearRecentSearches: async () => {
      await open();
      await requireDatabase().recentSearches.clear();
    },
    listProductTombstones: async () => {
      await open();
      return requireDatabase().tombstones.toArray();
    },
    clearAllLocalData: async () => {
      await open();
      const db = requireDatabase();
      await db.transaction(
        'rw',
        [
          db.generations,
          db.products,
          db.ingredients,
          db.productIngredients,
          db.atcCodes,
          db.dosageForms,
          db.manufacturers,
          db.holders,
          db.documents,
          db.sources,
          db.datasetVersions,
          db.meta,
          db.favorites,
          db.recentSearches,
          db.tombstones,
        ],
        async () => {
          for (const name of CATALOGUE_STORE_NAMES)
            await catalogueTable(db, name).clear();
          await db.generations.clear();
          await db.meta.clear();
          await db.favorites.clear();
          await db.recentSearches.clear();
          await db.tombstones.clear();
          await db.meta.put(emptyMeta());
        },
      );
      await refresh();
    },
  };

  function createReader(record: GenerationRecord): GenerationReader {
    const generationId = record.generationId;
    addPin(generationId);
    let released = false;
    return {
      generationId,
      generation: toLocalGeneration(record),
      product: async (id: MedicationProductId) =>
        (await requireDatabase().products.get([generationId, id]))?.entity ??
        null,
      ingredient: async (id: ActiveIngredientId) =>
        (await requireDatabase().ingredients.get([generationId, id]))?.entity ??
        null,
      productIngredients: async (productId: MedicationProductId) => {
        const rows = await requireDatabase()
          .productIngredients.where('[generationId+productId]')
          .equals([generationId, productId])
          .toArray();
        return rows.map((row) => row.entity) as MedicationIngredient[];
      },
      productsByNamePrefix: async (prefix: string) => {
        const folded = foldForIndex(prefix);
        const rows = await requireDatabase()
          .products.where('[generationId+nameFolded]')
          .between(
            [generationId, folded],
            [generationId, `${folded}\uffff`],
            true,
            true,
          )
          .toArray();
        return rows.map((row) => row.entity) as MedicationProduct[];
      },
      ingredientsByDciPrefix: async (prefix: string) => {
        const folded = foldForIndex(prefix);
        const rows = await requireDatabase()
          .ingredients.where('[generationId+dciFolded]')
          .between(
            [generationId, folded],
            [generationId, `${folded}\uffff`],
            true,
            true,
          )
          .toArray();
        return rows.map((row) => row.entity) as ActiveIngredient[];
      },
      productsByAtcCode: async (code: string) => {
        const db = requireDatabase();
        const atcRows = await db.atcCodes
          .where('[generationId+code]')
          .equals([generationId, code])
          .toArray();
        const products: MedicationProduct[] = [];
        for (const atc of atcRows) {
          const rows = await db.products
            .where('atcKeys')
            .equals(atcKey(generationId, atc.id))
            .toArray();
          for (const row of rows) products.push(row.entity);
        }
        return products;
      },
      productIds: async () => {
        const rows = await requireDatabase()
          .products.where('generationId')
          .equals(generationId)
          .toArray();
        return rows
          .map((row) => row.entity.id)
          .sort() as readonly MedicationProductId[];
      },
      release: () => {
        if (released) return;
        released = true;
        removePin(generationId);
      },
    };
  }

  async function collectGenerations(): Promise<readonly string[]> {
    await open();
    const db = database;
    if (!db) return [];
    const meta = await db.meta.get('dataset-state');
    const keep = new Set<string>();
    if (meta?.activeGenerationId) keep.add(meta.activeGenerationId);
    if (meta?.previousGenerationId) keep.add(meta.previousGenerationId);
    for (const [generationId, count] of pins)
      if (count > 0) keep.add(generationId);
    const removed: string[] = [];
    for (const record of await db.generations.toArray()) {
      if (keep.has(record.generationId)) continue;
      const abandonedStaging =
        record.status === 'staging' &&
        now() - Date.parse(record.stagedAt) >= STALE_STAGING_MS;
      const expiredReady =
        record.status === 'ready' &&
        record.readyAt !== null &&
        now() - Date.parse(record.readyAt) >= retainReadyForMs;
      if (!abandonedStaging && !expiredReady) continue;
      await deleteGenerationRows(record.generationId);
      removed.push(record.generationId);
    }
    return removed;
  }

  const generations = {
    openReader: async () => {
      await open();
      const record = await currentGenerationRecord();
      return record ? createReader(record) : null;
    },
    openPinnedReader: async (generationId: string) => {
      await open();
      const db = database;
      if (!db) return null;
      const record = await db.generations.get(generationId);
      return record && record.status === 'ready' ? createReader(record) : null;
    },
    rollback: async () => {
      await open();
      const db = database;
      if (!db || !writerLock) return false;
      const outcome = await writerLock.withExclusiveUpdate(async () => {
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
      await reconcilePreferences(outcome.value);
      events.post({ type: 'activated', generationId: outcome.value });
      await refresh();
      return true;
    },
    collect: collectGenerations,
  };

  const store: LocalCatalogueStore = {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    open,
    close: () => {
      unsubscribe?.();
      unsubscribe = null;
      database?.close();
      database = null;
      writerLock = options.lock ?? null;
      opening = null;
      setState({ status: 'opening' });
    },
    updates,
    preferences,
    ...generations,
  };
  void open();
  return store;
}
