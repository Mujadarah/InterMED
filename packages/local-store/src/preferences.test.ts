import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { bundle, testClock, testStore, uniqueName } from './test-support';

it('keeps favorites and recent searches through a replacement and a restart', async () => {
  const name = uniqueName();
  const store = testStore({ name });
  const alpha = bundle('alpha');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  await store.preferences.addFavorite({
    productId: alpha.productIds['SP-FICTIVOL']!,
    lastKnownDisplayName: 'Fictivol alpha',
    lastKnownDatasetVersionId: alpha.generationId,
  });
  await store.preferences.addFavorite({
    productId: alpha.productIds['SP-PLACEBEX']!,
    lastKnownDisplayName: 'Placebex alpha',
    lastKnownDatasetVersionId: alpha.generationId,
  });
  await store.preferences.addRecentSearch({
    query: 'fictivol',
    lastKnownDatasetVersionId: alpha.generationId,
  });
  expect(
    (await store.preferences.listFavorites()).map((entry) => entry.status),
  ).toEqual(['available', 'available']);

  const beta = bundle('beta');
  await store.updates.stageAndActivate(beta.manifest, beta.text);
  const replaced = await store.preferences.listFavorites();
  expect(
    replaced.map((entry) => [
      entry.productId,
      entry.status,
      entry.lastKnownDisplayName,
    ]),
  ).toEqual([
    [alpha.productIds['SP-FICTIVOL'], 'available', 'Fictivol beta'],
    [alpha.productIds['SP-PLACEBEX'], 'available', 'Placebex beta'],
  ]);
  expect(replaced[0]?.lastKnownDatasetVersionId).toBe(beta.generationId);

  store.close();
  const restarted = testStore({ name });
  await restarted.open();
  expect(await restarted.preferences.listFavorites()).toHaveLength(2);
  expect(await restarted.preferences.listRecentSearches()).toMatchObject([
    { query: 'fictivol' },
  ]);
  expect(await restarted.preferences.listProductTombstones()).toEqual([]);
});

it('tombstones a removed favorite instead of remapping a similar product', async () => {
  const store = testStore();
  const alpha = bundle('alpha');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  const favorited = [
    alpha.productIds['SP-FICTIVOL']!,
    alpha.productIds['SP-PLACEBEX']!,
  ];
  await store.preferences.addFavorite({
    productId: favorited[0]!,
    lastKnownDisplayName: 'Fictivol alpha',
    lastKnownDatasetVersionId: alpha.generationId,
  });
  await store.preferences.addFavorite({
    productId: favorited[1]!,
    lastKnownDisplayName: 'Placebex alpha',
    lastKnownDatasetVersionId: alpha.generationId,
  });

  // The replacement drops Placebex and publishes a similarly named product
  // under a different stable id. The favorite must not follow it.
  const beta = bundle('beta', {
    products: [
      { key: 'SP-FICTIVOL', name: 'Fictivol' },
      { key: 'SP-PLACEBEX-NEXT', name: 'Placebex' },
    ],
  });
  await store.updates.stageAndActivate(beta.manifest, beta.text);

  const favorites = await store.preferences.listFavorites();
  expect(favorites.map((entry) => [entry.productId, entry.status])).toEqual([
    [favorited[0], 'available'],
    [favorited[1], 'removed'],
  ]);
  expect(favorites.map((entry) => entry.productId).sort()).toEqual(
    [...favorited].sort(),
  );
  expect(await store.preferences.listProductTombstones()).toMatchObject([
    {
      productId: favorited[1],
      lastKnownDisplayName: 'Placebex alpha',
    },
  ]);

  const gamma = bundle('gamma', {
    products: [{ key: 'SP-FICTIVOL', name: 'Fictivol' }],
  });
  await store.updates.stageAndActivate(gamma.manifest, gamma.text);
  expect(await store.preferences.listFavorites()).toHaveLength(2);
  expect(await store.preferences.listProductTombstones()).toHaveLength(1);
});

it('resolves a favorite against the active generation when it is added', async () => {
  const store = testStore();
  const alpha = bundle('alpha');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  const entry = await store.preferences.addFavorite({
    productId: alpha.productIds['SP-FICTIVOL']!,
    lastKnownDisplayName: 'outdated label',
    lastKnownDatasetVersionId: alpha.generationId,
  });
  expect(entry).toMatchObject({
    status: 'available',
    lastKnownDisplayName: 'Fictivol alpha',
  });

  await store.preferences.removeFavorite(alpha.productIds['SP-FICTIVOL']!);
  expect(await store.preferences.listFavorites()).toEqual([]);
  expect(await store.preferences.listProductTombstones()).toEqual([]);
});

it('clears every local dataset and preference record explicitly', async () => {
  const store = testStore();
  const alpha = bundle('alpha');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  await store.preferences.addFavorite({
    productId: alpha.productIds['SP-FICTIVOL']!,
    lastKnownDisplayName: 'Fictivol alpha',
    lastKnownDatasetVersionId: alpha.generationId,
  });
  await store.preferences.addRecentSearch({
    query: 'fictivol',
    lastKnownDatasetVersionId: alpha.generationId,
  });

  await store.preferences.clearAllLocalData();
  expect(store.getState()).toMatchObject({ status: 'never-downloaded' });
  expect(await store.preferences.listFavorites()).toEqual([]);
  expect(await store.preferences.listRecentSearches()).toEqual([]);
  expect(await store.preferences.listProductTombstones()).toEqual([]);
  expect(await store.openReader()).toBeNull();
});

it('orders recent searches by recency and can clear them', async () => {
  const clock = testClock();
  const store = testStore({ now: clock.now });
  await store.preferences.addRecentSearch({
    query: 'fictivol',
    lastKnownDatasetVersionId: null,
  });
  clock.tick(1000);
  await store.preferences.addRecentSearch({
    query: 'placebex',
    lastKnownDatasetVersionId: null,
  });
  expect(
    (await store.preferences.listRecentSearches()).map((entry) => entry.query),
  ).toEqual(['placebex', 'fictivol']);
  await store.preferences.clearRecentSearches();
  expect(await store.preferences.listRecentSearches()).toEqual([]);
});
