import { describe, expect, it } from 'vitest';
import {
  catalogueFingerprint,
  deriveStableId,
  sealCatalogue,
  serializeCatalogue,
  type MedicationCatalogueSnapshot,
} from '@intermed/domain';
import { validateSyntheticSource } from '@intermed/data-access';
import { publish } from '../../packages/importer/src/publisher';
import {
  canonicalizeConfig,
  PublicationLeaseError,
  type PublishPorts,
  type ReviewApproval,
  type ReviewData,
} from '../../packages/importer/src/core';
import {
  ambiguousFault,
  codedAmbiguousFault,
  FakeStore,
  sha256,
  transportFault,
} from './support/fake-ports';
import { approve, stageGeneration } from './support/harness';
import {
  buildRawDocument,
  fictivolProduct,
  placebexProduct,
  testConfig,
} from './support/synthetic-raws';

function publishRequest(
  store: FakeStore,
  generation: {
    candidateVersionId: string;
    config: ReturnType<typeof testConfig>;
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

describe('publish approval and review binding', () => {
  it('rejects a missing candidate without touching the public store', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    store.candidates.clear();
    const result = await publishRequest(store, generation);
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('missing-candidate');
    expect(store.publicState()).toBe(
      JSON.stringify({ files: [], descriptors: [], manifests: [] }),
    );
  });

  it('rejects an approval without operational identity and references', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    for (const overrides of [
      { approvedBy: ' ' },
      { approvedAt: '' },
      { approvalReference: '' },
      { operationalApproval: false },
    ]) {
      const result = await publishRequest(store, {
        ...generation,
        approval: approve(generation.review, overrides),
      });
      expect(result.status).toBe('rejected');
      expect(result.reason).toBe('invalid-approval');
    }
    expect(store.publicState()).toBe(
      JSON.stringify({ files: [], descriptors: [], manifests: [] }),
    );
  });

  it('rejects a tampered approval binding', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    for (const overrides of [
      { configSha256: 'tampered' },
      { candidateSha256: 'tampered' },
      { candidateVersionId: 'dv-tampered' },
    ]) {
      const result = await publishRequest(store, {
        ...generation,
        approval: approve(generation.review, overrides),
      });
      expect(result.status).toBe('rejected');
      expect(result.reason).toBe('tampered-approval');
    }
  });

  it('rejects an approval whose raw snapshot hash does not match the review', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    const result = await publishRequest(store, {
      ...generation,
      approval: approve(generation.review, { rawSnapshotSha256: 'tampered' }),
    });
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('tampered-approval');
  });

  it('rejects a missing review', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    store.reviews.clear();
    const result = await publishRequest(store, generation);
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('missing-review');
  });

  it('rejects a review that does not bind config, candidate and baseline', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    for (const overrides of [
      { configSha256: 'tampered' },
      { candidateSha256: 'tampered' },
      { baselineVersionId: 'dv-other' },
      { baselineFingerprint: 'fingerprint-other' },
      { candidateVersionId: 'dv-other' },
    ]) {
      store.reviews.set(generation.candidateVersionId, {
        ...generation.review,
        ...overrides,
      });
      const result = await publishRequest(store, generation);
      expect(result.status).toBe('rejected');
      expect(result.reason).toBe('tampered-review');
    }
  });

  it('rejects an incomplete review', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    store.reviews.set(generation.candidateVersionId, {
      ...generation.review,
      completeness: 'partial' as ReviewData['completeness'],
    });
    const result = await publishRequest(store, generation);
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('incomplete-review');
  });

  it('rejects review record counts that do not match the real candidate', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    store.reviews.set(generation.candidateVersionId, {
      ...generation.review,
      recordCounts: {
        ...generation.review.recordCounts,
        products: generation.review.recordCounts.products + 1,
      },
    });
    const result = await publishRequest(store, generation);
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('tampered-review');
  });

  it('never publishes an empty catalogue even with fabricated approval', async () => {
    const store = new FakeStore();
    const raw = buildRawDocument({ products: [] });
    const validated = validateSyntheticSource({
      synthetic: true,
      dataSource: raw.dataSource,
      datasetVersion: raw.datasetVersion,
      products: raw.products,
      activeIngredients: raw.activeIngredients,
      medicationIngredients: raw.medicationIngredients,
      atcCodes: raw.atcCodes,
      dosageForms: raw.dosageForms,
      manufacturers: raw.manufacturers,
      marketingAuthorizationHolders: raw.marketingAuthorizationHolders,
      regulatoryDocuments: raw.regulatoryDocuments,
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const candidate = validated.snapshot;
    const bytes = new TextEncoder().encode(serializeCatalogue(candidate));
    const candidateVersionId = candidate.datasetVersions[0]!.id;
    store.candidates.set(candidateVersionId, bytes);
    const review: ReviewData = {
      candidateVersionId,
      configSha256: sha256.hash(canonicalizeConfig(testConfig())),
      rawSnapshotSha256: sha256.hash('raw'),
      candidateSha256: sha256.hash(bytes),
      baselineVersionId: null,
      baselineFingerprint: null,
      completeness: 'complete',
      recordCounts: {
        dataSources: 1,
        datasetVersions: 1,
        products: 0,
        activeIngredients: 0,
        medicationIngredients: 0,
        atcCodes: 0,
        dosageForms: 0,
        manufacturers: 0,
        marketingAuthorizationHolders: 0,
        regulatoryDocuments: 0,
      },
      diffSummary: {
        added: 0,
        changed: 0,
        renamed: 0,
        removed: 0,
        netProducts: 0,
      },
      largeRemovalRequired: false,
      issues: [],
    };
    store.reviews.set(candidateVersionId, review);
    const approval = approve(review, {
      largeRemovalApproved: true,
      largeRemovalRequired: false,
    });
    const result = await publish({
      config: testConfig(),
      candidateVersionId,
      approval,
      ports: store.publishPorts(),
    });
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('empty-catalogue');
    expect(store.publicState()).toBe(
      JSON.stringify({ files: [], descriptors: [], manifests: [] }),
    );
  });

  it('rejects a candidate whose inner dataset version id is not the candidate id', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    const foreignId = 'dv-foreign';
    store.candidates.set(
      foreignId,
      store.candidates.get(generation.candidateVersionId)!,
    );
    const forgedReview: ReviewData = {
      ...generation.review,
      candidateVersionId: foreignId,
    };
    store.reviews.set(foreignId, forgedReview);
    const result = await publishRequest(store, {
      ...generation,
      candidateVersionId: foreignId,
      approval: approve(forgedReview),
    });
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('candidate-identity-mismatch');
  });

  it('rejects candidate entity provenance that references another generation', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    const foreign = deriveStableId(
      'DatasetVersion',
      'source.fictivol',
      'other-generation',
    );
    expect(foreign.ok).toBe(true);
    if (!foreign.ok) return;
    const tampered = sealCatalogue({
      ...generation.snapshot,
      products: generation.snapshot.products.map((product, index) =>
        index === 0 ? { ...product, datasetVersionId: foreign.id } : product,
      ),
    });
    const bytes = new TextEncoder().encode(serializeCatalogue(tampered));
    store.candidates.set(generation.candidateVersionId, bytes);
    const forgedReview: ReviewData = {
      ...generation.review,
      candidateSha256: sha256.hash(bytes),
    };
    store.reviews.set(generation.candidateVersionId, forgedReview);
    const result = await publishRequest(store, {
      ...generation,
      approval: approve(forgedReview),
    });
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('provenance-mismatch');
    expect(store.manifests.size).toBe(0);
  });
});

