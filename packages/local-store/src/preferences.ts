/**
 * Local preferences: favorites, recent searches, tombstones and the explicit
 * clear-all. They live outside dataset generations, use stable product ids and
 * migrate independently of catalogue replacement (requirements 90-92, 78).
 */
import type {
  ClearLocalDataResult,
  FavoriteEntry,
  LocalPreferencesStore,
  RecentSearchEntry,
} from '@intermed/domain';
import type { DatasetEventBus } from './events';
import { isQuotaError } from './introspect';
import type { DatasetWriterLock } from './locks';
import type { MaintenanceTask } from './maintenance';
import {
  CATALOGUE_STORE_NAMES,
  catalogueTables,
  emptyMeta,
  scopedCatalogueTable,
  type GenerationRecord,
  type LocalDatasetDatabase,
} from './schema';

/** Everything preference handling needs from the rest of the store. */
export interface PreferencesDeps {
  readonly now: () => number;
  readonly database: () => LocalDatasetDatabase | null;
  readonly requireDatabase: () => LocalDatasetDatabase;
  readonly open: () => Promise<unknown>;
  readonly currentGenerationRecord: () => Promise<GenerationRecord | null>;
  readonly writerLock: () => DatasetWriterLock | null;
  readonly events: DatasetEventBus;
  readonly refresh: () => Promise<unknown>;
  /** Diagnostics/test seam invoked at the start of a reconciliation. */
  readonly onMaintenance?:
    ((task: MaintenanceTask) => void | Promise<void>) | undefined;
}

export interface Preferences {
  reconcilePreferences(generationId: string): Promise<void>;
  readonly store: LocalPreferencesStore;
}

