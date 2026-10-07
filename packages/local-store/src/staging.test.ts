import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { MEDICATION_CATALOGUE_SCHEMA_VERSION } from '@intermed/domain';
import type { DatasetStoreEvent } from './events';
import type { DatasetWriterLock } from './locks';
import type { GenerationRecord } from './schema';
import { STALE_STAGING_MS } from './store';
import { SYNTHETIC_DATASET } from './synthetic-bundle';
import {
  bundle,
  fakePublishedSource,
  integrityBrokenBundle,
  sharedBus,
  testClock,
  testDatabase,
  testMarkerLock,
  testStore,
  uniqueName,
  versionMismatchBundle,
} from './test-support';
import { checkBundle } from './validate';

/** A generation record planted as a crash or corruption would leave it. */
function plantedRecord(
  generationId: string,
  fields: Partial<GenerationRecord> = {},
): GenerationRecord {
  return {
    generationId,
    dataset: SYNTHETIC_DATASET,
    version: 'synthetic-planted',
    schemaVersion: MEDICATION_CATALOGUE_SCHEMA_VERSION,
    sourceIds: ['source.synthetic'],
    publishedAt: null,
    importedAt: '2026-06-01T00:00:00.000Z',
    downloadedAt: '2026-06-01T00:00:00.000Z',
    checksum: 'planted-by-test',
    coverage: 'Synthetic development fixture (not for clinical use)',
    recordCounts: { products: 2 },
    synthetic: true,
    status: 'staging',
    stagedAt: '2026-06-01T00:00:00.000Z',
    readyAt: null,
    lastUsedAt: null,
    ...fields,
  };
}

it('stages and activates a bundle, then reads the same generation after a restart', async () => {
  const name = uniqueName();
  const store = testStore({ name });
  const alpha = bundle('alpha');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  expect(store.getState()).toMatchObject({
    status: 'ready',
    generation: {
      generationId: alpha.generationId,
      version: 'synthetic-alpha',
      dataset: alpha.dataset,
      synthetic: true,
    },
  });

  store.close();
  const restarted = testStore({ name });
  await restarted.open();
  expect(restarted.getState()).toMatchObject({
    status: 'ready',
    generation: { generationId: alpha.generationId },
  });
  const reader = await restarted.openReader();
  expect(reader).not.toBeNull();
  const product = await reader!.product(alpha.productIds['SP-FICTIVOL']!);
  expect(product?.commercialName).toBe('Fictivol alpha');
});

it('keeps staged rows invisible until one atomic pointer switch', async () => {
  const store = testStore();
  const alpha = bundle('alpha');
  const beta = bundle('beta');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);

  await store.updates.stageBundle(beta.manifest, beta.text);
  expect(store.getState()).toMatchObject({
    status: 'ready',
    generation: { generationId: alpha.generationId },
  });
  const reader = await store.openReader();
  const stagedProduct = await reader!.product(beta.productIds['SP-FICTIVOL']!);
  expect(stagedProduct?.commercialName).toBe('Fictivol alpha');

  await store.updates.activate(beta.generationId);
  expect(store.getState()).toMatchObject({
    status: 'ready',
    generation: { generationId: beta.generationId },
  });
  const activated = await store.openReader();
  expect(
    (await activated!.product(beta.productIds['SP-FICTIVOL']!))?.commercialName,
  ).toBe('Fictivol beta');
});

it('is idempotent when the same generation is staged twice', async () => {
  const store = testStore();
  const alpha = bundle('alpha');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  expect(store.getState()).toMatchObject({
    status: 'ready',
    generation: { generationId: alpha.generationId },
  });
  const reader = await store.openReader();
  expect(await reader!.productIds()).toHaveLength(2);
});

it('rejects a corrupted bundle, keeps the previous generation and stages nothing', async () => {
  const store = testStore();
  const alpha = bundle('alpha');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  const beta = bundle('beta');
  const corrupted = `${beta.text}corrupted`;

  await store.updates.stageBundle(beta.manifest, corrupted);
  expect(store.getState()).toMatchObject({
    status: 'update-failed',
    reason: 'checksum-mismatch',
    generation: { generationId: alpha.generationId },
  });
  expect(await store.openPinnedReader(beta.generationId)).toBeNull();
  const reader = await store.openReader();
  expect(reader?.generationId).toBe(alpha.generationId);
});

