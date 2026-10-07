import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import {
  bundle,
  fakePublishedSource,
  integrityBrokenBundle,
  testStore,
  uniqueName,
} from './test-support';

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