export function createPreferences(deps: PreferencesDeps): Preferences {
  /**
   * Make the local favorites match one generation: stable id lookups only, in
   * one read-modify-write transaction (Greptile review fix G5), per-item
   * failures isolated (Codacy review fix 3).
   */
  async function reconcilePreferences(generationId: string): Promise<void> {
    await deps.onMaintenance?.({
      kind: 'preference-reconciliation',
      generationId,
    });
    const db = deps.requireDatabase();
    const failures: string[] = [];
    let quotaFailure = false;
    await db.transaction(
      'rw',
      [db.favorites, db.tombstones, db.products, db.meta],
      async (transaction) => {
        // The target is re-read inside the transaction: a queued retry for a
        // superseded generation must never write its older view over the
        // reconciliation of the generation that replaced it (Greptile round 2
        // finding 1).
        const meta = await transaction.meta.get('dataset-state');
        const active = meta?.activeGenerationId ?? null;
        if (active !== generationId) return;
        const favorites = await transaction.favorites.toArray();
        for (const favorite of favorites) {
          // One product's failure must never stop the others (Codacy item 3).
          try {
            // Stable product id lookup: a favorite is never remapped.
            const row = await transaction.products.get([
              generationId,
              favorite.productId,
            ]);
            if (row) {
              await transaction.favorites.update(favorite.productId, {
                status: 'available',
                lastKnownDisplayName: row.entity.commercialName,
                lastKnownDatasetVersionId: row.entity.datasetVersionId,
              });
              // The same stable product id is back: its tombstone is stale
              // (Codacy review fix 2).
              await transaction.tombstones.delete(favorite.productId);
            } else {
              await transaction.tombstones.put({
                productId: favorite.productId,
                lastKnownDisplayName: favorite.lastKnownDisplayName,
                removedAt: new Date(deps.now()).toISOString(),
              });
              // Only rows that still exist are updated: a favorite removed
              // while this ran stays removed.
              await transaction.favorites.update(favorite.productId, {
                status: 'removed',
              });
            }
          } catch (error) {
            failures.push(favorite.productId);
            if (isQuotaError(error)) quotaFailure = true;
          }
        }
        // Only a complete run marks the generation reconciled; a partial one
        // is left for the retry (Codacy item 3, Greptile review fix G6).
        if (failures.length === 0)
          await transaction.meta.update('dataset-state', {
            reconciledGenerationId: generationId,
          });
      },
    );
    if (failures.length > 0) {
      // Thrown only after the transaction committed: the reconciled items are
      // kept, and the task is reported and retried.
      throw Object.assign(
        new Error(
          `Preference reconciliation failed for ${failures.length} product(s): ${failures.join(', ')}`,
        ),
        quotaFailure ? { name: 'QuotaExceededError' } : {},
      );
    }
  }

  const store: LocalPreferencesStore = {
    listFavorites: async () => {
      await deps.open();
      return deps.requireDatabase().favorites.toArray();
    },
    addFavorite: async (input) => {
      await deps.open();
      const db = deps.requireDatabase();
      const entry: FavoriteEntry = {
        productId: input.productId,
        createdAt: new Date(deps.now()).toISOString(),
        lastKnownDisplayName: input.lastKnownDisplayName,
        lastKnownDatasetVersionId: input.lastKnownDatasetVersionId,
        status: 'unresolved',
      };
      await db.favorites.put(entry);
      const record = await deps.currentGenerationRecord();
      if (record) await reconcilePreferences(record.generationId);
      return (await db.favorites.get(input.productId)) ?? entry;
    },
    removeFavorite: async (productId) => {
      await deps.open();
      await deps.requireDatabase().favorites.delete(productId);
    },
    listRecentSearches: async () => {
      await deps.open();
      return deps
        .requireDatabase()
        .recentSearches.orderBy('occurredAt')
        .reverse()
        .toArray();
    },
    addRecentSearch: async (input) => {
      await deps.open();
      const db = deps.requireDatabase();
      const entry: RecentSearchEntry = {
        id: `${new Date(deps.now()).toISOString()}#${input.query}`,
        query: input.query,
        occurredAt: new Date(deps.now()).toISOString(),
        lastKnownDatasetVersionId: input.lastKnownDatasetVersionId,
      };
      await db.recentSearches.put(entry);
      return entry;
    },
    clearRecentSearches: async () => {
      await deps.open();
      await deps.requireDatabase().recentSearches.clear();
    },
    listProductTombstones: async () => {
      await deps.open();
      return deps.requireDatabase().tombstones.toArray();
    },
    clearAllLocalData: async (): Promise<ClearLocalDataResult> => {
      await deps.open();
      const db = deps.database();
      const writerLock = deps.writerLock();
      if (!db || !writerLock) return { status: 'cleared' };
      // Clearing is a writer operation: it is refused instead of racing the
      // staging or activation of another tab (Codex review fix #4).
      const outcome = await writerLock.withExclusiveUpdate(async (lease) =>
        db.transaction(
          'rw',
          [
            db.generations,
            db.meta,
            db.writerLock,
            db.favorites,
            db.recentSearches,
            db.tombstones,
            ...catalogueTables(db),
          ],
          async (transaction) => {
            if (!(await lease.revalidate(transaction.writerLock))) return false;
            const meta =
              (await transaction.meta.get('dataset-state')) ?? emptyMeta();
            for (const name of CATALOGUE_STORE_NAMES)
              await scopedCatalogueTable(transaction, name).clear();
            await transaction.generations.clear();
            await transaction.meta.clear();
            await transaction.favorites.clear();
            await transaction.recentSearches.clear();
            await transaction.tombstones.clear();
            // The bumped clear epoch invalidates every update already in
            // flight: a completed clear can never be undone (Greptile G4).
            await transaction.meta.put({
              ...emptyMeta(),
              clearEpoch: (meta.clearEpoch ?? 0) + 1,
            });
            return true;
          },
        ),
      );
      if (!outcome.ok || !outcome.value)
        return { status: 'refused', reason: 'writer-busy' };
      await deps.refresh();
      // Other tabs hold their own view of the state (Codex review fix #5).
      deps.events.post({ type: 'cleared' });
      return { status: 'cleared' };
    },
  };

  return { reconcilePreferences, store };
}