describe('publish success contract', () => {
  it('writes the manifest last and binds real descriptor and manifest fields', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct(), placebexProduct()],
    });
    const result = await publishRequest(store, generation);
    expect(result.status).toBe('published');

    const writes = store.calls.filter(
      (name) =>
        name.startsWith('write') &&
        ![
          'writeCandidate',
          'writeReview',
          'writeRunSummary',
          'writeQuarantine',
        ].includes(name),
    );
    expect(writes).toEqual([
      'writeBundleFile',
      'writeDescriptorRow',
      'writeManifestRow',
    ]);

    const bytes = store.candidates.get(generation.candidateVersionId)!;
    const publicSha = `sha256:${sha256.hash(bytes)}`;
    const descriptor = store.descriptors.get(generation.candidateVersionId)!;
    expect(descriptor).toMatchObject({
      datasetVersionId: generation.candidateVersionId,
      fileName: `bundle-${generation.candidateVersionId}.json`,
      contentType: 'application/json',
      byteSize: bytes.length,
      checksum: publicSha,
      url: `https://published.invalid/bundle-${generation.candidateVersionId}.json`,
    });
    expect(descriptor.id).toHaveLength(36);

    const manifest = store.manifests.get(generation.candidateVersionId)!;
    const version = generation.snapshot.datasetVersions[0]!;
    expect(manifest.dataset).toBe(version.dataset);
    expect(manifest.version).toBe(version.version);
    expect(manifest.sourceIds).toEqual([...version.sourceIds]);
    expect(manifest.checksum).toBe(publicSha);
    expect(manifest.previousVersionId).toBe(
      generation.approval.baselineVersionId,
    );
    expect(manifest.publishedAt).toBe(store.publicationTimestamp);
    expect(manifest.recordCounts).toEqual({
      dataSources: 1,
      datasetVersions: 1,
      products: 2,
      activeIngredients: 2,
      medicationIngredients: 2,
      atcCodes: 0,
      dosageForms: 2,
      manufacturers: 0,
      marketingAuthorizationHolders: 0,
      regulatoryDocuments: 0,
    });
  });

  it('rejects unapproved large removals and publishes with threshold approval', async () => {
    const store = new FakeStore();
    const baseline = await stageGeneration(store, {
      products: [fictivolProduct(), placebexProduct()],
    });
    advanceBaseline(store, baseline.candidateVersionId, baseline.snapshot);
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    expect(generation.review.largeRemovalRequired).toBe(true);

    const refused = await publishRequest(store, generation);
    expect(refused.status).toBe('rejected');
    expect(refused.reason).toBe('large-removal-approval-required');

    const accepted = await publishRequest(store, {
      ...generation,
      approval: approve(generation.review, {
        largeRemovalApproved: true,
        largeRemovalRequired: true,
      }),
    });
    expect(accepted.status).toBe('published');
  });
});

