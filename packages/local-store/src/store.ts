import type {
  DatasetUpdateFailureReason,
  DatasetUpdateState,
  LocalCatalogueStore,
  LocalDatasetGeneration,
} from '@intermed/domain';
import { createDefaultEventBus, type DatasetEventBus } from './events';
import { isQuotaError, isVersionError, readOnDiskSchema } from './introspect';
import { attachConnectionLifecycle } from './lifecycle';
import { createWriterLock, type DatasetWriterLock } from './locks';
import {
  createMaintenanceRunner,
  type MaintenanceDiagnostics,
  type MaintenanceTask,
  type MaintenanceRunner,
} from './maintenance';
import { createPreferences } from './preferences';
import { createRetention } from './retention';
import {
  LOCAL_DATASET_DB_NAME,
  LOCAL_DATASET_SCHEMA_GENERATION,
  LocalDatasetDatabase,
  catalogueTable,
  emptyMeta,
  toLocalGeneration,
  type CatalogueStoreName,
  type GenerationRecord,
} from './schema';
import { createUpdatePipeline } from './update-pipeline';
import type {
  PublishedBundleLoader,
  PublishedDatasetReader,
} from '@intermed/domain';

/**
 * The local dataset store: the public facade that composes the update
 * pipeline (`update-pipeline.ts`), local preferences (`preferences.ts`),
 * retention and readers (`retention.ts`) and post-commit maintenance
 * (`maintenance.ts`) around one small state machine.
 */

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
  /**
   * Diagnostics/test seam invoked at the start of each maintenance task
   * (preference reconciliation, generation collection), wherever it runs.
   * Throwing simulates a failure inside that task, for example a
   * `QuotaExceededError` while a tombstone is written.
   */
  readonly onMaintenance?: (task: MaintenanceTask) => void | Promise<void>;
}

/**
 * The local dataset store plus its maintenance diagnostics. Post-commit
 * maintenance (preference reconciliation, generation collection) runs in
 * isolation and reports here; it can never fail a committed activation.
 */
export interface LocalDatasetStore extends LocalCatalogueStore {
  readonly maintenance: MaintenanceDiagnostics;
}