it('rejects a bundle that fails referential integrity', async () => {
  const store = testStore();
  const alpha = bundle('alpha');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  const broken = integrityBrokenBundle(bundle('beta'));

  await store.updates.stageBundle(broken.manifest, broken.text);
  expect(store.getState()).toMatchObject({
    status: 'update-failed',
    reason: 'integrity-failed',
    generation: { generationId: alpha.generationId },
  });
  expect(await store.openPinnedReader(bundle('beta').generationId)).toBeNull();
});

it('rejects published count mismatches against the bundle', async () => {
  const store = testStore();
  const beta = bundle('beta');
  await store.updates.stageBundle(
    {
      ...beta.manifest,
      recordCounts: { ...beta.manifest.recordCounts, products: 99 },
    },
    beta.text,
  );
  expect(store.getState()).toMatchObject({
    status: 'update-failed',
    reason: 'count-mismatch',
    generation: null,
  });
});

it('rejects an unsupported manifest schema or client requirement', async () => {
  const store = testStore();
  const beta = bundle('beta');
  await store.updates.stageBundle(
    { ...beta.manifest, schemaVersion: 'medication-catalogue-9' },
    beta.text,
  );
  expect(store.getState()).toMatchObject({
    status: 'update-failed',
    reason: 'incompatible-schema',
  });
  await store.updates.stageBundle(
    { ...beta.manifest, minimumClientVersion: '9.0.0' },
    beta.text,
  );
  expect(store.getState()).toMatchObject({
    status: 'update-failed',
    reason: 'incompatible-schema',
  });
});

it('rejects a manifest that is not for this dataset or has no expected counts', async () => {
  const store = testStore();
  const beta = bundle('beta');
  await store.updates.stageBundle(
    { ...beta.manifest, dataset: 'another-dataset' },
    beta.text,
  );
  expect(store.getState()).toMatchObject({
    status: 'update-failed',
    reason: 'invalid-manifest',
  });
  await store.updates.stageBundle(
    { ...beta.manifest, recordCounts: {} },
    beta.text,
  );
  expect(store.getState()).toMatchObject({
    status: 'update-failed',
    reason: 'invalid-manifest',
  });
});

it('rejects a bundle that does not identify the manifest generation', async () => {
  const store = testStore();
  const alpha = bundle('alpha');
  const beta = bundle('beta');
  // A correctly checksummed bundle published under another generation's id.
  await store.updates.stageBundle(
    { ...beta.manifest, checksum: alpha.manifest.checksum },
    alpha.text,
  );
  expect(store.getState()).toMatchObject({
    status: 'update-failed',
    reason: 'invalid-bundle',
    generation: null,
  });
});

it('keeps the old active generation when staging is interrupted', async () => {
  let interrupt = false;
  const store = testStore({
    onStaged: ({ store: stagedStore }) => {
      if (interrupt && stagedStore === 'ingredients')
        throw new Error('Synthetic interruption');
    },
  });
  const alpha = bundle('alpha');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  const beta = bundle('beta');
  interrupt = true;

  await store.updates.stageBundle(beta.manifest, beta.text);
  expect(store.getState()).toMatchObject({
    status: 'update-failed',
    reason: 'interrupted',
    generation: { generationId: alpha.generationId },
  });
  expect(await store.openPinnedReader(beta.generationId)).toBeNull();
  const reader = await store.openReader();
  expect(
    (await reader!.product(alpha.productIds['SP-FICTIVOL']!))?.commercialName,
  ).toBe('Fictivol alpha');
});

it('keeps the old active generation on a quota error and reports storage-quota', async () => {
  let fillQuota = false;
  const store = testStore({
    onStaged: ({ store: stagedStore }) => {
      if (fillQuota && stagedStore === 'products')
        throw Object.assign(new Error('Synthetic quota'), {
          name: 'QuotaExceededError',
        });
    },
  });
  const alpha = bundle('alpha');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  const beta = bundle('beta');
  fillQuota = true;

  await store.updates.stageBundle(beta.manifest, beta.text);
  expect(store.getState()).toMatchObject({
    status: 'storage-quota',
    generation: { generationId: alpha.generationId },
  });
  expect(await store.openPinnedReader(beta.generationId)).toBeNull();
  const reader = await store.openReader();
  expect(reader?.generationId).toBe(alpha.generationId);
});

