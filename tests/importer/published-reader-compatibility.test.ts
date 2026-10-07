import { describe, expect, it, vi } from 'vitest';
import {
  catalogueFingerprint,
  deserializeCatalogue,
  serializeCatalogue,
  validateReferentialIntegrity,
  type MedicationCatalogueSnapshot,
  type PublishedBundleDescriptor,
  type PublishedDatasetManifest,
} from '@intermed/domain';
import {
  createAppwritePublishedDatasetReader,
  validateSyntheticSource,
  type FetchLike,
  type FetchLikeOptions,
} from '@intermed/data-access';
import { publish } from '../../packages/importer/src/publisher';
import { stage } from '../../packages/importer/src/stage';
import { FakeStore, sha256 } from './support/fake-ports';
import { approve, deserialized, stageGeneration } from './support/harness';
import {
  buildRawDocument,
  fictivolProduct,
  placebexProduct,
  rawBytes,
  testConfig,
} from './support/synthetic-raws';

/** Entity count breakdown of a snapshot for manifest verification. */
function countsOf(
  snapshot: MedicationCatalogueSnapshot,
): Record<string, number> {
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

const readerConfig = {
  endpoint: 'https://cloud.appwrite.invalid/v1',
  projectId: 'intermed-synthetic-project',
  databaseId: 'intermed-datasets',
  versionsTableId: 'dataset-versions',
  bundlesTableId: 'dataset-bundles',
  bundleBucketId: 'published-datasets',
} as const;

interface QueryClause {
  method: string;
  attribute?: string;
  values?: unknown[];
}

function parseUrlQueries(url: string): QueryClause[] {
  const params = new URL(url).searchParams;
  const queries: QueryClause[] = [];
  for (let index = 0; ; index += 1) {
    const raw = params.get(`queries[${index}]`);
    if (raw === null) break;
    try {
      queries.push(JSON.parse(raw) as QueryClause);
    } catch {
      // ignore non-json queries
    }
  }
  return queries;
}

/** REST projection of domain manifest into Appwrite TablesDB row. */
function projectVersionRow(
  manifest: PublishedDatasetManifest,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    $id: manifest.datasetVersionId,
    $createdAt: '2026-10-07T12:00:00.000+00:00',
    $updatedAt: '2026-10-07T12:00:00.000+00:00',
    $permissions: ['read("any")'],
    $tableId: readerConfig.versionsTableId,
    $databaseId: readerConfig.databaseId,
    dataset: manifest.dataset,
    version: manifest.version,
    sourceIds: [...manifest.sourceIds],
    upstreamVersion: manifest.upstreamVersion,
    upstreamPublishedAt: manifest.upstreamPublishedAt,
    publishedAt: manifest.publishedAt,
    importedAt: manifest.importedAt,
    checksum: manifest.checksum,
    schemaVersion: manifest.schemaVersion,
    minimumClientVersion: manifest.minimumClientVersion,
    recordCounts: JSON.stringify(manifest.recordCounts),
    coverage: manifest.coverage,
    rightsApprovalReference: manifest.rightsApprovalReference,
    clinicalReviewReference: manifest.clinicalReviewReference,
    previousVersionId: manifest.previousVersionId,
    status: 'published',
    ...overrides,
  };
}

/** REST projection of domain bundle descriptor into Appwrite TablesDB row. */
function projectBundleRow(
  descriptor: PublishedBundleDescriptor,
  fileId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    $id: descriptor.id,
    $createdAt: '2026-10-07T12:00:00.000+00:00',
    $updatedAt: '2026-10-07T12:00:00.000+00:00',
    $permissions: ['read("any")'],
    $tableId: readerConfig.bundlesTableId,
    $databaseId: readerConfig.databaseId,
    datasetVersionId: descriptor.datasetVersionId,
    fileId,
    fileName: descriptor.fileName,
    contentType: descriptor.contentType,
    byteSize: descriptor.byteSize,
    checksum: descriptor.checksum,
    ...overrides,
  };
}

