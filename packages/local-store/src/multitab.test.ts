import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import type { LockManagerLike } from './locks';
import { createWebWriterLock } from './locks';
import { bundle, sharedBus, testStore, uniqueName } from './test-support';

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
