import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import { RETAIN_READY_FOR_MS, STALE_STAGING_MS } from './store';
import {
  bundle,
  testClock,
  testDatabase,
  testMarkerLock,
  testStore,
  uniqueName,
} from './test-support';

it('pins one generation per reader and switches only at the next reader', async () => {
  const store = testStore();
  const alpha = bundle('alpha');
  const beta = bundle('beta');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  const pinned = (await store.openReader())!;
  expect(pinned.generationId).toBe(alpha.generationId);

  await store.updates.stageAndActivate(beta.manifest, beta.text);
  expect(
    (await pinned.product(alpha.productIds['SP-FICTIVOL']!))?.commercialName,
  ).toBe('Fictivol alpha');
  expect(pinned.generationId).toBe(alpha.generationId);

  const next = (await store.openReader())!;
  expect(next.generationId).toBe(beta.generationId);
  expect(
    (await next.product(alpha.productIds['SP-FICTIVOL']!))?.commercialName,
  ).toBe('Fictivol beta');
  pinned.release();
  next.release();
});

it('rolls back to the retained previous generation', async () => {
  const store = testStore();
  const alpha = bundle('alpha');
  const beta = bundle('beta');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  await store.updates.stageAndActivate(beta.manifest, beta.text);
  expect(store.getState()).toMatchObject({
    generation: { generationId: beta.generationId },
  });

  await expect(store.rollback()).resolves.toBe(true);
  expect(store.getState()).toMatchObject({
    status: 'ready',
    generation: { generationId: alpha.generationId },
  });
  const reader = (await store.openReader())!;
  expect(
    (await reader.product(alpha.productIds['SP-FICTIVOL']!))?.commercialName,
  ).toBe('Fictivol alpha');

  await expect(store.rollback()).resolves.toBe(true);
  expect(store.getState()).toMatchObject({
    generation: { generationId: beta.generationId },
  });
});

it('collects expired generations but never active, previous or pinned ones', async () => {
  const clock = testClock();
  const store = testStore({ now: clock.now, retainReadyForMs: 0 });
  const alpha = bundle('alpha');
  const beta = bundle('beta');
  const gamma = bundle('gamma');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  const pinned = (await store.openReader())!;

  await store.updates.stageAndActivate(beta.manifest, beta.text);
  await store.updates.stageAndActivate(gamma.manifest, gamma.text);
  expect(await store.collect()).not.toContain(alpha.generationId);
  const alsoPinned = await store.openPinnedReader(alpha.generationId);
  expect(alsoPinned).not.toBeNull();

  alsoPinned!.release();
  pinned.release();
  expect(await store.collect()).toEqual([alpha.generationId]);
  expect(await store.openPinnedReader(alpha.generationId)).toBeNull();
  expect(await store.openPinnedReader(beta.generationId)).not.toBeNull();
  expect(store.getState()).toMatchObject({
    generation: { generationId: gamma.generationId },
  });
});

it('retains ready generations inside the conservative cross-tab window', async () => {
  const clock = testClock();
  const store = testStore({ now: clock.now });
  const alpha = bundle('alpha');
  const beta = bundle('beta');
  const gamma = bundle('gamma');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  await store.updates.stageAndActivate(beta.manifest, beta.text);
  await store.updates.stageAndActivate(gamma.manifest, gamma.text);

  expect(await store.collect()).toEqual([]);
  clock.tick(RETAIN_READY_FOR_MS);
  expect(await store.collect()).toEqual([alpha.generationId]);
  expect(await store.openPinnedReader(beta.generationId)).not.toBeNull();
});

