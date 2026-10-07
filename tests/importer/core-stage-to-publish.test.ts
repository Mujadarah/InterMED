import { describe, expect, it, vi } from 'vitest';
import {
  catalogueFingerprint,
  deserializeCatalogue,
  serializeCatalogue,
  validateReferentialIntegrity,
  type MedicationCatalogueSnapshot,
} from '@intermed/domain';
import { validateSyntheticSource } from '@intermed/data-access';
import { publish } from '../../packages/importer/src/publisher';
import { stage } from '../../packages/importer/src/stage';
import { FakeStore, sha256, transportFault } from './support/fake-ports';
import { approve, deserialized, stageGeneration } from './support/harness';
import {
  buildRawDocument,
  fictivolProduct,
  placebexProduct,
  rawBytes,
  testConfig,
  vacantolProduct,
} from './support/synthetic-raws';

function countsOf(snapshot: MedicationCatalogueSnapshot) {
  return {
    dataSources: snapshot.dataSources.length,
    datasetVersions: snapshot.datasetVersions.length,
    products: snapshot.products.length,
    activeIngredients: snapshot.activeIngredients.length,
    medicationIngredients: snapshot.medicationIngredients.length,
    atcCodes: snapshot.atcCodes.length,
    dosageForms: snapshot.dosageForms.length,
    manufacturers: snapshot.manufacturers.length,
    marketingAuthorizationHolders:
      snapshot.marketingAuthorizationHolders.length,
    regulatoryDocuments: snapshot.regulatoryDocuments.length,
  };
}

function advanceBaseline(
  store: FakeStore,
  candidateVersionId: string,
  snapshot: MedicationCatalogueSnapshot,
): void {
  store.baseline = {
    baselineVersionId: candidateVersionId,
    baselineFingerprint: catalogueFingerprint(snapshot),
    catalogue: snapshot,
  };
}