describe('publish idempotency, resume and collisions', () => {
  it('recognizes a fully identical publication before the baseline check', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    expect((await publishRequest(store, generation)).status).toBe('published');

    store.baseline = {
      baselineVersionId: 'dv-someone-else',
      baselineFingerprint: 'fingerprint-someone-else',
    };
    const retry = await publishRequest(store, generation);
    expect(retry.status).toBe('already-published');
    expect(store.callsTo('writeBundleFile')).toBe(1);
    expect(store.callsTo('writeManifestRow')).toBe(1);
  });

  it('retries twice without duplicate rows while the baseline advanced', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    expect((await publishRequest(store, generation)).status).toBe('published');
    advanceBaseline(store, generation.candidateVersionId, generation.snapshot);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const retry = await publishRequest(store, generation);
      expect(retry.status).toBe('already-published');
    }
    expect(store.files.size).toBe(1);
    expect(store.descriptors.size).toBe(1);
    expect(store.manifests.size).toBe(1);
    expect(store.callsTo('writeBundleFile')).toBe(1);
    expect(store.callsTo('writeDescriptorRow')).toBe(1);
    expect(store.callsTo('writeManifestRow')).toBe(1);
  });

  it('resumes an interrupted publication creating only the missing components', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    store.setFault(
      'writeDescriptorRow',
      transportFault('injected descriptor failure'),
    );
    await expect(publishRequest(store, generation)).rejects.toThrow(
      'injected descriptor failure',
    );
    expect(store.files.size).toBe(1);
    expect(store.manifests.size).toBe(0);

    store.setFault('writeDescriptorRow', null);
    const resumed = await publishRequest(store, generation);
    expect(resumed.status).toBe('published');
    expect(resumed.warnings).toContain('resumed-interrupted-publication');
    expect(store.callsTo('writeBundleFile')).toBe(1);
    expect(store.callsTo('writeDescriptorRow')).toBe(2);
    expect(store.callsTo('writeManifestRow')).toBe(1);
    expect(store.manifests.size).toBe(1);
  });

  it('resumes after a lost manifest write by creating only the manifest', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    store.setFault(
      'writeManifestRow',
      transportFault('injected manifest failure'),
    );
    await expect(publishRequest(store, generation)).rejects.toThrow(
      'injected manifest failure',
    );
    expect(store.descriptors.size).toBe(1);
    expect(store.manifests.size).toBe(0);

    store.setFault('writeManifestRow', null);
    const resumed = await publishRequest(store, generation);
    expect(resumed.status).toBe('published');
    expect(resumed.warnings).toContain('resumed-interrupted-publication');
    expect(store.callsTo('writeBundleFile')).toBe(1);
    expect(store.callsTo('writeManifestRow')).toBe(2);
  });

  it('keeps an existing public orphan immutable and unadvertised', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    const key = `${generation.candidateVersionId}/bundle-${generation.candidateVersionId}.json`;
    store.files.set(key, new TextEncoder().encode('{"foreign":"orphan"}'));
    const before = store.publicState();

    const result = await publishRequest(store, generation);
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('publication-collision');
    expect(store.publicState()).toBe(before);
    expect(store.descriptors.size).toBe(0);
    expect(store.manifests.size).toBe(0);
  });

  it('rejects publication collisions without updates or deletes', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    expect((await publishRequest(store, generation)).status).toBe('published');
    const manifest = store.manifests.get(generation.candidateVersionId)!;
    store.manifests.set(generation.candidateVersionId, {
      ...manifest,
      checksum: 'sha256:0000',
    });
    const before = store.publicState();

    const retry = await publishRequest(store, generation);
    expect(retry.status).toBe('rejected');
    expect(retry.reason).toBe('publication-collision');
    expect(store.publicState()).toBe(before);
  });

  it('ignores REST metadata and datetime formatting when comparing publications', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    expect((await publishRequest(store, generation)).status).toBe('published');

    store.restNoise = true;
    const retry = await publishRequest(store, generation);
    expect(retry.status).toBe('already-published');
    expect(store.callsTo('writeManifestRow')).toBe(1);
  });

  it('treats a different publication datetime as a different publication', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    expect((await publishRequest(store, generation)).status).toBe('published');
    const manifest = store.manifests.get(generation.candidateVersionId)!;
    store.manifests.set(generation.candidateVersionId, {
      ...manifest,
      publishedAt: '2026-12-24T00:00:00Z',
    });

    const retry = await publishRequest(store, generation);
    expect(retry.status).toBe('rejected');
    expect(retry.reason).toBe('publication-collision');
    expect(store.callsTo('writeManifestRow')).toBe(1);
  });
});