it('restarts the retention window when a rollback reactivates a generation', async () => {
  const clock = testClock();
  const name = uniqueName();
  const tabA = testStore({ name, now: clock.now });
  const tabB = testStore({ name, now: clock.now });
  const rows = await testDatabase(name);
  const alpha = bundle('alpha');
  await tabA.updates.stageAndActivate(alpha.manifest, alpha.text);
  const firstReadyAt = (await rows.generations.get(alpha.generationId))
    ?.readyAt;

  // Alpha is a full day old when the rollback makes it active again.
  clock.tick(RETAIN_READY_FOR_MS + 60 * 60 * 1000);
  const beta = bundle('beta');
  await tabA.updates.stageAndActivate(beta.manifest, beta.text);
  await expect(tabA.rollback()).resolves.toBe(true);
  // `readyAt` keeps the original staging-to-ready time; the retention window
  // is anchored on the new activation instead.
  expect((await rows.generations.get(alpha.generationId))?.readyAt).toBe(
    firstReadyAt,
  );

  // Another tab pins alpha right after the rollback; its pin is invisible to
  // this tab's collection, so the retention window is what protects alpha.
  expect(await tabB.openPinnedReader(alpha.generationId)).not.toBeNull();
  const gamma = bundle('gamma');
  const delta = bundle('delta');
  await tabA.updates.stageAndActivate(gamma.manifest, gamma.text);
  await tabA.updates.stageAndActivate(delta.manifest, delta.text);

  clock.tick(60 * 60 * 1000);
  expect(await tabA.collect()).not.toContain(alpha.generationId);
  expect(await tabB.openPinnedReader(alpha.generationId)).not.toBeNull();

  // The window is not endless: one window after the rollback it expires.
  clock.tick(RETAIN_READY_FOR_MS);
  expect(await tabA.collect()).toContain(alpha.generationId);
});

it('refuses collection while another tab is staging instead of deleting under it', async () => {
  const clock = testClock();
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
    now: clock.now,
    // The simulated clock runs past the staging grace period inside one tick,
    // so the writer keeps a lease that outlives it.
    lock: (await testMarkerLock(name, clock.now, { ttlMs: 4 * 60 * 60 * 1000 }))
      .lock,
    onStaged: async ({ store }) => {
      if (store === 'ingredients') {
        reached();
        await blocked;
      }
    },
  });
  const other = testStore({ name, now: clock.now });
  const alpha = bundle('alpha');

  const running = writer.updates.stageAndActivate(alpha.manifest, alpha.text);
  await reachedStaging;
  // The staging run is long enough to look abandoned to a stale snapshot.
  clock.tick(STALE_STAGING_MS + 1_000);
  expect(await other.collect()).toEqual([]);

  release();
  await running;
  expect(writer.getState()).toMatchObject({
    status: 'ready',
    generation: { generationId: alpha.generationId },
  });
  expect(await other.openPinnedReader(alpha.generationId)).not.toBeNull();
});

it('honours a pin taken while collection is running', async () => {
  const clock = testClock();
  const alpha = bundle('alpha');
  const beta = bundle('beta');
  let armed = false;
  let pinning: Promise<unknown> | null = null;
  const store = testStore({
    retainReadyForMs: 0,
    now: () => {
      // The first clock read inside collection happens after its snapshot of
      // generations: that is when another reader pins the second candidate.
      if (armed) {
        armed = false;
        pinning = store.openPinnedReader(beta.generationId);
      }
      return clock.now();
    },
  });
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  const heldAlpha = (await store.openPinnedReader(alpha.generationId))!;
  await store.updates.stageAndActivate(beta.manifest, beta.text);
  const heldBeta = (await store.openPinnedReader(beta.generationId))!;
  await store.updates.stageAndActivate(
    bundle('gamma').manifest,
    bundle('gamma').text,
  );
  await store.updates.stageAndActivate(
    bundle('delta').manifest,
    bundle('delta').text,
  );
  // Both generations are expired and unkept now; their pins kept them alive.
  heldAlpha.release();
  heldBeta.release();

  armed = true;
  const collecting = store.collect();
  await vi.waitFor(() => expect(pinning).not.toBeNull());
  const pinned = (await pinning) as { release(): void } | null;
  expect(pinned).not.toBeNull();

  // Alpha is collected; beta was pinned after the snapshot and must survive.
  expect(await collecting).toEqual([alpha.generationId]);
  expect((await store.openPinnedReader(beta.generationId))!).not.toBeNull();
  pinned!.release();
});

