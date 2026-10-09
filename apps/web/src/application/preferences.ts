import {
  parseStableId,
  type ClearLocalDataResult,
  type DatasetStateSource,
  type FavoriteEntry,
  type FavoriteStatus,
  type LocalPreferencesStore,
  type ProductTombstone,
  type RecentSearchEntry,
} from '@intermed/domain';

export interface FavoriteListItem extends Omit<FavoriteEntry, 'status'> {
  readonly status: FavoriteStatus | 'not-checkable';
  readonly removedAt: string | null;
}

export interface PreferencesExport {
  readonly format: 'intermed-preferences';
  readonly version: 1;
  readonly exportedAt: string;
  readonly favorites: readonly FavoriteEntry[];
  readonly recentSearches: readonly RecentSearchEntry[];
}

export interface PreferencesExportInput {
  readonly exportedAt: string;
  readonly favorites: readonly FavoriteEntry[];
  readonly recentSearches: readonly RecentSearchEntry[];
}

export interface PreferencesService {
  listFavorites(): Promise<readonly FavoriteListItem[]>;
  isFavorite(productId: string): Promise<boolean>;
  addFavorite(input: {
    readonly productId: FavoriteEntry['productId'];
    readonly lastKnownDisplayName: string;
    readonly lastKnownDatasetVersionId: FavoriteEntry['lastKnownDatasetVersionId'];
  }): Promise<FavoriteEntry>;
  removeFavorite(productId: FavoriteEntry['productId']): Promise<void>;
  listRecentSearches(): Promise<readonly RecentSearchEntry[]>;
  recordOpenedSearch(
    query: string,
    datasetVersionId: string | null,
  ): Promise<RecentSearchEntry>;
  clearRecentSearches(): Promise<void>;
  exportPreferences(exportedAt: string): Promise<PreferencesExport>;
  clearAllLocalData(): Promise<ClearLocalDataResult>;
}

export function buildPreferencesExport(
  input: PreferencesExportInput,
): PreferencesExport {
  return {
    format: 'intermed-preferences',
    version: 1,
    exportedAt: input.exportedAt,
    favorites: input.favorites,
    recentSearches: input.recentSearches,
  };
}

/** Compose local-only preferences without exposing a persistence vendor to UI. */
export function createPreferencesService(
  store: LocalPreferencesStore,
  dataset: DatasetStateSource,
): PreferencesService {
  return {
    listFavorites: async () => {
      const state = dataset.getState();
      const generation = 'generation' in state ? state.generation : null;
      const [favorites, tombstones] = await Promise.all([
        store.listFavorites(),
        store.listProductTombstones(),
      ]);
      const tombstoneByProductId = new Map(
        tombstones.map((tombstone: ProductTombstone) => [
          tombstone.productId,
          tombstone,
        ]),
      );
      return favorites.map((favorite) => {
        const tombstone =
          favorite.status === 'removed'
            ? tombstoneByProductId.get(favorite.productId)
            : undefined;
        return {
          ...favorite,
          status: generation ? favorite.status : 'not-checkable',
          removedAt: tombstone?.removedAt ?? null,
        };
      });
    },
    isFavorite: async (productId) =>
      (await store.listFavorites()).some(
        (favorite) => favorite.productId === productId,
      ),
    addFavorite: (input) => store.addFavorite(input),
    removeFavorite: (productId) => store.removeFavorite(productId),
    listRecentSearches: () => store.listRecentSearches(),
    recordOpenedSearch: (query, datasetVersionId) => {
      const trimmedQuery = query.trim();
      if (!trimmedQuery)
        return Promise.reject(
          new Error('An empty query cannot be saved as a recent search.'),
        );
      const parsedVersion = datasetVersionId
        ? parseStableId('DatasetVersion', datasetVersionId)
        : null;
      return store.addRecentSearch({
        query: trimmedQuery,
        lastKnownDatasetVersionId:
          parsedVersion?.ok === true ? parsedVersion.id : null,
      });
    },
    clearRecentSearches: () => store.clearRecentSearches(),
    exportPreferences: async (exportedAt) => {
      const [favorites, recentSearches] = await Promise.all([
        store.listFavorites(),
        store.listRecentSearches(),
      ]);
      return buildPreferencesExport({
        exportedAt,
        favorites,
        recentSearches,
      });
    },
    clearAllLocalData: () => store.clearAllLocalData(),
  };
}

function unavailable(): Promise<never> {
  return Promise.reject(new Error('Local preferences are unavailable.'));
}

/** Used by isolated view tests that inject dataset state without a local store. */
export const unavailablePreferencesService: PreferencesService = {
  listFavorites: unavailable,
  isFavorite: unavailable,
  addFavorite: unavailable,
  removeFavorite: unavailable,
  listRecentSearches: unavailable,
  recordOpenedSearch: unavailable,
  clearRecentSearches: unavailable,
  exportPreferences: unavailable,
  clearAllLocalData: unavailable,
};