describe('publish locking and baseline recheck', () => {
  it('requires a non-empty lease from the publication lock', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    const ports = store.publishPorts();
    ports.acquirePublicationLock = async () => ({
      lease: '',
      release: () => undefined,
    });
    let caught: unknown;
    try {
      await publishRequest(store, generation, ports);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PublicationLeaseError);
    expect((caught as PublicationLeaseError).code).toBe('invalid-lease');
    expect(store.publicState()).toBe(
      JSON.stringify({ files: [], descriptors: [], manifests: [] }),
    );
  });

  it('rejects when the baseline moved before the lock', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    store.baseline = {
      baselineVersionId: 'dv-someone-else',
      baselineFingerprint: 'fingerprint-someone-else',
    };
    const result = await publishRequest(store, generation);
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('stale-baseline');
    expect(store.manifests.size).toBe(0);
  });

  it('rejects when the baseline changes after acquiring the lock', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    const ports = store.publishPorts();
    const originalAcquire = ports.acquirePublicationLock;
    ports.acquirePublicationLock = async () => {
      const lock = await originalAcquire();
      store.baseline = {
        baselineVersionId: 'dv-concurrent',
        baselineFingerprint: 'fingerprint-concurrent',
      };
      return lock;
    };
    const result = await publishRequest(store, generation, ports);
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('stale-baseline');
    expect(store.manifests.size).toBe(0);
  });
});