/** Ask for persistent storage as best effort. Never a permanence claim. */
async function requestPersistentStorage(): Promise<void> {
  try {
    // The DOM types say navigator and its storage manager always exist and
    // are complete; some profiles disagree, which is what these checks guard.
    const navigator = globalThis.navigator as Navigator | undefined;
    const storage = navigator?.storage as Partial<StorageManager> | undefined;
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
): LocalDatasetStore {
  const databaseName = options.name ?? LOCAL_DATASET_DB_NAME;
  const dataset = options.dataset ?? DEFAULT_DATASET_KEY;
  const now = options.now ?? (() => Date.now());
  const retainReadyForMs = options.retainReadyForMs ?? RETAIN_READY_FOR_MS;
  const events = options.events ?? createDefaultEventBus();
  const owner = `intermed-tab-${crypto.randomUUID()}`;

  const listeners = new Set<() => void>();
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
    // The pointer is only worth following while its rows are all there.
    if (
      !(await retention.countsMatch(generation, (name) =>
        catalogueTable(db, name),
      ))
    )
      return { status: 'evicted', generationId: activeGenerationId };
    return { status: 'ready', generation: toLocalGeneration(generation) };
  }

  const refresh = async (): Promise<DatasetUpdateState> =>
    setState(await baseState());

  async function currentGenerationRecord(): Promise<GenerationRecord | null> {
    const db = database;
    if (!db) return null;
    const record = await db.meta.get('dataset-state');
    const activeGenerationId = record?.activeGenerationId ?? null;
    if (!activeGenerationId) return null;
    const generation = await db.generations.get(activeGenerationId);
    if (!generation || generation.status !== 'ready') return null;
    // An evicted generation counts as absent: it must be re-downloaded
    // instead of skipped as the version already present (Greptile G7).
    if (
      !(await retention.countsMatch(generation, (name) =>
        catalogueTable(db, name),
      ))
    )
      return null;
    return generation;
  }

  async function ensureMetaRecord(): Promise<void> {
    const db = requireDatabase();
    await db.transaction('rw', db.meta, async () => {
      const record = await db.meta.get('dataset-state');
      if (!record) await db.meta.put(emptyMeta());
    });
  }

  /** The clear epoch persisted in meta; bumped by every completed clear. */
  async function readClearEpoch(): Promise<number> {
    const db = database;
    if (!db) return 0;
    const meta = await db.meta.get('dataset-state');
    return meta?.clearEpoch ?? 0;
  }

  const maintenance: MaintenanceRunner = createMaintenanceRunner({
    now,
    isQuotaError,
  });

  const open = (): Promise<DatasetUpdateState> => (opening ??= openDatabase());

  const retention = createRetention({
    now,
    retainReadyForMs,
    staleStagingMs: STALE_STAGING_MS,
    database: () => database,
    requireDatabase,
    onMaintenance: options.onMaintenance,
    background: (label, work) => maintenance.background(label, work),
    writerLock: () => writerLock,
  });

  const preferences = createPreferences({
    now,
    database: () => database,
    requireDatabase,
    open,
    currentGenerationRecord,
    writerLock: () => writerLock,
    events,
    refresh,
    onMaintenance: options.onMaintenance,
  });

  const pipeline = createUpdatePipeline({
    dataset,
    now,
    reader: options.reader,
    loader: options.loader,
    onStaged: options.onStaged,
    onMaintenance: options.onMaintenance,
    database: () => database,
    requireDatabase,
    open,
    state: () => state,
    writerLock: () => writerLock,
    events,
    readClearEpoch,
    currentGenerationRecord,
    setState,
    refresh,
    writeStatus,
    fail,
    maintenance,
    retention,
    preferences,
  });

  async function openDatabase(): Promise<DatasetUpdateState> {
    await requestPersistentStorage();
    // The DOM types say indexedDB always exists; some browsers do not expose
    // it at all, which is what this check guards.
    const factory = globalThis.indexedDB as IDBFactory | undefined;
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
    unsubscribe ??= events.subscribe(() => {
      // Any cross-tab change - an activation or a completed clear - is applied
      // at a safe boundary by re-reading the persisted state.
      maintenance.background('cross-tab refresh', refresh);
    });
    try {
      await ensureMetaRecord();
      // A crash can leave a half-written staging generation; the next open
      // that can take the writer lease removes it before anything else.
      await maintenance.run(
        { kind: 'generation-gc' },
        retention.cleanupIncompleteStaging,
      );
      // A crash may have interrupted the post-commit reconciliation of the
      // active generation: the marker in meta names the one it finished for.
      await catchUpReconciliation();
      return await refresh();
    } catch (error) {
      // The connection cannot be used: close it, report why, and leave the
      // open retryable instead of caching a rejected promise (Greptile G8).
      database = null;
      db.close();
      opening = null;
      return setState(
        isQuotaError(error)
          ? { status: 'storage-quota', generation: null }
          : { status: 'storage-restricted' },
      );
    }
  }

  /** Reconcile preferences the active generation never was reconciled for. */
  async function catchUpReconciliation(): Promise<void> {
    const db = database;
    if (!db) return;
    const meta = await db.meta.get('dataset-state');
    const activeGenerationId = meta?.activeGenerationId ?? null;
    if (!activeGenerationId) return;
    if (meta?.reconciledGenerationId === activeGenerationId) return;
    await maintenance.run(
      { kind: 'preference-reconciliation', generationId: activeGenerationId },
      () => preferences.reconcilePreferences(activeGenerationId),
    );
  }

  const store: LocalDatasetStore = {
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
    updates: pipeline.updates,
    preferences: preferences.store,
    maintenance,
    openReader: async () => {
      await open();
      const record = await currentGenerationRecord();
      return record ? retention.pinnedReader(record) : null;
    },
    openPinnedReader: async (generationId: string) => {
      await open();
      // The pin is taken before the reader is validated (Greptile G2).
      return retention.openPinned(generationId);
    },
    rollback: pipeline.rollback,
    collect: async () => {
      await open();
      return retention.collectUnderLock();
    },
  };
  maintenance.background('initial open', open);
  return store;
}

export type {
  MaintenanceDiagnostics,
  MaintenanceFailure,
  MaintenanceStatus,
  MaintenanceTask,
} from './maintenance';
