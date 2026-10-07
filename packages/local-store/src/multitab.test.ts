import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import { createBroadcastEventBus } from './events';
import type { LockManagerLike } from './locks';
import { createWebWriterLock } from './locks';
import {
  bundle,
  sharedBus,
  testClock,
  testDatabase,
  testMarkerLock,
  testStore,
  uniqueName,
} from './test-support';

/** Lease TTL the lease tests pin on their marker locks (see `testMarkerLock`). */
const LEASE_TTL_MS = 60_000;

it('refuses a concurrent update instead of racing another writer', async () => {
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
  const beta = bundle('beta');

  const running = writer.updates.stageAndActivate(alpha.manifest, alpha.text);
  await reachedStaging;
  await other.updates.stageAndActivate(beta.manifest, beta.text);
  expect(other.getState()).toMatchObject({
    status: 'update-failed',
    reason: 'writer-busy',
    generation: null,
  });

  release();
  await running;
  expect(writer.getState()).toMatchObject({
    status: 'ready',
    generation: { generationId: alpha.generationId },
  });
  expect(await other.openPinnedReader(alpha.generationId)).not.toBeNull();
});

it('grants the Web Lock exclusively and refuses instead of queueing', async () => {
  const names: string[] = [];
  const locks: LockManagerLike = {
    async request<T>(
      name: string,
      options: { readonly ifAvailable: true; readonly mode: 'exclusive' },
      callback: (lock: { readonly name: string } | null) => Promise<T>,
    ): Promise<T> {
      expect(options).toEqual({ ifAvailable: true, mode: 'exclusive' });
      const held = names.includes(name) ? null : { name };
      if (held) names.push(name);
      try {
        return await callback(held);
      } finally {
        if (held) names.splice(names.indexOf(name), 1);
      }
    },
  };
  const writer = createWebWriterLock(locks);
  expect(writer).not.toBeNull();

  let release: () => void = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const running = writer!.withExclusiveUpdate(async () => {
    await blocked;
    return 'first';
  });
  await expect(
    writer!.withExclusiveUpdate(async () => 'second'),
  ).resolves.toEqual({ ok: false });
  release();
  await expect(running).resolves.toEqual({ ok: true, value: 'first' });
  await expect(
    writer!.withExclusiveUpdate(async () => 'third'),
  ).resolves.toEqual({ ok: true, value: 'third' });
  expect(createWebWriterLock(null)).toBeNull();
});

it('lets other tabs switch at a safe boundary while pinned readers continue', async () => {
  const name = uniqueName();
  const events = sharedBus();
  const tabA = testStore({ name, events });
  const tabB = testStore({ name, events });
  const alpha = bundle('alpha');
  await tabA.updates.stageAndActivate(alpha.manifest, alpha.text);
  const tabAPinned = (await tabA.openReader())!;
  const tabBPinned = (await tabB.openReader())!;

  const beta = bundle('beta');
  await tabB.updates.stageAndActivate(beta.manifest, beta.text);
  await vi.waitFor(() =>
    expect(tabA.getState()).toMatchObject({
      status: 'ready',
      generation: { generationId: beta.generationId },
    }),
  );

  expect(
    (await tabAPinned.product(alpha.productIds['SP-FICTIVOL']!))
      ?.commercialName,
  ).toBe('Fictivol alpha');
  expect(
    (await tabBPinned.product(alpha.productIds['SP-FICTIVOL']!))
      ?.commercialName,
  ).toBe('Fictivol alpha');

  const fresh = (await tabA.openReader())!;
  expect(fresh.generationId).toBe(beta.generationId);
  expect(
    (await fresh.product(alpha.productIds['SP-FICTIVOL']!))?.commercialName,
  ).toBe('Fictivol beta');
  tabAPinned.release();
  tabBPinned.release();
  fresh.release();
});

it('renews the fallback writer lease while its work runs so no other writer can take it', async () => {
  const clock = testClock();
  const name = uniqueName();
  const holder = await testMarkerLock(name, clock.now, { ttlMs: LEASE_TTL_MS });
  const contender = await testMarkerLock(name, clock.now, {
    ttlMs: LEASE_TTL_MS,
  });
  let release: () => void = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const running = holder.lock.withExclusiveUpdate(async () => {
    await blocked;
    return 'holder';
  });

  // Three heartbeat renewals, each after more than a third of the lease TTL of
  // simulated time. Without renewal the marker would expire in round two.
  for (let round = 0; round < 3; round += 1) {
    clock.tick(Math.floor(LEASE_TTL_MS / 2) + 1_000);
    await holder.beat();
    await expect(
      contender.lock.withExclusiveUpdate(async () => 'contender'),
    ).resolves.toEqual({ ok: false });
  }

  release();
  await expect(running).resolves.toEqual({ ok: true, value: 'holder' });
  await expect(
    contender.lock.withExclusiveUpdate(async () => 'contender'),
  ).resolves.toEqual({ ok: true, value: 'contender' });
});

