import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import type { PublishedBundleLoader } from '@intermed/domain';
import {
  bundle,
  fakePublishedSource,
  sharedBus,
  testClock,
  testDatabase,
  testMarkerLock,
  testStore,
  uniqueName,
} from './test-support';

/** Lease TTL the clear tests pin on their marker locks (see `testMarkerLock`). */
const LEASE_TTL_MS = 60_000;

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

it('refuses clear-all while another tab is staging instead of racing it', async () => {
  const name = uniqueName();
  let reached: () => void = () => {};
  let release: () => void = () => {};
  const reachedStaging = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writer = testStore({
    name,
    onStaged: async ({ store }) => {
      if (store === 'ingredients') {
        reached();
        await blocked;
      }
    },
  });
  const other = testStore({ name });
  const alpha = bundle('alpha');
  await other.preferences.addFavorite({
    productId: alpha.productIds['SP-FICTIVOL']!,
    lastKnownDisplayName: 'Fictivol alpha',
    lastKnownDatasetVersionId: alpha.generationId,
  });

  const running = writer.updates.stageAndActivate(alpha.manifest, alpha.text);
  await reachedStaging;
  const cleared = await other.preferences.clearAllLocalData();

  release();
  await running;
  expect(writer.getState()).toMatchObject({
    status: 'ready',
    generation: { generationId: alpha.generationId },
  });
  expect(await other.openPinnedReader(alpha.generationId)).not.toBeNull();
  expect(await other.preferences.listFavorites()).toHaveLength(1);
  expect(cleared).toEqual({ status: 'refused', reason: 'writer-busy' });

  // Once the writer is done, the same clear runs under the writer lease.
  expect(await other.preferences.clearAllLocalData()).toEqual({
    status: 'cleared',
  });
  expect(other.getState()).toMatchObject({ status: 'never-downloaded' });
  expect(await other.preferences.listFavorites()).toEqual([]);
  expect(await other.openReader()).toBeNull();
});

it('aborts staging cleanly when the local data is cleared underneath it', async () => {
  const name = uniqueName();
  const clock = testClock();
  const stalled = await testMarkerLock(name, clock.now, {
    ttlMs: LEASE_TTL_MS,
  });
  let reached: () => void = () => {};
  let release: () => void = () => {};
  const reachedStaging = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writer = testStore({
    name,
    now: clock.now,
    lock: stalled.lock,
    onStaged: async ({ store }) => {
      if (store === 'ingredients') {
        reached();
        await blocked;
      }
    },
  });
  const clearer = testStore({ name, now: clock.now });
  const alpha = bundle('alpha');

  const running = writer.updates.stageAndActivate(alpha.manifest, alpha.text);
  await reachedStaging;
  // The stalled writer's lease expires, so the clear may take the writer lock
  // and complete while staging is between two write batches.
  clock.tick(LEASE_TTL_MS + 1_000);
  const cleared = await clearer.preferences.clearAllLocalData();
  release();

  await expect(running).resolves.toMatchObject({
    status: 'update-failed',
    reason: 'local-data-cleared',
  });
  // The aborted staging left no orphaned rows and no generation record behind.
  expect(await stalled.db.generations.get(alpha.generationId)).toBeUndefined();
  expect(
    await stalled.db.products
      .where('generationId')
      .equals(alpha.generationId)
      .count(),
  ).toBe(0);
  expect(await clearer.openReader()).toBeNull();
  expect(clearer.getState()).toMatchObject({ status: 'never-downloaded' });
  expect(cleared).toEqual({ status: 'cleared' });
});

