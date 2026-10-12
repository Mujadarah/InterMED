import { expect, it, vi } from 'vitest';
import {
  deriveStableId,
  type DatasetStateSource,
  type DatasetUpdateState,
  type FavoriteEntry,
  type LocalPreferencesStore,
  type LocalDatasetGeneration,
  type RecentSearchEntry,
} from '@intermed/domain';
import {
  buildPreferencesExport,
  createPreferencesService,
} from './preferences';

const productId = deriveStableId(
  'MedicationProduct',
  'synthetic-source',
  'SP-FICTIVOL',
);
const datasetVersionId = deriveStableId(
  'DatasetVersion',
  'synthetic-source',
  'alpha',
);
const removedProductId = deriveStableId(
  'MedicationProduct',
  'synthetic-source',
  'SP-REMOVED',
);
const unresolvedProductId = deriveStableId(
  'MedicationProduct',
  'synthetic-source',
  'SP-UNRESOLVED',
);
if (
  !productId.ok ||
  !datasetVersionId.ok ||
  !removedProductId.ok ||
  !unresolvedProductId.ok
)
  throw new Error('Synthetic stable ids could not be created');

const favorite: FavoriteEntry = {
  productId: productId.id,
  createdAt: '2026-10-01T00:00:00.000Z',
  lastKnownDisplayName: 'Fictivol alpha',
  lastKnownDatasetVersionId: datasetVersionId.id,
  status: 'available',
};

const recentSearch: RecentSearchEntry = {
  id: '2026-10-02T00:00:00.000Z#fictivol',
  query: 'fictivol',
  occurredAt: '2026-10-02T00:00:00.000Z',
  lastKnownDatasetVersionId: datasetVersionId.id,
};

const generation: LocalDatasetGeneration = {
  generationId: datasetVersionId.id,
  dataset: 'synthetic-medication-catalogue',
  version: 'synthetic-alpha',
  schemaVersion: 'medication-catalogue-1',
  sourceIds: [],
  publishedAt: null,
  importedAt: '2026-10-01T00:00:00.000Z',
  downloadedAt: '2026-10-02T00:00:00.000Z',
  checksum: 'synthetic-checksum',
  coverage: 'Fictional fixtures only.',
  recordCounts: { products: 1 },
  synthetic: true,
};

function dataset(state: DatasetUpdateState): DatasetStateSource {
  return { getState: () => state, subscribe: () => () => {} };
}

function preferences(
  overrides: Partial<LocalPreferencesStore> = {},
): LocalPreferencesStore {
  return {
    listFavorites: async () => [],
    addFavorite: async () => favorite,
    removeFavorite: async () => undefined,
    listRecentSearches: async () => [],
    addRecentSearch: async ({ query, lastKnownDatasetVersionId }) => ({
      id: '2026-10-02T00:00:00.000Z#fictivol',
      query,
      occurredAt: '2026-10-02T00:00:00.000Z',
      lastKnownDatasetVersionId,
    }),
    clearRecentSearches: async () => undefined,
    listProductTombstones: async () => [],
    clearAllLocalData: async () => ({ status: 'cleared' }),
    ...overrides,
  };
}

it('shows tombstone dates and active-generation favorite statuses', async () => {
  const removed: FavoriteEntry = {
    ...favorite,
    productId: removedProductId.id,
    lastKnownDisplayName: 'Placebex alpha',
    status: 'removed',
  };
  const unresolved: FavoriteEntry = {
    ...favorite,
    productId: unresolvedProductId.id,
    lastKnownDisplayName: 'Synthetica alpha',
    status: 'unresolved',
  };
  const store = preferences({
    listFavorites: async () => [favorite, removed, unresolved],
    listProductTombstones: async () => [
      {
        productId: removed.productId,
        lastKnownDisplayName: 'Placebex alpha',
        removedAt: '2026-10-03T12:00:00.000Z',
      },
    ],
  });

  await expect(
    createPreferencesService(
      store,
      dataset({ status: 'ready', generation }),
    ).listFavorites(),
  ).resolves.toEqual([
    { ...favorite, status: 'available', removedAt: null },
    { ...removed, removedAt: '2026-10-03T12:00:00.000Z' },
    { ...unresolved, removedAt: null },
  ]);
});

it('marks favorites not checkable when there is no active dataset', async () => {
  const store = preferences({ listFavorites: async () => [favorite] });
  await expect(
    createPreferencesService(
      store,
      dataset({ status: 'never-downloaded' }),
    ).listFavorites(),
  ).resolves.toEqual([
    { ...favorite, status: 'not-checkable', removedAt: null },
  ]);
});

it('records only a trimmed opened query with the generation that produced it', async () => {
  const addRecentSearch = vi.fn(preferences().addRecentSearch);
  const service = createPreferencesService(
    preferences({ addRecentSearch }),
    dataset({ status: 'ready', generation }),
  );

  await expect(
    service.recordOpenedSearch('  fictivol  ', generation.generationId),
  ).resolves.toEqual(recentSearch);
  expect(addRecentSearch).toHaveBeenCalledWith({
    query: 'fictivol',
    lastKnownDatasetVersionId: datasetVersionId.id,
  });
});

it('builds an export containing only the documented preferences envelope', () => {
  expect(
    buildPreferencesExport({
      exportedAt: '2026-10-09T08:15:30.000Z',
      favorites: [favorite],
      recentSearches: [recentSearch],
    }),
  ).toEqual({
    format: 'intermed-preferences',
    version: 1,
    exportedAt: '2026-10-09T08:15:30.000Z',
    favorites: [favorite],
    recentSearches: [recentSearch],
  });
});

it('preserves storage errors instead of reporting a successful preferences read', async () => {
  const failure = new Error('synthetic local read failure');
  const service = createPreferencesService(
    preferences({
      listRecentSearches: async () => {
        throw failure;
      },
    }),
    dataset({ status: 'never-downloaded' }),
  );

  await expect(service.listRecentSearches()).rejects.toBe(failure);
});