it('downloads through the injected published source and reports size mismatches', async () => {
  const alpha = bundle('alpha');
  const healthy = fakePublishedSource(alpha);
  const store = testStore(healthy);
  await store.updates.downloadAndActivate();
  expect(store.getState()).toMatchObject({
    status: 'ready',
    generation: { generationId: alpha.generationId },
  });

  const beta = bundle('beta');
  const wrongSize = fakePublishedSource(beta, {
    descriptor: { ...beta.descriptor, byteSize: beta.descriptor.byteSize + 1 },
  });
  const secondStore = testStore(wrongSize);
  await secondStore.updates.downloadAndActivate();
  expect(secondStore.getState()).toMatchObject({
    status: 'update-failed',
    reason: 'invalid-bundle',
    generation: null,
  });
});

it('reports update-available after a background check and fails without touching data', async () => {
  const alpha = bundle('alpha');
  const store = testStore(fakePublishedSource(alpha));
  await store.updates.downloadAndActivate();
  expect(store.getState()).toMatchObject({ status: 'ready' });

  await store.updates.checkForUpdate();
  expect(store.getState()).toMatchObject({
    status: 'ready',
    generation: { generationId: alpha.generationId },
  });

  const beta = bundle('beta');
  const newer = testStore(fakePublishedSource(beta));
  await newer.updates.stageAndActivate(alpha.manifest, alpha.text);
  await newer.updates.checkForUpdate();
  expect(newer.getState()).toMatchObject({
    status: 'update-available',
    generation: { generationId: alpha.generationId },
    candidate: { generationId: beta.generationId, version: 'synthetic-beta' },
  });

  const broken = testStore(
    fakePublishedSource(beta, { manifestStatus: 'unavailable' }),
  );
  await broken.updates.stageAndActivate(alpha.manifest, alpha.text);
  await broken.updates.checkForUpdate();
  expect(broken.getState()).toMatchObject({
    status: 'update-failed',
    reason: 'manifest-unavailable',
    generation: { generationId: alpha.generationId },
  });

  const absent = testStore(
    fakePublishedSource(beta, { manifestStatus: 'absent' }),
  );
  await absent.updates.stageAndActivate(alpha.manifest, alpha.text);
  await absent.updates.checkForUpdate();
  expect(absent.getState()).toMatchObject({
    status: 'ready',
    generation: { generationId: alpha.generationId },
  });
});

it('keeps a committed activation successful when preference reconciliation fails', async () => {
  const events = sharedBus();
  const posted: DatasetStoreEvent[] = [];
  events.subscribe((event) => {
    posted.push(event);
  });
  let failMaintenance = false;
  const store = testStore({
    events,
    onMaintenance: (task) => {
      if (failMaintenance && task.kind === 'preference-reconciliation')
        throw Object.assign(new Error('Synthetic quota'), {
          name: 'QuotaExceededError',
        });
    },
  });
  const alpha = bundle('alpha');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  await store.preferences.addFavorite({
    productId: alpha.productIds['SP-FICTIVOL']!,
    lastKnownDisplayName: 'Fictivol alpha',
    lastKnownDatasetVersionId: alpha.generationId,
  });
  // The replacement drops the favorite, so reconciliation writes a tombstone.
  const beta = bundle('beta', {
    products: [{ key: 'SP-PLACEBEX', name: 'Placebex' }],
  });
  failMaintenance = true;
  posted.length = 0;

  const state = await store.updates.stageAndActivate(beta.manifest, beta.text);
  expect(state).toMatchObject({
    status: 'ready',
    generation: { generationId: beta.generationId },
  });
  expect(store.getState()).toMatchObject({
    status: 'ready',
    generation: { generationId: beta.generationId },
  });
  expect(posted).toContainEqual({
    type: 'activated',
    generationId: beta.generationId,
  });
  // The maintenance failure is reported separately, never as a failed update.
  expect(store.maintenance.getStatus()).toMatchObject({
    pending: true,
    lastFailure: {
      task: {
        kind: 'preference-reconciliation',
        generationId: beta.generationId,
      },
      reason: 'storage-quota',
    },
  });

  failMaintenance = false;
  await store.maintenance.retry();
  expect(store.maintenance.getStatus().pending).toBe(false);
  expect(await store.preferences.listProductTombstones()).toMatchObject([
    {
      productId: alpha.productIds['SP-FICTIVOL'],
      lastKnownDisplayName: 'Fictivol alpha',
    },
  ]);
});