it('clears the tombstone when a tombstoned product comes back', async () => {
  const store = testStore();
  const alpha = bundle('alpha');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  await store.preferences.addFavorite({
    productId: alpha.productIds['SP-FICTIVOL']!,
    lastKnownDisplayName: 'Fictivol alpha',
    lastKnownDatasetVersionId: alpha.generationId,
  });

  // Generation 2 drops the product: the favorite is tombstoned.
  const beta = bundle('beta', {
    products: [{ key: 'SP-PLACEBEX', name: 'Placebex' }],
  });
  await store.updates.stageAndActivate(beta.manifest, beta.text);
  expect(await store.preferences.listProductTombstones()).toHaveLength(1);
  expect((await store.preferences.listFavorites())[0]).toMatchObject({
    status: 'removed',
  });

  // Generation 3 publishes the same stable product id again: the tombstone is
  // gone and the favorite is available again. A similar product under another
  // id is never adopted.
  const gamma = bundle('gamma', {
    products: [
      { key: 'SP-FICTIVOL', name: 'Fictivol' },
      { key: 'SP-PLACEBEX', name: 'Placebex' },
    ],
  });
  await store.updates.stageAndActivate(gamma.manifest, gamma.text);
  expect(await store.preferences.listProductTombstones()).toEqual([]);
  expect((await store.preferences.listFavorites())[0]).toMatchObject({
    status: 'available',
    lastKnownDisplayName: 'Fictivol gamma',
    lastKnownDatasetVersionId: gamma.generationId,
  });
});

it('drops a superseded reconciliation retry instead of overwriting newer favorites', async () => {
  const alpha = bundle('alpha');
  const beta = bundle('beta', {
    products: [{ key: 'SP-PLACEBEX', name: 'Placebex' }],
  });
  const gamma = bundle('gamma');
  let failBeta = false;
  const store = testStore({
    onMaintenance: (task) => {
      if (
        failBeta &&
        task.kind === 'preference-reconciliation' &&
        task.generationId === beta.generationId
      )
        throw new Error('Synthetic interruption');
    },
  });
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  await store.preferences.addFavorite({
    productId: alpha.productIds['SP-FICTIVOL']!,
    lastKnownDisplayName: 'Fictivol alpha',
    lastKnownDatasetVersionId: alpha.generationId,
  });

  // Beta drops the product and its reconciliation fails, so it stays queued.
  failBeta = true;
  await store.updates.stageAndActivate(beta.manifest, beta.text);
  expect(store.maintenance.getStatus().pending).toBe(true);

  // Gamma publishes the product again and reconciles it as available.
  failBeta = false;
  await store.updates.stageAndActivate(gamma.manifest, gamma.text);
  expect((await store.preferences.listFavorites())[0]).toMatchObject({
    status: 'available',
    lastKnownDisplayName: 'Fictivol gamma',
  });

  // The queued retry belongs to a superseded generation: running it must not
  // write beta's tombstones and names over gamma's reconciliation.
  await store.maintenance.retry();
  expect((await store.preferences.listFavorites())[0]).toMatchObject({
    status: 'available',
    lastKnownDisplayName: 'Fictivol gamma',
  });
  expect(await store.preferences.listProductTombstones()).toEqual([]);
  expect(store.maintenance.getStatus().pending).toBe(false);
});

it('keeps reconciling other favorites when one product fails', async () => {
  const name = uniqueName();
  const alpha = bundle('alpha');
  const beta = bundle('beta', {
    products: [{ key: 'SP-SYNTHETICA', name: 'Synthetica' }],
  });
  const clock = testClock();
  let failNext = false;
  const now = () => {
    // The first tombstone write after the activation broadcast is poisoned:
    // that one product fails while the next one must still be reconciled.
    if (failNext) {
      failNext = false;
      throw Object.assign(new Error('Synthetic quota'), {
        name: 'QuotaExceededError',
      });
    }
    return clock.now();
  };
  const events = sharedBus();
  let broadcasts = 0;
  events.subscribe(() => {
    broadcasts += 1;
    failNext = broadcasts === 2;
  });
  const store = testStore({ name, events, now });
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

  await store.updates.stageAndActivate(beta.manifest, beta.text);
  // The first favorite's item failed; the second one was still reconciled.
  expect(
    (await store.preferences.listFavorites()).map((entry) => [
      entry.productId,
      entry.status,
    ]),
  ).toEqual([
    [alpha.productIds['SP-FICTIVOL'], 'available'],
    [alpha.productIds['SP-PLACEBEX'], 'removed'],
  ]);
  expect(
    (await store.preferences.listProductTombstones()).map(
      (row) => row.productId,
    ),
  ).toEqual([alpha.productIds['SP-PLACEBEX']]);

  // The failure is reported and the generation is not marked reconciled, so
  // the work stays pending and is retried later.
  expect(store.maintenance.getStatus()).toMatchObject({
    pending: true,
    lastFailure: { reason: 'storage-quota' },
  });
  const meta = (await (await testDatabase(name)).meta.get('dataset-state'))!;
  expect(meta.reconciledGenerationId).not.toBe(beta.generationId);

  await store.maintenance.retry();
  expect(store.maintenance.getStatus().pending).toBe(false);
  expect(
    (await store.preferences.listFavorites()).map((entry) => entry.status),
  ).toEqual(['removed', 'removed']);
  expect(await store.preferences.listProductTombstones()).toHaveLength(2);
});

