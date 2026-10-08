import { describe, expect, it } from 'vitest';
import {
  catalogueFingerprint,
  type MedicationCatalogueSnapshot,
} from '@intermed/domain';
import { publish } from '../../packages/importer/src/publisher';
import {
  AmbiguousWriteError,
  type CanonicalImporterConfig,
  PublicationConflictError,
  type PublishPorts,
  type ReviewApproval,
} from '../../packages/importer/src/core';
import {
  ambiguousFault,
  FakeStore,
  transportFault,
} from './support/fake-ports';
import { stageGeneration } from './support/harness';
import { fictivolProduct, placebexProduct } from './support/synthetic-raws';

function publishRequest(
  store: FakeStore,
  generation: {
    candidateVersionId: string;
    config: CanonicalImporterConfig;
    approval: ReviewApproval;
  },
  ports: PublishPorts = store.publishPorts(),
) {
  return publish({
    config: generation.config,
    candidateVersionId: generation.candidateVersionId,
    approval: generation.approval,
    ports,
  });
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

describe('publisher resumed and recovered baseline recheck under lock (Root confirmed F1)', () => {
  it('rejects stale-baseline on retry when candidate A has file persisted but descriptor and manifest missing, after baseline advances to B', async () => {
    const store = new FakeStore();
    const candA = await stageGeneration(store, {
      products: [fictivolProduct()],
    });

    // Interrupted prefix: file persisted, descriptor fails
    store.setFault(
      'writeDescriptorRow',
      transportFault('injected descriptor transport failure'),
    );
    await expect(publishRequest(store, candA)).rejects.toThrow(
      'injected descriptor transport failure',
    );
    expect(store.files.size).toBe(1);
    expect(store.descriptors.size).toBe(0);
    expect(store.manifests.size).toBe(0);

    // Candidate B stages and commits, advancing the active baseline
    const candB = await stageGeneration(store, {
      products: [placebexProduct()],
    });
    const resB = await publishRequest(store, candB);
    expect(resB.status).toBe('published');
    advanceBaseline(store, candB.candidateVersionId, candB.snapshot);

    const bDesc = store.descriptors.get(candB.candidateVersionId)!;
    const bFileKey = `${candB.candidateVersionId}/${bDesc.fileName}`;
    const bManifest = store.manifests.get(candB.candidateVersionId)!;
    const bBytes = store.files.get(bFileKey)!;

    // Retry candidate A: must recheck baseline under lock and reject stale-baseline
    const retryA = await publishRequest(store, candA);
    expect(retryA.status).toBe('rejected');
    expect(retryA.reason).toBe('stale-baseline');

    // Candidate B plus all existing bytes/rows preserved; candidate A wrote no descriptor or manifest
    expect(store.manifests.size).toBe(1);
    expect(store.manifests.get(candB.candidateVersionId)).toEqual(bManifest);
    expect(store.manifests.has(candA.candidateVersionId)).toBe(false);
    expect(store.descriptors.size).toBe(1);
    expect(store.descriptors.get(candB.candidateVersionId)).toEqual(bDesc);
    expect(store.descriptors.has(candA.candidateVersionId)).toBe(false);
    expect(store.files.size).toBe(2);
    expect(store.files.get(bFileKey)).toEqual(bBytes);
  });

  it('rejects stale-baseline on retry when candidate A has file and descriptor persisted but manifest missing, after baseline advances to B', async () => {
    const store = new FakeStore();
    const candA = await stageGeneration(store, {
      products: [fictivolProduct()],
    });

    // Interrupted prefix: file and descriptor persisted, manifest fails
    store.setFault(
      'writeManifestRow',
      transportFault('injected manifest transport failure'),
    );
    await expect(publishRequest(store, candA)).rejects.toThrow(
      'injected manifest transport failure',
    );
    expect(store.files.size).toBe(1);
    expect(store.descriptors.size).toBe(1);
    expect(store.manifests.size).toBe(0);

    // Candidate B stages and commits, advancing the active baseline
    const candB = await stageGeneration(store, {
      products: [placebexProduct()],
    });
    const resB = await publishRequest(store, candB);
    expect(resB.status).toBe('published');
    advanceBaseline(store, candB.candidateVersionId, candB.snapshot);

    const bDesc = store.descriptors.get(candB.candidateVersionId)!;
    const bFileKey = `${candB.candidateVersionId}/${bDesc.fileName}`;
    const bManifest = store.manifests.get(candB.candidateVersionId)!;
    const bBytes = store.files.get(bFileKey)!;

    const aDesc = store.descriptors.get(candA.candidateVersionId)!;
    const aFileKey = `${candA.candidateVersionId}/${aDesc.fileName}`;
    const aBytes = store.files.get(aFileKey)!;

    // Retry candidate A: must recheck baseline under lock and reject stale-baseline
    const retryA = await publishRequest(store, candA);
    expect(retryA.status).toBe('rejected');
    expect(retryA.reason).toBe('stale-baseline');

    // Candidate B manifest remains the active manifest; candidate A manifest is not written
    expect(store.manifests.size).toBe(1);
    expect(store.manifests.get(candB.candidateVersionId)).toEqual(bManifest);
    expect(store.manifests.has(candA.candidateVersionId)).toBe(false);
    expect(store.descriptors.get(candB.candidateVersionId)).toEqual(bDesc);
    expect(store.descriptors.get(candA.candidateVersionId)).toEqual(aDesc);
    expect(store.files.get(bFileKey)).toEqual(bBytes);
    expect(store.files.get(aFileKey)).toEqual(aBytes);
  });

  it('rejects stale-baseline during recovery when ambiguous write on missing manifest settles as partial, after baseline advances to B', async () => {
    const store = new FakeStore();
    const candA = await stageGeneration(store, {
      products: [fictivolProduct()],
    });

    // Seed candidate A with file and descriptor persisted, manifest missing
    store.setFault(
      'writeManifestRow',
      transportFault('initial manifest failure'),
    );
    await expect(publishRequest(store, candA)).rejects.toThrow(
      'initial manifest failure',
    );
    expect(store.files.size).toBe(1);
    expect(store.descriptors.size).toBe(1);
    expect(store.manifests.size).toBe(0);

    // Candidate B commits and advances the active baseline
    const candB = await stageGeneration(store, {
      products: [placebexProduct()],
    });
    const resB = await publishRequest(store, candB);
    expect(resB.status).toBe('published');
    advanceBaseline(store, candB.candidateVersionId, candB.snapshot);

    const bManifest = store.manifests.get(candB.candidateVersionId)!;

    // Retry candidate A where writeManifestRow encounters ambiguous write without landing
    store.setFault('writeManifestRow', ambiguousFault(false));
    const result = await publishRequest(store, candA);

    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('stale-baseline');
    expect(store.manifests.size).toBe(1);
    expect(store.manifests.get(candB.candidateVersionId)).toEqual(bManifest);
    expect(store.manifests.has(candA.candidateVersionId)).toBe(false);
  });

  it('rejects stale-baseline during recovery when conflict write on missing descriptor settles as partial, after baseline advances to B', async () => {
    const store = new FakeStore();
    const candA = await stageGeneration(store, {
      products: [fictivolProduct()],
    });

    // Seed candidate A with file persisted only
    store.setFault(
      'writeDescriptorRow',
      transportFault('initial descriptor failure'),
    );
    await expect(publishRequest(store, candA)).rejects.toThrow(
      'initial descriptor failure',
    );
    expect(store.files.size).toBe(1);
    expect(store.descriptors.size).toBe(0);
    expect(store.manifests.size).toBe(0);

    // Candidate B commits and advances the active baseline
    const candB = await stageGeneration(store, {
      products: [placebexProduct()],
    });
    const resB = await publishRequest(store, candB);
    expect(resB.status).toBe('published');
    advanceBaseline(store, candB.candidateVersionId, candB.snapshot);

    const bManifest = store.manifests.get(candB.candidateVersionId)!;

    // Retry candidate A where writeDescriptorRow encounters conflict error
    store.setFault('writeDescriptorRow', {
      error: new PublicationConflictError(),
    });
    const result = await publishRequest(store, candA);

    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('stale-baseline');
    expect(store.manifests.size).toBe(1);
    expect(store.manifests.get(candB.candidateVersionId)).toEqual(bManifest);
    expect(store.manifests.has(candA.candidateVersionId)).toBe(false);
    expect(store.descriptors.has(candA.candidateVersionId)).toBe(false);
  });

  it('rejects stale-baseline during genuine recovery when injected ambiguous write persists prefix and advances baseline to B', async () => {
    const store = new FakeStore();
    const candA = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    const candB = await stageGeneration(store, {
      products: [placebexProduct()],
    });
    const resB = await publishRequest(store, candB);
    expect(resB.status).toBe('published');

    const bManifest = store.manifests.get(candB.candidateVersionId)!;
    const bDesc = store.descriptors.get(candB.candidateVersionId)!;
    const bFileKey = `${candB.candidateVersionId}/${bDesc.fileName}`;
    const bBytes = store.files.get(bFileKey)!;

    store.baseline = {
      baselineVersionId: null,
      baselineFingerprint: null,
    };

    const realPorts = store.publishPorts();
    let injectedFaultCalls = 0;
    let recoveryWriteManifestCalls = 0;

    const wrappedPorts: PublishPorts = {
      ...realPorts,
      writeDescriptorRow: async (lease, datasetVersionId, descriptor) => {
        await realPorts.writeDescriptorRow(lease, datasetVersionId, descriptor);
        advanceBaseline(store, candB.candidateVersionId, candB.snapshot);
        injectedFaultCalls += 1;
        throw new AmbiguousWriteError();
      },
      writeManifestRow: async (lease, datasetVersionId, manifest) => {
        recoveryWriteManifestCalls += 1;
        return realPorts.writeManifestRow(lease, datasetVersionId, manifest);
      },
    };

    const result = await publishRequest(store, candA, wrappedPorts);

    expect(injectedFaultCalls).toBe(1);
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('stale-baseline');
    expect(recoveryWriteManifestCalls).toBe(0);
    expect(store.manifests.has(candA.candidateVersionId)).toBe(false);
    expect(store.manifests.size).toBe(1);
    expect(store.manifests.get(candB.candidateVersionId)).toEqual(bManifest);
    expect(store.descriptors.get(candB.candidateVersionId)).toEqual(bDesc);
    expect(store.files.get(bFileKey)).toEqual(bBytes);
  });

  it('rejects stale-baseline during genuine recovery when injected conflict on bundle file persists prefix and advances baseline to B', async () => {
    const store = new FakeStore();
    const candA = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    const candB = await stageGeneration(store, {
      products: [placebexProduct()],
    });
    const resB = await publishRequest(store, candB);
    expect(resB.status).toBe('published');

    const bManifest = store.manifests.get(candB.candidateVersionId)!;
    const bDesc = store.descriptors.get(candB.candidateVersionId)!;

    store.baseline = {
      baselineVersionId: null,
      baselineFingerprint: null,
    };

    const realPorts = store.publishPorts();
    let injectedFaultCalls = 0;
    let recoveryWriteDescriptorCalls = 0;
    let recoveryWriteManifestCalls = 0;

    const wrappedPorts: PublishPorts = {
      ...realPorts,
      writeBundleFile: async (lease, datasetVersionId, fileName, bytes) => {
        await realPorts.writeBundleFile(
          lease,
          datasetVersionId,
          fileName,
          bytes,
        );
        advanceBaseline(store, candB.candidateVersionId, candB.snapshot);
        injectedFaultCalls += 1;
        throw new PublicationConflictError();
      },
      writeDescriptorRow: async (lease, datasetVersionId, descriptor) => {
        recoveryWriteDescriptorCalls += 1;
        return realPorts.writeDescriptorRow(
          lease,
          datasetVersionId,
          descriptor,
        );
      },
      writeManifestRow: async (lease, datasetVersionId, manifest) => {
        recoveryWriteManifestCalls += 1;
        return realPorts.writeManifestRow(lease, datasetVersionId, manifest);
      },
    };

    const result = await publishRequest(store, candA, wrappedPorts);

    expect(injectedFaultCalls).toBe(1);
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('stale-baseline');
    expect(recoveryWriteDescriptorCalls).toBe(0);
    expect(recoveryWriteManifestCalls).toBe(0);
    expect(store.manifests.has(candA.candidateVersionId)).toBe(false);
    expect(store.descriptors.has(candA.candidateVersionId)).toBe(false);
    expect(store.manifests.get(candB.candidateVersionId)).toEqual(bManifest);
    expect(store.descriptors.get(candB.candidateVersionId)).toEqual(bDesc);
  });

  it('preserves identical committed ambiguous-write readback as green control', async () => {
    const store = new FakeStore();
    const candA = await stageGeneration(store, {
      products: [fictivolProduct()],
    });

    const realPorts = store.publishPorts();
    let manifestWriteCalls = 0;

    const wrappedPorts: PublishPorts = {
      ...realPorts,
      writeManifestRow: async (lease, datasetVersionId, manifest) => {
        manifestWriteCalls += 1;
        await realPorts.writeManifestRow(lease, datasetVersionId, manifest);
        throw new AmbiguousWriteError();
      },
    };

    const result = await publishRequest(store, candA, wrappedPorts);

    expect(manifestWriteCalls).toBe(1);
    expect(result.status).toBe('published');
    expect(result.warnings).toContain('post-commit-read-verified');
    expect(store.manifests.has(candA.candidateVersionId)).toBe(true);
  });

  it('preserves identical committed retry idempotency after baseline advance as green control', async () => {
    const store = new FakeStore();
    const candA = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    const resA = await publishRequest(store, candA);
    expect(resA.status).toBe('published');

    const candB = await stageGeneration(store, {
      products: [placebexProduct()],
    });
    const resB = await publishRequest(store, candB);
    expect(resB.status).toBe('published');
    advanceBaseline(store, candB.candidateVersionId, candB.snapshot);

    const descCallsBefore = store.callsTo('writeDescriptorRow');
    const manifestCallsBefore = store.callsTo('writeManifestRow');
    const fileCallsBefore = store.callsTo('writeBundleFile');

    const retryA = await publishRequest(store, candA);
    expect(retryA.status).toBe('already-published');
    expect(store.manifests.size).toBe(2);
    expect(store.manifests.get(candA.candidateVersionId)).toBeDefined();
    expect(store.manifests.get(candB.candidateVersionId)).toBeDefined();
    expect(store.callsTo('writeDescriptorRow')).toBe(descCallsBefore);
    expect(store.callsTo('writeManifestRow')).toBe(manifestCallsBefore);
    expect(store.callsTo('writeBundleFile')).toBe(fileCallsBefore);
  });
});

describe('manifest record counts bidirectional equality (Root confirmed F11)', () => {
  it('rejects stored divergent manifest with extra recordCounts key as publication-collision without updating or deleting any objects', async () => {
    const store = new FakeStore();
    const candA = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    const initial = await publishRequest(store, candA);
    expect(initial.status).toBe('published');

    // Mutate the stored manifest to have an extra key in recordCounts
    const storedManifest = store.manifests.get(candA.candidateVersionId)!;
    store.manifests.set(candA.candidateVersionId, {
      ...storedManifest,
      recordCounts: {
        ...storedManifest.recordCounts,
        extraSyntheticCount: 1,
      } as unknown as typeof storedManifest.recordCounts,
    });

    const beforeState = store.publicState();
    const manifestCallsBefore = store.callsTo('writeManifestRow');
    const descriptorCallsBefore = store.callsTo('writeDescriptorRow');
    const bundleCallsBefore = store.callsTo('writeBundleFile');

    const result = await publishRequest(store, candA);

    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('publication-collision');
    expect(result.issues).toContain('publication-manifest-conflict');
    expect(store.publicState()).toBe(beforeState);
    expect(store.callsTo('writeManifestRow')).toBe(manifestCallsBefore);
    expect(store.callsTo('writeDescriptorRow')).toBe(descriptorCallsBefore);
    expect(store.callsTo('writeBundleFile')).toBe(bundleCallsBefore);
  });

  it('recognizes already-published when record counts match bidirectionally as green control', async () => {
    const store = new FakeStore();
    const candA = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    const initial = await publishRequest(store, candA);
    expect(initial.status).toBe('published');

    const beforeState = store.publicState();
    const retry = await publishRequest(store, candA);

    expect(retry.status).toBe('already-published');
    expect(store.publicState()).toBe(beforeState);
    expect(store.callsTo('writeManifestRow')).toBe(1);
  });
});