it('keeps a committed activation successful when post-commit collection fails', async () => {
  let failCollection = false;
  const store = testStore({
    onMaintenance: (task) => {
      if (failCollection && task.kind === 'generation-gc')
        throw Object.assign(new Error('Synthetic quota'), {
          name: 'QuotaExceededError',
        });
    },
  });
  const alpha = bundle('alpha');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  failCollection = true;
  const beta = bundle('beta');

  const state = await store.updates.stageAndActivate(beta.manifest, beta.text);
  expect(state).toMatchObject({
    status: 'ready',
    generation: { generationId: beta.generationId },
  });
  expect(store.getState()).toMatchObject({
    status: 'ready',
    generation: { generationId: beta.generationId },
  });
  expect(store.maintenance.getStatus()).toMatchObject({
    pending: true,
    lastFailure: { task: { kind: 'generation-gc' }, reason: 'storage-quota' },
  });

  failCollection = false;
  await store.maintenance.retry();
  expect(store.maintenance.getStatus().pending).toBe(false);
});

it('finishes a preference reconciliation that a crash interrupted', async () => {
  const name = uniqueName();
  const store = testStore({ name });
  const alpha = bundle('alpha');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  await store.preferences.addFavorite({
    productId: alpha.productIds['SP-FICTIVOL']!,
    lastKnownDisplayName: 'Fictivol alpha',
    lastKnownDatasetVersionId: alpha.generationId,
  });
  const beta = bundle('beta', {
    products: [{ key: 'SP-PLACEBEX', name: 'Placebex' }],
  });
  await store.updates.stageAndActivate(beta.manifest, beta.text);
  expect(await store.preferences.listProductTombstones()).toHaveLength(1);

  // Rewind to the state a crash before reconciliation leaves behind: the
  // activation committed and the reconciliation marker still names the
  // previous generation.
  const crashed = await testDatabase(name);
  await crashed.tombstones.clear();
  await crashed.favorites.update(alpha.productIds['SP-FICTIVOL']!, {
    status: 'available',
  });
  await crashed.meta.update('dataset-state', {
    reconciledGenerationId: alpha.generationId,
  });
  crashed.close();
  store.close();

  const reopened = testStore({ name });
  await reopened.open();
  expect(await reopened.preferences.listProductTombstones()).toMatchObject([
    { productId: alpha.productIds['SP-FICTIVOL'] },
  ]);
  expect((await reopened.preferences.listFavorites())[0]).toMatchObject({
    status: 'removed',
  });
});

