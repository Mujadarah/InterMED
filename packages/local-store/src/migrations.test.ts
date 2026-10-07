import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { readOnDiskSchema } from './introspect';
import { attachConnectionLifecycle } from './lifecycle';
import { openSchemaUpgradeProbe } from './probe';
import { LocalDatasetDatabase } from './schema';
import { bundle, testStore, uniqueName } from './test-support';

it('migrates a v1 database with favorites and keeps the active generation', async () => {
  const name = uniqueName();
  const store = testStore({ name });
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
  store.close();

  const upgraded = await openSchemaUpgradeProbe(name);
  try {
    expect(upgraded.status).toBe('upgraded');
    expect(upgraded.schemaGeneration).toBe(2);
    expect(upgraded.favorites).toMatchObject([
      {
        productId: alpha.productIds['SP-FICTIVOL'],
        lastKnownDisplayName: 'Fictivol alpha',
        status: 'available',
      },
    ]);
    expect(upgraded.activeGenerationId).toBe(alpha.generationId);
    expect(upgraded.previousGenerationId).toBeNull();
    expect(upgraded.tombstones).toEqual([]);
  } finally {
    upgraded.close();
  }
});

it('refuses a newer on-disk schema and leaves its data untouched', async () => {
  const name = uniqueName();
  const store = testStore({ name });
  const alpha = bundle('alpha');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  await store.preferences.addFavorite({
    productId: alpha.productIds['SP-FICTIVOL']!,
    lastKnownDisplayName: 'Fictivol alpha',
    lastKnownDatasetVersionId: alpha.generationId,
  });
  store.close();
  const upgraded = await openSchemaUpgradeProbe(name);
  upgraded.close();

  const outdated = testStore({ name });
  await outdated.open();
  expect(outdated.getState()).toMatchObject({ status: 'unsupported-schema' });
  expect(await outdated.openReader()).toBeNull();
  outdated.close();

  const inspected = await openSchemaUpgradeProbe(name);
  try {
    expect(inspected.schemaGeneration).toBe(2);
    expect(inspected.favorites).toHaveLength(1);
    expect(inspected.activeGenerationId).toBe(alpha.generationId);
  } finally {
    inspected.close();
  }
});

it('reports evicted when the active pointer outlives its rows', async () => {
  const name = uniqueName();
  const store = testStore({ name });
  const alpha = bundle('alpha');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  store.close();

  const damaged = new LocalDatasetDatabase(name);
  await damaged.open();
  await damaged.generations.delete(alpha.generationId);
  await damaged.products.clear();
  damaged.close();

  const reopened = testStore({ name });
  await reopened.open();
  expect(reopened.getState()).toMatchObject({
    status: 'evicted',
    generationId: alpha.generationId,
  });
  expect(await reopened.openReader()).toBeNull();
});

it('reports never-downloaded on a fresh database', async () => {
  const store = testStore();
  await store.open();
  expect(store.getState()).toMatchObject({ status: 'never-downloaded' });
  expect(await store.openReader()).toBeNull();
  expect(await store.rollback()).toBe(false);
});

it('reports storage-unavailable when no database API is exposed', async () => {
  vi.stubGlobal('indexedDB', undefined);
  try {
    const store = testStore();
    await store.open();
    expect(store.getState()).toMatchObject({ status: 'storage-unavailable' });
  } finally {
    vi.unstubAllGlobals();
  }
});

it('reports storage-restricted when the browser refuses to open a database', async () => {
  const denied = {
    open: () => {
      const request: Record<string, unknown> = { error: new Error('denied') };
      queueMicrotask(() => {
        (request['onerror'] as (() => void) | undefined)?.();
      });
      return request;
    },
  };
  vi.stubGlobal('indexedDB', denied);
  try {
    const store = testStore();
    await store.open();
    expect(store.getState()).toMatchObject({ status: 'storage-restricted' });
  } finally {
    vi.unstubAllGlobals();
  }
});

it('surfaces reload-required instead of blocking when another tab upgrades', async () => {
  const name = uniqueName();
  const store = testStore({ name });
  const alpha = bundle('alpha');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  await store.preferences.addFavorite({
    productId: alpha.productIds['SP-FICTIVOL']!,
    lastKnownDisplayName: 'Fictivol alpha',
    lastKnownDatasetVersionId: alpha.generationId,
  });

  const upgraded = await openSchemaUpgradeProbe(name);
  try {
    await vi.waitFor(() =>
      expect(store.getState()).toMatchObject({ status: 'reload-required' }),
    );
    expect(upgraded.favorites).toHaveLength(1);
    expect(upgraded.activeGenerationId).toBe(alpha.generationId);
  } finally {
    upgraded.close();
  }
});

it('closes its connection on versionchange and on blocked', () => {
  const handlers = new Map<string, () => void>();
  let closed = 0;
  let reported = 0;
  attachConnectionLifecycle(
    {
      on: (eventName, handler) => {
        handlers.set(eventName, handler);
      },
      close: () => {
        closed += 1;
      },
    },
    () => {
      reported += 1;
    },
  );
  expect([...handlers.keys()].sort()).toEqual(['blocked', 'versionchange']);
  handlers.get('versionchange')?.();
  handlers.get('blocked')?.();
  expect(closed).toBe(2);
  expect(reported).toBe(2);
});

it('never creates a database while inspecting an unknown name', async () => {
  const name = uniqueName('intermed-absent');
  await expect(readOnDiskSchema(indexedDB, name)).resolves.toBeNull();
  const names = (await indexedDB.databases()).map((entry) => entry.name);
  expect(names).not.toContain(name);
});

it('requests persistent storage as best effort and survives its denial', async () => {
  const persist = vi.fn(async () => {
    throw new Error('Synthetic denial');
  });
  vi.stubGlobal('navigator', { storage: { persist } });
  try {
    const store = testStore();
    await store.open();
    expect(persist).toHaveBeenCalledOnce();
    expect(store.getState()).toMatchObject({ status: 'never-downloaded' });
  } finally {
    vi.unstubAllGlobals();
  }
});

it('reports a failed startup write and lets a later open retry', async () => {
  const name = uniqueName();
  const quota = Object.assign(new Error('Synthetic quota'), {
    name: 'QuotaExceededError',
  });
  // The first transaction of an open is the startup meta write.
  const spy = vi
    .spyOn(Dexie.prototype, 'transaction')
    .mockImplementation((() => {
      throw quota;
    }) as unknown as typeof Dexie.prototype.transaction);
  const store = testStore({ name });
  try {
    await store.open();
    expect(store.getState()).toMatchObject({
      status: 'storage-quota',
      generation: null,
    });
    expect(await store.openReader()).toBeNull();
  } finally {
    spy.mockRestore();
  }

  // The failed open is not cached as a rejected promise: a later open runs
  // again and succeeds.
  await store.open();
  expect(store.getState()).toMatchObject({ status: 'never-downloaded' });
});