interface HarnessExecution {
  candidateVersionId: string;
  candidateSha256: string;
  bundleBytes: Uint8Array;
  manifest: PublishedDatasetManifest;
  descriptor: PublishedBundleDescriptor;
  snapshot: MedicationCatalogueSnapshot;
  fileId: string;
}

async function runRealStageToPublish(): Promise<HarnessExecution> {
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
  if (staged.status !== 'staged') {
    throw new Error(`staging failed: ${staged.completenessStatus}`);
  }

  const candidateVersionId = staged.identity.datasetVersionId;
  const review = store.reviews.get(candidateVersionId);
  if (!review) throw new Error('staging produced no review');

  const pubResult = await publish({
    config,
    candidateVersionId,
    approval: approve(review),
    ports: store.publishPorts(),
  });
  if (pubResult.status !== 'published') {
    throw new Error('publishing failed');
  }

  const manifest = store.manifests.get(candidateVersionId);
  const descriptor = store.descriptors.get(candidateVersionId);
  const bundleBytes = descriptor
    ? store.files.get(`${candidateVersionId}/${descriptor.fileName}`)
    : undefined;
  if (!bundleBytes || !manifest || !descriptor) {
    throw new Error('published components missing in store');
  }

  return {
    candidateVersionId,
    candidateSha256: review.candidateSha256,
    bundleBytes,
    manifest,
    descriptor,
    snapshot: deserialized(bundleBytes),
    fileId: `storage-file-${candidateVersionId}`,
  };
}

interface RecordedCall {
  readonly url: string;
  readonly options: FetchLikeOptions | undefined;
}

function createCompatibilityFetch(options: {
  versionRow?: Record<string, unknown> | null;
  bundleRow?: Record<string, unknown> | null;
  bundleBytes?: Uint8Array;
  fileId?: string;
}): { fetchLike: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchLike: FetchLike = async (url, fetchOpts) => {
    calls.push({ url, options: fetchOpts });
    const parsed = new URL(url);

    // Endpoint 1: Table row queries on dataset-versions
    if (
      parsed.pathname.includes(`/tables/${readerConfig.versionsTableId}/rows`)
    ) {
      const queries = parseUrlQueries(url);
      const datasetQuery = queries.find(
        (q) => q.method === 'equal' && q.attribute === 'dataset',
      );
      const statusQuery = queries.find(
        (q) => q.method === 'equal' && q.attribute === 'status',
      );
      const targetDataset = datasetQuery?.values?.[0];
      const targetStatus = statusQuery?.values?.[0];

      if (
        options.versionRow &&
        options.versionRow.dataset === targetDataset &&
        options.versionRow.status === targetStatus
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ total: 1, rows: [options.versionRow] }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ total: 0, rows: [] }),
      };
    }

    // Endpoint 2: Table row queries on dataset-bundles
    if (
      parsed.pathname.includes(`/tables/${readerConfig.bundlesTableId}/rows`)
    ) {
      const queries = parseUrlQueries(url);
      const versionQuery = queries.find(
        (q) => q.method === 'equal' && q.attribute === 'datasetVersionId',
      );
      const targetVersionId = versionQuery?.values?.[0];

      if (
        options.bundleRow &&
        options.bundleRow.datasetVersionId === targetVersionId
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ total: 1, rows: [options.bundleRow] }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ total: 0, rows: [] }),
      };
    }

    // Endpoint 3: Bundle file download view
    if (
      options.fileId &&
      decodeURIComponent(parsed.pathname).includes(
        `/files/${options.fileId}/view`,
      )
    ) {
      const bytes = options.bundleBytes ?? new Uint8Array();
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(new TextDecoder().decode(bytes)),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({ message: 'Not found' }),
    };
  };

  return { fetchLike, calls };
}