describe('publish fault injection and commit point', () => {
  it.each([
    ['readCandidate'],
    ['readReview'],
    ['readBaseline'],
    ['sha256'],
    ['readPublishedBundleFile'],
    ['readPublishedDescriptor'],
    ['readPublishedManifest'],
    ['acquirePublicationLock'],
  ])('fails closed when %s fails', async (name) => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    store.setFault(name, transportFault(`injected ${name} failure`));
    await expect(publishRequest(store, generation)).rejects.toThrow(
      `injected ${name} failure`,
    );
    expect(store.publicState()).toBe(
      JSON.stringify({ files: [], descriptors: [], manifests: [] }),
    );
  });

  it.each([['writeBundleFile'], ['writeDescriptorRow'], ['writeManifestRow']])(
    'keeps prior published generations unchanged when %s fails',
    async (name) => {
      const store = new FakeStore();
      const first = await stageGeneration(store, {
        products: [fictivolProduct()],
      });
      expect((await publishRequest(store, first)).status).toBe('published');
      advanceBaseline(store, first.candidateVersionId, first.snapshot);
      const prior = {
        file: store.files.get(
          `${first.candidateVersionId}/bundle-${first.candidateVersionId}.json`,
        ),
        descriptor: store.descriptors.get(first.candidateVersionId),
        manifest: store.manifests.get(first.candidateVersionId),
      };

      const second = await stageGeneration(store, {
        products: [fictivolProduct(), placebexProduct()],
      });
      store.setFault(name, transportFault(`injected ${name} failure`));
      await expect(publishRequest(store, second)).rejects.toThrow(
        `injected ${name} failure`,
      );

      expect(
        store.files.get(
          `${first.candidateVersionId}/bundle-${first.candidateVersionId}.json`,
        ),
      ).toEqual(prior.file);
      expect(store.descriptors.get(first.candidateVersionId)).toEqual(
        prior.descriptor,
      );
      expect(store.manifests.get(first.candidateVersionId)).toEqual(
        prior.manifest,
      );
      expect(store.manifests.has(second.candidateVersionId)).toBe(false);
    },
  );

  it('reports a committed publication when the lock release fails', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    store.setFault('release', transportFault('injected release failure'));
    const result = await publishRequest(store, generation);
    expect(result.status).toBe('published');
    expect(result.warnings).toContain('lock-release-failed');
    expect(store.manifests.size).toBe(1);
  });

  it('reports a committed publication when the post-commit log fails', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    store.setFault('log', transportFault('injected log failure'));
    const result = await publishRequest(store, generation);
    expect(result.status).toBe('published');
    expect(result.warnings).toContain('log-failed');
    expect(store.manifests.size).toBe(1);
  });

  it('read verifies the commit after an ambiguous manifest write', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    store.setFault('writeManifestRow', ambiguousFault(true));
    const result = await publishRequest(store, generation);
    expect(result.status).toBe('published');
    expect(result.warnings).toContain('post-commit-read-verified');
    expect(store.manifests.size).toBe(1);
  });

  it('read verifies the commit with code-based ambiguity classification', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    store.setFault('writeManifestRow', codedAmbiguousFault(true));
    const result = await publishRequest(store, generation);
    expect(result.status).toBe('published');
    expect(result.warnings).toContain('post-commit-read-verified');
  });

  it('read verifies and resumes after an ambiguous bundle write', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    store.setFault('writeBundleFile', ambiguousFault(true));
    const result = await publishRequest(store, generation);
    expect(result.status).toBe('published');
    expect(result.warnings).toContain('resumed-interrupted-publication');
    expect(store.manifests.size).toBe(1);
  });

  it('resumes when an ambiguous manifest write did not land', async () => {
    const store = new FakeStore();
    const generation = await stageGeneration(store, {
      products: [fictivolProduct()],
    });
    store.setFault('writeManifestRow', ambiguousFault(false));
    const result = await publishRequest(store, generation);
    expect(result.status).toBe('published');
    expect(result.warnings).toContain('resumed-interrupted-publication');
    expect(store.callsTo('writeManifestRow')).toBe(2);
  });
});