it('keeps a generation that becomes active while startup cleanup runs', async () => {
  const name = uniqueName();
  const clock = testClock();
  const writerLease = await testMarkerLock(name, clock.now, {
    ttlMs: 3_600_000,
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
    lock: writerLease.lock,
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
  // The half-written staging record looks abandoned to a scan that runs now.
  clock.tick(STALE_STAGING_MS + 1_000);

  const inner = (await testMarkerLock(name, clock.now, { ttlMs: 3_600_000 }))
    .lock;
  const interleaving: DatasetWriterLock = {
    withExclusiveUpdate: async (work) => {
      // The lease claim is the interleaving point: the writer completes and
      // activates before the startup cleanup is granted the lease.
      release();
      await running;
      return inner.withExclusiveUpdate(work);
    },
  };
  const cleaner = testStore({ name, now: clock.now, lock: interleaving });
  await cleaner.open();

  await running;
  expect((await cleaner.openReader())?.generationId).toBe(alpha.generationId);
  expect(await cleaner.openPinnedReader(alpha.generationId)).not.toBeNull();
});

it('refuses to activate a generation whose staging never completed', async () => {
  const name = uniqueName();
  const store = testStore({ name });
  const alpha = bundle('alpha');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  const rows = await testDatabase(name);
  // A crash mid-stage leaves a record whose catalogue rows were never written.
  await rows.generations.put(plantedRecord('planted-staging'));

  await store.updates.activate('planted-staging');
  expect(store.getState()).toMatchObject({
    status: 'update-failed',
    reason: 'interrupted',
    generation: { generationId: alpha.generationId },
  });
  expect((await store.openReader())?.generationId).toBe(alpha.generationId);
});

it('re-verifies the stored row counts before switching the pointer', async () => {
  const name = uniqueName();
  const store = testStore({ name });
  const alpha = bundle('alpha');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  const rows = await testDatabase(name);
  // Marked complete, but the rows it promises are not there.
  await rows.generations.put(
    plantedRecord('short-generation', { status: 'staged' }),
  );

  await store.updates.activate('short-generation');
  expect(store.getState()).toMatchObject({
    status: 'update-failed',
    reason: 'count-mismatch',
    generation: { generationId: alpha.generationId },
  });
  expect((await store.openReader())?.generationId).toBe(alpha.generationId);
});

it('removes an incomplete staging generation on the next open', async () => {
  const name = uniqueName();
  const seeded = testStore({ name });
  await seeded.open();
  const rows = await testDatabase(name);
  await rows.generations.put(plantedRecord('crashed-staging'));
  seeded.close();

  const reopened = testStore({ name });
  await reopened.open();
  expect(await rows.generations.get('crashed-staging')).toBeUndefined();
  expect(reopened.getState()).toMatchObject({ status: 'never-downloaded' });
});

it('recovers an evicted generation by re-downloading and replacing its rows', async () => {
  const name = uniqueName();
  const alpha = bundle('alpha');
  const beta = bundle('beta');
  const source = fakePublishedSource(alpha);
  const store = testStore({
    name,
    reader: source.reader,
    loader: source.loader,
  });
  await store.updates.stageAndActivate(beta.manifest, beta.text);
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  const rows = await testDatabase(name);
  // Eviction: the product rows of the active generation are gone.
  await rows.products.where('generationId').equals(alpha.generationId).delete();
  store.close();

  const reopened = testStore({
    name,
    reader: source.reader,
    loader: source.loader,
  });
  await reopened.open();
  expect(reopened.getState()).toMatchObject({
    status: 'evicted',
    generationId: alpha.generationId,
  });
  expect(await reopened.openReader()).toBeNull();
  expect(await reopened.openPinnedReader(alpha.generationId)).toBeNull();

  // The next update re-downloads the same published version and replaces its
  // rows instead of skipping the download as already present.
  await reopened.updates.downloadAndActivate();
  expect(reopened.getState()).toMatchObject({
    status: 'ready',
    generation: { generationId: alpha.generationId },
  });
  const reader = (await reopened.openReader())!;
  expect(await reader.productIds()).toHaveLength(2);
  reader.release();
  // The replacement touched no other generation.
  expect(await reopened.openPinnedReader(beta.generationId)).not.toBeNull();
  expect(
    await rows.products.where('generationId').equals(beta.generationId).count(),
  ).toBeGreaterThan(0);
});

it('rejects a bundle whose embedded dataset version disagrees with its manifest', async () => {
  const store = testStore();
  const alpha = bundle('alpha');
  await store.updates.stageAndActivate(alpha.manifest, alpha.text);
  const mismatched = versionMismatchBundle(bundle('beta'), {
    schemaVersion: 'medication-catalogue-2',
  });

  await store.updates.stageBundle(mismatched.manifest, mismatched.text);
  expect(store.getState()).toMatchObject({
    status: 'update-failed',
    reason: 'invalid-bundle',
    generation: { generationId: alpha.generationId },
  });
  expect((await store.openReader())?.generationId).toBe(alpha.generationId);
});

it('applies the manifest compatibility checks to the embedded version too', () => {
  const source = bundle('beta');
  expect(checkBundle(source.manifest, source.text).ok).toBe(true);

  const schemaMismatch = versionMismatchBundle(source, {
    schemaVersion: 'medication-catalogue-2',
  });
  expect(checkBundle(schemaMismatch.manifest, schemaMismatch.text)).toEqual({
    ok: false,
    reason: 'invalid-bundle',
  });
  const clientMismatch = versionMismatchBundle(source, {
    minimumClientVersion: '1.0.0',
  });
  expect(checkBundle(clientMismatch.manifest, clientMismatch.text)).toEqual({
    ok: false,
    reason: 'invalid-bundle',
  });

  // The same compatibility checks the manifest gets are applied to the
  // embedded version when the two agree on an unsupported requirement.
  const unsupportedSchema = versionMismatchBundle(source, {
    schemaVersion: 'medication-catalogue-2',
  });
  expect(
    checkBundle(
      {
        ...unsupportedSchema.manifest,
        schemaVersion: 'medication-catalogue-2',
      },
      unsupportedSchema.text,
    ),
  ).toEqual({ ok: false, reason: 'incompatible-schema' });
  const tooNewClient = versionMismatchBundle(source, {
    minimumClientVersion: '9.0.0',
  });
  expect(
    checkBundle(
      { ...tooNewClient.manifest, minimumClientVersion: '9.0.0' },
      tooNewClient.text,
    ),
  ).toEqual({ ok: false, reason: 'incompatible-schema' });
});