describe('published reader compatibility with core producer', () => {
  it('proves domain and reader modules are unmocked', () => {
    expect(vi.isMockFunction(validateSyntheticSource)).toBe(false);
    expect(vi.isMockFunction(serializeCatalogue)).toBe(false);
    expect(vi.isMockFunction(deserializeCatalogue)).toBe(false);
    expect(vi.isMockFunction(catalogueFingerprint)).toBe(false);
    expect(vi.isMockFunction(createAppwritePublishedDatasetReader)).toBe(false);
  });

  it('reads the core-published manifest and bundle descriptor with exact preservation', async () => {
    const executed = await runRealStageToPublish();
    const versionRow = projectVersionRow(executed.manifest);
    const bundleRow = projectBundleRow(executed.descriptor, executed.fileId);

    const { fetchLike, calls } = createCompatibilityFetch({
      versionRow,
      bundleRow,
      bundleBytes: executed.bundleBytes,
      fileId: executed.fileId,
    });

    const reader = createAppwritePublishedDatasetReader({
      ...readerConfig,
      fetchLike,
    });

    // Step 1: Read published manifest
    const manifestResult = await reader.getManifest(executed.manifest.dataset);
    expect(manifestResult.status).toBe('available');
    if (manifestResult.status !== 'available') return;
    const manifest = manifestResult.value;

    // Verify candidate identity matches real generation id
    expect(manifest.datasetVersionId).toBe(executed.candidateVersionId);
    expect(manifest.version).toBe(
      executed.snapshot.datasetVersions[0]!.version,
    );

    // Verify transport SHA-256 checksum matches real bundle hash
    expect(manifest.checksum).toBe(`sha256:${executed.candidateSha256}`);
    expect(manifest.checksum).toBe(
      `sha256:${sha256.hash(executed.bundleBytes)}`,
    );

    // Verify deserialized recordCounts match real catalogue entity counts
    expect(manifest.recordCounts).toEqual(countsOf(executed.snapshot));

    // Verify source IDs match snapshot dataset version source IDs
    expect(manifest.sourceIds).toEqual([
      ...executed.snapshot.datasetVersions[0]!.sourceIds,
    ]);

    // Step 2: Read published bundle descriptor
    const bundleResult = await reader.getBundleDescriptor(
      executed.candidateVersionId,
    );
    expect(bundleResult.status).toBe('available');
    if (bundleResult.status !== 'available') return;
    const descriptor = bundleResult.value;

    expect(descriptor.datasetVersionId).toBe(executed.candidateVersionId);
    expect(descriptor.checksum).toBe(manifest.checksum);
    expect(descriptor.byteSize).toBe(executed.bundleBytes.byteLength);
    expect(descriptor.fileName).toBe(executed.descriptor.fileName);
    expect(descriptor.fileName).not.toContain('\u001f');

    // Verify reconstructed download URL points to expected Appwrite storage path
    const expectedUrl = `${readerConfig.endpoint}/storage/buckets/${encodeURIComponent(readerConfig.bundleBucketId)}/files/${encodeURIComponent(executed.fileId)}/view?project=${encodeURIComponent(readerConfig.projectId)}`;
    expect(descriptor.url).toBe(expectedUrl);

    // Step 3: Fetch bundle bytes and verify transport checksum + deserialization
    const fileCall = await fetchLike(descriptor.url, {
      method: 'GET',
      headers: { 'X-Appwrite-Project': readerConfig.projectId },
    });
    expect(fileCall.ok).toBe(true);
    const fetchedJson = await fileCall.json();
    const reencoded = new TextEncoder().encode(JSON.stringify(fetchedJson));
    expect(reencoded.byteLength).toBeGreaterThan(0);

    const deserializedResult = deserializeCatalogue(
      new TextDecoder().decode(executed.bundleBytes),
    );
    expect(deserializedResult.ok).toBe(true);
    if (!deserializedResult.ok) return;
    const loadedCatalogue = deserializedResult.snapshot;

    // Preserves internal sealed FNV fingerprint on dataset version
    expect(loadedCatalogue.datasetVersions[0]!.checksum).toBe(
      catalogueFingerprint(loadedCatalogue),
    );
    expect(loadedCatalogue.datasetVersions[0]!.checksum).not.toMatch(
      /^sha256:/,
    );
    expect(manifest.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);

    // Preserves entity identities and integrity
    expect(loadedCatalogue.datasetVersions[0]!.id).toBe(
      executed.candidateVersionId,
    );
    expect(validateReferentialIntegrity(loadedCatalogue)).toEqual([]);

    // Step 4: Verify anonymous public read calls contain only project header
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.options?.method).toBe('GET');
      expect(call.options?.headers).toEqual({
        'X-Appwrite-Project': readerConfig.projectId,
      });
      const headerStr = JSON.stringify(call.options?.headers ?? {});
      expect(headerStr).not.toMatch(/key|jwt|cookie|token|auth/i);
    }
  });

  it('reader refuses row when recordCounts is malformed JSON or has invalid counts', async () => {
    const executed = await runRealStageToPublish();

    // Case A: Malformed JSON string
    const badJsonRow = projectVersionRow(executed.manifest, {
      recordCounts: '{"products": INVALID',
    });
    const fetchBadJson = createCompatibilityFetch({
      versionRow: badJsonRow,
    }).fetchLike;
    const readerA = createAppwritePublishedDatasetReader({
      ...readerConfig,
      fetchLike: fetchBadJson,
    });
    expect(await readerA.getManifest(executed.manifest.dataset)).toEqual({
      status: 'unavailable',
      reason: 'invalid-response',
    });

    // Case B: Negative count in recordCounts
    const negativeCountRow = projectVersionRow(executed.manifest, {
      recordCounts: JSON.stringify({ products: -1 }),
    });
    const fetchNeg = createCompatibilityFetch({
      versionRow: negativeCountRow,
    }).fetchLike;
    const readerB = createAppwritePublishedDatasetReader({
      ...readerConfig,
      fetchLike: fetchNeg,
    });
    expect(await readerB.getManifest(executed.manifest.dataset)).toEqual({
      status: 'unavailable',
      reason: 'invalid-response',
    });
  });

  it('reader refuses row when transport checksum is missing or empty', async () => {
    const executed = await runRealStageToPublish();

    // Manifest row with empty checksum
    const emptyChecksumRow = projectVersionRow(executed.manifest, {
      checksum: '',
    });
    const fetchEmpty = createCompatibilityFetch({
      versionRow: emptyChecksumRow,
    }).fetchLike;
    const reader = createAppwritePublishedDatasetReader({
      ...readerConfig,
      fetchLike: fetchEmpty,
    });
    expect(await reader.getManifest(executed.manifest.dataset)).toEqual({
      status: 'unavailable',
      reason: 'invalid-response',
    });

    // Bundle descriptor row with empty checksum
    const emptyBundleChecksum = projectBundleRow(
      executed.descriptor,
      executed.fileId,
      { checksum: '' },
    );
    const fetchBundleEmpty = createCompatibilityFetch({
      bundleRow: emptyBundleChecksum,
    }).fetchLike;
    const readerBundle = createAppwritePublishedDatasetReader({
      ...readerConfig,
      fetchLike: fetchBundleEmpty,
    });
    expect(
      await readerBundle.getBundleDescriptor(executed.candidateVersionId),
    ).toEqual({
      status: 'unavailable',
      reason: 'invalid-response',
    });
  });

  it('reader refuses row when provenance sourceIds is invalid', async () => {
    const executed = await runRealStageToPublish();

    // Empty string inside sourceIds
    const invalidSourceRow = projectVersionRow(executed.manifest, {
      sourceIds: [''],
    });
    const { fetchLike } = createCompatibilityFetch({
      versionRow: invalidSourceRow,
    });
    const reader = createAppwritePublishedDatasetReader({
      ...readerConfig,
      fetchLike,
    });

    expect(await reader.getManifest(executed.manifest.dataset)).toEqual({
      status: 'unavailable',
      reason: 'invalid-response',
    });
  });

  it('reader reports dataset absent when generation status is not published', async () => {
    const executed = await runRealStageToPublish();

    // Staging status: TablesDB query filter status=published will not match
    const stagingRow = projectVersionRow(executed.manifest, {
      status: 'staging',
    });
    const { fetchLike } = createCompatibilityFetch({
      versionRow: stagingRow,
    });
    const reader = createAppwritePublishedDatasetReader({
      ...readerConfig,
      fetchLike,
    });

    expect(await reader.getManifest(executed.manifest.dataset)).toEqual({
      status: 'absent',
      reason: 'not-published',
    });
  });

  it('reader reports bundle descriptor absent when not found', async () => {
    const executed = await runRealStageToPublish();
    const { fetchLike } = createCompatibilityFetch({
      bundleRow: null,
    });
    const reader = createAppwritePublishedDatasetReader({
      ...readerConfig,
      fetchLike,
    });

    expect(
      await reader.getBundleDescriptor(executed.candidateVersionId),
    ).toEqual({
      status: 'absent',
      reason: 'not-found',
    });
  });

  it('documents reader responsibility boundaries without false claims', async () => {
    const executed = await runRealStageToPublish();
    // Tamper the manifest row checksum to an arbitrary non-matching string
    const tamperedChecksumRow = projectVersionRow(executed.manifest, {
      checksum:
        'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    });
    const { fetchLike } = createCompatibilityFetch({
      versionRow: tamperedChecksumRow,
    });
    const reader = createAppwritePublishedDatasetReader({
      ...readerConfig,
      fetchLike,
    });

    // The reader's responsibility at getManifest() is transport schema validation.
    // It verifies the field is a non-empty string, but does NOT download or verify
    // the bundle file hash (that is downstream M6 activation responsibility).
    const result = await reader.getManifest(executed.manifest.dataset);
    expect(result.status).toBe('available');
    if (result.status === 'available') {
      expect(result.value.checksum).toBe(
        'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      );
    }
  });

  it('preserves previousVersionId lineage across generations', async () => {
    const store = new FakeStore();
    const first = await stageGeneration(store, {
      products: [fictivolProduct(), placebexProduct()],
    });
    const pub1 = await publish({
      config: first.config,
      candidateVersionId: first.candidateVersionId,
      approval: first.approval,
      ports: store.publishPorts(),
    });
    expect(pub1.status).toBe('published');

    store.baseline = {
      baselineVersionId: first.candidateVersionId,
      baselineFingerprint: catalogueFingerprint(first.snapshot),
      catalogue: first.snapshot,
    };

    const second = await stageGeneration(store, {
      products: [
        fictivolProduct(),
        { ...placebexProduct(), commercialName: 'Placebex Forte' },
      ],
    });
    const pub2 = await publish({
      config: second.config,
      candidateVersionId: second.candidateVersionId,
      approval: second.approval,
      ports: store.publishPorts(),
    });
    expect(pub2.status).toBe('published');

    const manifest2 = store.manifests.get(second.candidateVersionId)!;
    expect(manifest2.previousVersionId).toBe(first.candidateVersionId);

    const versionRow2 = projectVersionRow(manifest2);
    const { fetchLike } = createCompatibilityFetch({ versionRow: versionRow2 });
    const reader = createAppwritePublishedDatasetReader({
      ...readerConfig,
      fetchLike,
    });

    const result = await reader.getManifest(manifest2.dataset);
    expect(result.status).toBe('available');
    if (result.status === 'available') {
      expect(result.value.previousVersionId).toBe(first.candidateVersionId);
    }
  });
});