it('keeps a favorite removed that was deleted while reconciliation ran', async () => {
  const alpha = bundle('alpha');
  const beta = bundle('beta', {
    products: [{ key: 'SP-PLACEBEX', name: 'Placebex' }],
  });
  const clock = testClock();
  let armed = false;
  let removeFavorite: () => void = () => {};
  const now = () => {
    // The first clock read after the activation broadcast is the tombstone
    // write of the post-commit reconciliation: that is when the favorite is
    // removed from another code path.
    if (armed) {
      armed = false;
      removeFavorite();
    }
    return clock.now();
  };
  const events = sharedBus();
  let broadcasts = 0;
  events.subscribe(() => {
    broadcasts += 1;
    // The second activation broadcast is the one whose reconciliation must
    // interleave with the removal.
    armed = broadcasts === 2;
  });
  const store = testStore({ name: uniqueName(), events, now });
  removeFavorite = () => {
    void store.preferences.removeFavorite(alpha.productIds['SP-FICTIVOL']!);
  };
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  await store.preferences.addFavorite({
    productId: alpha.productIds['SP-FICTIVOL']!,
    lastKnownDisplayName: 'Fictivol alpha',
    lastKnownDatasetVersionId: alpha.generationId,
  });

  await store.updates.stageAndActivate(beta.manifest, beta.text);
  expect(await store.preferences.listFavorites()).toEqual([]);
  expect(await store.preferences.listProductTombstones()).toMatchObject([
    { productId: alpha.productIds['SP-FICTIVOL'] },
  ]);
});

it('never lets a download resume into a completed clear', async () => {
  const name = uniqueName();
  const clock = testClock();
  const stalled = await testMarkerLock(name, clock.now, {
    ttlMs: LEASE_TTL_MS,
  });
  const alpha = bundle('alpha');
  let reachedLoad: () => void = () => {};
  let releaseBundle: () => void = () => {};
  const loadReached = new Promise<void>((resolve) => {
    reachedLoad = resolve;
  });
  const bundleHeld = new Promise<void>((resolve) => {
    releaseBundle = resolve;
  });
  const source = fakePublishedSource(alpha);
  const loader: PublishedBundleLoader = {
    loadBundle: async (descriptor) => {
      const result = await source.loader.loadBundle(descriptor);
      reachedLoad();
      await bundleHeld;
      return result;
    },
  };
  const writer = testStore({
    name,
    now: clock.now,
    lock: stalled.lock,
    reader: source.reader,
    loader,
  });
  const clearer = testStore({ name, now: clock.now });

  const running = writer.updates.downloadAndActivate();
  await loadReached;
  // The download waits for the bundle while its lease expires; the clear takes
  // the writer lock and completes.
  clock.tick(LEASE_TTL_MS + 1_000);
  const cleared = await clearer.preferences.clearAllLocalData();
  releaseBundle();

  await expect(running).resolves.toMatchObject({ status: 'never-downloaded' });
  expect(writer.getState()).toMatchObject({ status: 'never-downloaded' });
  expect(await stalled.db.generations.toArray()).toEqual([]);
  expect(
    await stalled.db.products
      .where('generationId')
      .equals(alpha.generationId)
      .count(),
  ).toBe(0);
  expect(cleared).toEqual({ status: 'cleared' });
});