describe('real stage to publish acceptance', () => {
  it('proves the domain pipeline is unmocked', () => {
    expect(vi.isMockFunction(validateSyntheticSource)).toBe(false);
    expect(vi.isMockFunction(serializeCatalogue)).toBe(false);
    expect(vi.isMockFunction(deserializeCatalogue)).toBe(false);
  });

  it('runs raw bytes through staging to a committed publication', async () => {
    const config = testConfig();
    const store = new FakeStore();
    store.raw = rawBytes(
      buildRawDocument({ products: [fictivolProduct(), placebexProduct()] }),
    );

    const staged = await stage({
      config,
      snapshotBytes: new Uint8Array(),
      encoding: 'utf-8',
      ports: store.stagePorts(),
    });
    expect(staged.status).toBe('staged');
    const candidateVersionId = staged.identity.datasetVersionId;
    const candidateBytes = store.candidates.get(candidateVersionId)!;
    const review = store.reviews.get(candidateVersionId)!;

    const result = await publish({
      config,
      candidateVersionId,
      approval: approve(review),
      ports: store.publishPorts(),
    });
    expect(result.status).toBe('published');

    const publishedFile = store.files.get(
      `${candidateVersionId}/bundle-${candidateVersionId}.json`,
    )!;
    expect(publishedFile).toEqual(candidateBytes);
    const snapshot = deserialized(publishedFile);

    // Identity: the importer identity equals the real serialized generation id.
    expect(snapshot.datasetVersions[0]!.id).toBe(candidateVersionId);
    expect(staged.identity.datasetVersionId).toBe(
      snapshot.datasetVersions[0]!.id,
    );

    // All entity references are valid in the published bytes.
    expect(validateReferentialIntegrity(snapshot)).toEqual([]);

    // Mandatory contract: manifest sourceIds equal the dataset version sourceIds.
    const manifest = store.manifests.get(candidateVersionId)!;
    expect(manifest.sourceIds).toEqual([
      ...snapshot.datasetVersions[0]!.sourceIds,
    ]);
    expect(manifest.sourceIds).not.toEqual([
      snapshot.dataSources[0]!.sourceKey,
    ]);
    expect(String(manifest.sourceIds[0]).startsWith('ds\u001f')).toBe(true);

    // Public checksum is the M3 SHA-256 contract over the real bundle bytes.
    expect(manifest.checksum).toBe(`sha256:${sha256.hash(publishedFile)}`);
    expect(manifest.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);

    // Internal integrity checksum stays the domain FNV fingerprint.
    expect(snapshot.datasetVersions[0]!.checksum).toBe(
      catalogueFingerprint(snapshot),
    );
    expect(snapshot.datasetVersions[0]!.checksum).not.toMatch(/^sha256:/);

    // Counts provenance in review and manifest matches the real rows.
    expect(manifest.recordCounts).toEqual(countsOf(snapshot));
    expect(review.recordCounts).toEqual(countsOf(snapshot));
  });

  it('publishes the next changed generation on an advanced real baseline', async () => {
    const store = new FakeStore();
    const first = await stageGeneration(store, {
      products: [fictivolProduct(), placebexProduct(), vacantolProduct()],
    });
    expect(
      (
        await publish({
          config: first.config,
          candidateVersionId: first.candidateVersionId,
          approval: first.approval,
          ports: store.publishPorts(),
        })
      ).status,
    ).toBe('published');
    advanceBaseline(store, first.candidateVersionId, first.snapshot);
    const priorManifest = store.manifests.get(first.candidateVersionId);

    const second = await stageGeneration(store, {
      products: [
        { ...fictivolProduct(), dosageFormKey: 'DF-CAPSULE' },
        { ...placebexProduct(), commercialName: 'Placebex Renamed' },
        { sourceProductId: 'SP-NEWBEX', commercialName: 'Newbex' },
      ],
    });
    expect(second.review.diffSummary).toEqual({
      added: 1,
      changed: 1,
      renamed: 1,
      removed: 1,
      netProducts: 3,
    });

    const result = await publish({
      config: second.config,
      candidateVersionId: second.candidateVersionId,
      approval: second.approval,
      ports: store.publishPorts(),
    });
    expect(result.status).toBe('published');
    const manifest = store.manifests.get(second.candidateVersionId)!;
    expect(manifest.previousVersionId).toBe(first.candidateVersionId);
    expect(store.manifests.get(first.candidateVersionId)).toEqual(
      priorManifest,
    );
  });

  it('retries twice with the baseline advanced and writes no duplicate rows', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    expect(
      (
        await publish({
          config: generation.config,
          candidateVersionId: generation.candidateVersionId,
          approval: generation.approval,
          ports: store.publishPorts(),
        })
      ).status,
    ).toBe('published');
    advanceBaseline(store, generation.candidateVersionId, generation.snapshot);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const retry = await publish({
        config: generation.config,
        candidateVersionId: generation.candidateVersionId,
        approval: generation.approval,
        ports: store.publishPorts(),
      });
      expect(retry.status).toBe('already-published');
    }
    expect(store.files.size).toBe(1);
    expect(store.descriptors.size).toBe(1);
    expect(store.manifests.size).toBe(1);
    expect(store.callsTo('writeBundleFile')).toBe(1);
    expect(store.callsTo('writeDescriptorRow')).toBe(1);
    expect(store.callsTo('writeManifestRow')).toBe(1);
  });

  it('stages the same source deterministically across independent runs', async () => {
    const raw = buildRawDocument({
      products: [
        fictivolProduct(),
        { sourceProductId: 'SP-DIACRITIC', commercialName: 'Fictivă șînță âî' },
      ],
    });
    const firstStore = new FakeStore();
    const first = await stageGeneration(firstStore, raw);
    const secondStore = new FakeStore();
    const second = await stageGeneration(secondStore, raw);
    expect(second.candidateVersionId).toBe(first.candidateVersionId);
    expect(secondStore.candidates.get(second.candidateVersionId)).toEqual(
      firstStore.candidates.get(first.candidateVersionId),
    );
  });

  it('binds the encoding policy into the generation identity', async () => {
    const raw = buildRawDocument({ products: [fictivolProduct()] });
    const bytes = rawBytes(raw);

    const utf8Store = new FakeStore();
    const utf8 = await stageGeneration(
      utf8Store,
      raw,
      testConfig({ parserEncoding: 'utf-8' }),
    );
    const windowsStore = new FakeStore();
    const windows = await stageGeneration(
      windowsStore,
      raw,
      testConfig({ parserEncoding: 'windows-1250' }),
    );
    expect(windows.candidateVersionId).not.toBe(utf8.candidateVersionId);

    // A conflicting request encoding is quarantined before parsing.
    const conflictingStore = new FakeStore();
    const conflicting = await stage({
      config: testConfig({ parserEncoding: 'utf-8' }),
      snapshotBytes: bytes,
      encoding: 'windows-1250',
      ports: conflictingStore.stagePorts(),
    });
    expect(conflicting.status).toBe('quarantined');
    expect(conflicting.completenessStatus).toBe('encoding-mismatch');
    expect(conflictingStore.candidates.size).toBe(0);

    // An unsupported request encoding is quarantined before parsing.
    const unsupportedStore = new FakeStore();
    const unsupported = await stage({
      config: testConfig(),
      snapshotBytes: bytes,
      encoding: 'latin-1',
      ports: unsupportedStore.stagePorts(),
    });
    expect(unsupported.status).toBe('quarantined');
    expect(unsupported.completenessStatus).toBe('unsupported-encoding');
    expect(unsupportedStore.candidates.size).toBe(0);
  });

  it('quarantines a large drop and publishes it only with threshold approval', async () => {
    const config = testConfig({
      largeRemovalCount: 2,
      largeRemovalPercent: 40,
    });
    const store = new FakeStore();
    const first = await stageGeneration(
      store,
      {
        products: [
          fictivolProduct(),
          placebexProduct(),
          vacantolProduct(),
          { sourceProductId: 'SP-NEWBEX', commercialName: 'Newbex' },
        ],
      },
      config,
    );
    expect(
      (
        await publish({
          config,
          candidateVersionId: first.candidateVersionId,
          approval: first.approval,
          ports: store.publishPorts(),
        })
      ).status,
    ).toBe('published');
    advanceBaseline(store, first.candidateVersionId, first.snapshot);

    const second = await stageGeneration(
      store,
      { products: [fictivolProduct()] },
      config,
    );
    expect(second.review.largeRemovalRequired).toBe(true);
    expect(second.review.quarantineReason).toBe('large-removal');
    expect(store.quarantines.map((entry) => entry.reason)).toContain(
      'large-removal',
    );

    const refused = await publish({
      config,
      candidateVersionId: second.candidateVersionId,
      approval: second.approval,
      ports: store.publishPorts(),
    });
    expect(refused.status).toBe('rejected');
    expect(refused.reason).toBe('large-removal-approval-required');

    const accepted = await publish({
      config,
      candidateVersionId: second.candidateVersionId,
      approval: approve(second.review, {
        largeRemovalApproved: true,
        largeRemovalRequired: true,
      }),
      ports: store.publishPorts(),
    });
    expect(accepted.status).toBe('published');
  });

  it('completes an interrupted generation without duplicate public rows', async () => {
    const store = new FakeStore();
    const first = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    expect(
      (
        await publish({
          config: first.config,
          candidateVersionId: first.candidateVersionId,
          approval: first.approval,
          ports: store.publishPorts(),
        })
      ).status,
    ).toBe('published');
    advanceBaseline(store, first.candidateVersionId, first.snapshot);
    const priorManifest = store.manifests.get(first.candidateVersionId);

    const second = await stageGeneration(store, {
      products: [fictivolProduct(), placebexProduct()],
    });
    store.setFault(
      'writeManifestRow',
      transportFault('injected manifest failure'),
    );
    await expect(
      publish({
        config: second.config,
        candidateVersionId: second.candidateVersionId,
        approval: second.approval,
        ports: store.publishPorts(),
      }),
    ).rejects.toThrow('injected manifest failure');

    store.setFault('writeManifestRow', null);
    const resumed = await publish({
      config: second.config,
      candidateVersionId: second.candidateVersionId,
      approval: second.approval,
      ports: store.publishPorts(),
    });
    expect(resumed.status).toBe('published');
    expect(resumed.warnings).toContain('resumed-interrupted-publication');

    expect(store.manifests.size).toBe(2);
    expect(store.files.size).toBe(2);
    expect(store.descriptors.size).toBe(2);
    expect(store.callsTo('writeBundleFile')).toBe(2);
    expect(store.callsTo('writeDescriptorRow')).toBe(2);
    // one failed attempt on generation two plus one committed write each
    expect(store.callsTo('writeManifestRow')).toBe(3);
    expect(store.manifests.get(first.candidateVersionId)).toEqual(
      priorManifest,
    );
  });
});