it('aborts an activation whose writer lease was lost to another tab', async () => {
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
      if (store === 'documents') {
        reached();
        await blocked;
      }
    },
  });
  const other = testStore({ name, now: clock.now });
  const alpha = bundle('alpha');
  const beta = bundle('beta');

  const running = writer.updates.stageAndActivate(alpha.manifest, alpha.text);
  await reachedStaging;
  // The stalled tab's lease expires and another tab takes over completely.
  clock.tick(LEASE_TTL_MS + 1_000);
  await other.updates.stageAndActivate(beta.manifest, beta.text);
  expect(other.getState()).toMatchObject({
    status: 'ready',
    generation: { generationId: beta.generationId },
  });

  release();
  await expect(running).resolves.toMatchObject({
    status: 'update-failed',
    reason: 'writer-busy',
  });
  expect((await other.openReader())?.generationId).toBe(beta.generationId);
});

it('stops staging and keeps the new writer rows when the lease is lost mid-staging', async () => {
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
  const takeover = testStore({ name, now: clock.now });
  const alpha = bundle('alpha');

  const running = writer.updates.stageAndActivate(alpha.manifest, alpha.text);
  await reachedStaging;
  // The lease expires and a new writer stages and activates the very same
  // generation with its own complete rows.
  clock.tick(LEASE_TTL_MS + 1_000);
  await takeover.updates.stageAndActivate(alpha.manifest, alpha.text);
  release();

  await expect(running).resolves.toMatchObject({
    status: 'update-failed',
    reason: 'writer-busy',
  });
  // The losing writer stopped writing and deleted nothing of the new owner.
  expect(
    await stalled.db.products
      .where('generationId')
      .equals(alpha.generationId)
      .count(),
  ).toBe(2);
  const reader = (await takeover.openPinnedReader(alpha.generationId))!;
  expect(reader).not.toBeNull();
  expect(await reader.productIds()).toHaveLength(2);
  reader.release();
});

it('tells other tabs when one tab clears the local data', async () => {
  // Two separate channel endpoints on one name, like two tabs of one origin.
  const channel = uniqueName('intermed-test-channel');
  const eventsA = createBroadcastEventBus(channel);
  const eventsB = createBroadcastEventBus(channel);
  try {
    const name = uniqueName();
    const tabA = testStore({ name, events: eventsA });
    const tabB = testStore({ name, events: eventsB });
    const alpha = bundle('alpha');
    await tabA.updates.stageAndActivate(alpha.manifest, alpha.text);
    await vi.waitFor(() =>
      expect(tabB.getState()).toMatchObject({
        status: 'ready',
        generation: { generationId: alpha.generationId },
      }),
    );

    await tabA.preferences.clearAllLocalData();
    await vi.waitFor(() =>
      expect(tabB.getState()).toMatchObject({ status: 'never-downloaded' }),
    );
    expect(await tabB.openReader()).toBeNull();
  } finally {
    eventsA.close();
    eventsB.close();
  }
});

it('uses unpredictable UUIDs for writer tokens and tab ids', async () => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const names: string[] = [];
  const locks: LockManagerLike = {
    async request<T>(
      name: string,
      _options: { readonly ifAvailable: true; readonly mode: 'exclusive' },
      callback: (lock: { readonly name: string } | null) => Promise<T>,
    ): Promise<T> {
      const held = names.includes(name) ? null : { name };
      if (held) names.push(name);
      try {
        return await callback(held);
      } finally {
        if (held) names.splice(names.indexOf(name), 1);
      }
    },
  };
  let token = '';
  const web = createWebWriterLock(locks);
  await web!.withExclusiveUpdate(async (lease) => {
    token = lease.token;
    return true;
  });
  expect(token.startsWith('web-lock-')).toBe(true);
  expect(token.slice('web-lock-'.length)).toMatch(uuid);

  // The tab id is what the fallback marker records while a writer is active.
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
  const alpha = bundle('alpha');
  const running = writer.updates.stageAndActivate(alpha.manifest, alpha.text);
  await reachedStaging;

  const marker = (await (
    await testDatabase(name)
  ).writerLock.get('writer-lock'))!;
  expect(marker.owner).toMatch(
    /^intermed-tab-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}#\d+$/,
  );

  release();
  await running;
});