it('restarts a generation retention window when a reader pins it', async () => {
  const clock = testClock();
  const name = uniqueName();
  const tabA = testStore({ name, now: clock.now });
  const tabB = testStore({ name, now: clock.now });
  const alpha = bundle('alpha');
  await tabA.updates.stageAndActivate(alpha.manifest, alpha.text);
  await tabA.updates.stageAndActivate(
    bundle('beta').manifest,
    bundle('beta').text,
  );
  await tabA.updates.stageAndActivate(
    bundle('gamma').manifest,
    bundle('gamma').text,
  );
  expect(await tabA.collect()).toEqual([]);

  // A day later another tab reads alpha: that pin restarts the retention
  // window of the generation for this tab as well.
  clock.tick(RETAIN_READY_FOR_MS + 60 * 60 * 1000);
  const pinned = (await tabB.openPinnedReader(alpha.generationId))!;
  expect(pinned).not.toBeNull();
  pinned.release();

  clock.tick(60 * 60 * 1000);
  expect(await tabA.collect()).not.toContain(alpha.generationId);
  clock.tick(RETAIN_READY_FOR_MS);
  expect(await tabA.collect()).toContain(alpha.generationId);
});

it('collects abandoned staged generations only after the grace period', async () => {
  const clock = testClock();
  const store = testStore({ now: clock.now, retainReadyForMs: 0 });
  const alpha = bundle('alpha');
  const abandoned = bundle('abandoned');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  await store.updates.stageBundle(abandoned.manifest, abandoned.text);

  expect(await store.collect()).toEqual([]);
  clock.tick(STALE_STAGING_MS);
  expect(await store.collect()).toEqual([abandoned.generationId]);
  expect(await store.openPinnedReader(alpha.generationId)).not.toBeNull();
  expect(store.getState()).toMatchObject({
    generation: { generationId: alpha.generationId },
  });
});

it('looks up names, DCI, links and ATC codes inside the pinned generation only', async () => {
  const store = testStore();
  const diacritics = bundle('beta', {
    products: [
      {
        key: 'SP-COMMA',
        name: 'Fictășî',
        ingredientKeys: ['AI-FICTIVOLINUM'],
      },
      {
        key: 'SP-CEDILLA',
        name: 'Fictăşî',
        ingredientKeys: ['AI-FICTIVOLINUM'],
      },
    ],
  });
  await store.updates.stageAndActivate(diacritics.manifest, diacritics.text);
  const reader = (await store.openReader())!;

  const folded = await reader.productsByNamePrefix('fictasi');
  expect(folded.map((product) => product.commercialName).sort()).toEqual([
    'Fictăşî beta',
    'Fictășî beta',
  ]);
  expect(await reader.productsByNamePrefix('fictăşî')).toHaveLength(2);
  expect(await reader.productsByNamePrefix('placebex')).toHaveLength(0);

  const alpha = bundle('alpha');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  // The pinned reader keeps its own generation: the new one is invisible to it.
  expect(await reader.productsByNamePrefix('fictivol')).toHaveLength(0);

  const current = (await store.openReader())!;
  expect(
    (await current.productsByNamePrefix('fictivol')).map(
      (product) => product.commercialName,
    ),
  ).toEqual(['Fictivol alpha']);
  expect(
    (await current.ingredientsByDciPrefix('fictivolinum')).map(
      (ingredient) => ingredient.preferredName,
    ),
  ).toEqual(['Fictivolinum alpha']);
  expect(await current.ingredientsByDciPrefix('placebexium')).toHaveLength(1);
  expect(
    (await current.productsByAtcCode('SYN-SP-FICTIVOL')).map(
      (product) => product.commercialName,
    ),
  ).toEqual(['Fictivol alpha']);
  expect(await current.productsByAtcCode('SYN-SP-NOTHING')).toHaveLength(0);
  expect(
    await current.productIngredients(alpha.productIds['SP-PLACEBEX']!),
  ).toHaveLength(3);
  expect(await current.productIds()).toHaveLength(2);
  reader.release();
  current.release();
});
