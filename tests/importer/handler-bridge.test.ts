/**
 * Bridge contracts: StagePorts/PublishPorts mapped onto the injected Appwrite
 * store through a stateful fake REST surface. Real serializer, validator and
 * crypto are used throughout; only the HTTP boundary is faked.
 */
import {
  deserializeCatalogue,
  type MedicationCatalogueSnapshot,
  type PublishedBundleDescriptor,
  type PublishedDatasetManifest,
} from '@intermed/domain';
import { createHash } from 'node:crypto';
import { PublicationConflictError } from '@intermed/importer';
import { createAppwriteStore } from '../../infra/appwrite/functions/import-anmdmr/src/appwrite-store.js';
import {
  createPublishBridge,
  createStageBridge,
  publicBundleDownloadUrl,
} from '../../infra/appwrite/functions/import-anmdmr/src/storage-bridge.js';
import {
  bundleFileId,
  candidateFileId,
  candidateFileName,
  quarantineFileId,
  quarantineFileName,
  reviewFileId,
  runRowId,
} from '../../infra/appwrite/functions/import-anmdmr/src/intent.js';
import {
  candidateBytes,
  createHarness,
  DATASET,
  describe,
  expect,
  it,
  SAFE_LOG_PATTERN,
  SENTINEL,
  sha256Hex,
  SOURCE_VERSION,
  STAGE_OPERATION,
  TEST_CONFIG,
} from './handler-fixtures';
import { bytesToText, utf8Bytes } from './fake-appwrite-rest';

const CANDIDATE_ID = 'abc123def456';
const sha256 = { hash: sha256Hex };

interface ReviewDataShape {
  configSha256: string;
  rawSnapshotSha256: string;
  candidateSha256: string;
  diffSummary: {
    added: number;
    changed: number;
    renamed: number;
    removed: number;
    netProducts: number;
  };
  largeRemovalRequired: boolean;
  issues: string[];
}

interface JournalShape {
  baseline: {
    baselineVersionId: string | null;
    baselineFingerprint: string | null;
  };
  manifestCommitted: boolean;
  lockReleaseFailed: boolean;
  orphan: {
    filePresent: boolean;
    descriptorPresent: boolean;
    manifestPresent: boolean;
    fileSha256: string;
  } | null;
  [key: string]: unknown;
}

interface LockHandle {
  release: () => Promise<void>;
}

interface StagePortsShape {
  readBaseline: () => Promise<unknown>;
  writeQuarantine: (
    runId: string,
    bytes: Uint8Array,
    reason: string,
    issues: string[],
  ) => Promise<void>;
  writeCandidate: (id: string, bytes: Uint8Array) => Promise<void>;
  writeReview: (id: string, data: ReviewDataShape) => Promise<void>;
  writeRunSummary: (runId: string, summary: unknown) => Promise<void>;
  log: (message: string) => void;
}

interface PublishPortsShape {
  readPublished: () => Promise<unknown>;
  writeBundleFile: (
    id: string,
    name: string,
    bytes: Uint8Array,
  ) => Promise<void>;
  writeDescriptorRow: (
    id: string,
    descriptor: PublishedBundleDescriptor,
  ) => Promise<void>;
  writeManifestRow: (
    id: string,
    manifest: PublishedDatasetManifest,
  ) => Promise<void>;
  acquirePublicationLock: () => Promise<LockHandle>;
}

interface Bridge<T> {
  ports: T;
  journal: JournalShape;
  logs: string[];
}

type Harness = ReturnType<typeof createHarness>;

function storeFor(harness: Harness) {
  return createAppwriteStore({
    fetch: harness.rest.fetch as unknown as typeof fetch,
    endpoint: 'https://fra.cloud.appwrite.io/v1',
    projectId: 'intermed-dev',
    serverKey: SENTINEL,
  }) as unknown as {
    createPrivateRow: (
      tableId: string,
      rowId: string,
      data: Record<string, unknown>,
    ) => Promise<unknown>;
  };
}

function baseOptions(harness: Harness, logs: string[]) {
  void harness;
  return {
    sha256,
    deserializeCatalogue,
    log: (message: string) => logs.push(message),
    config: {
      ...TEST_CONFIG,
      syntheticAllowlist: [...TEST_CONFIG.syntheticAllowlist],
    },
    dataset: DATASET,
    stageOperationId: STAGE_OPERATION,
    issuedAt: '2026-10-07T09:00:00Z',
    now: () => new Date('2026-10-07T11:00:00.000Z'),
    randomToken: () => 'f'.repeat(48),
    newPublicationConflict: () => new PublicationConflictError(),
  };
}

function stageBridge(harness: Harness): Bridge<StagePortsShape> {
  const logs: string[] = [];
  const bridge = createStageBridge({
    store: storeFor(harness),
    ...baseOptions(harness, logs),
  }) as unknown as Bridge<StagePortsShape>;
  return { ...bridge, logs };
}

function publishBridge(
  harness: Harness,
  overrides: Record<string, unknown> = {},
): Bridge<PublishPortsShape> {
  const logs: string[] = [];
  const bridge = createPublishBridge({
    store: storeFor(harness),
    ...baseOptions(harness, logs),
    candidateVersionId: CANDIDATE_ID,
    baselineVersionId: null,
    baselineFingerprint: null,
    ...overrides,
  }) as unknown as Bridge<PublishPortsShape>;
  return { ...bridge, logs };
}

function reviewData(): ReviewDataShape {
  return {
    configSha256: sha256Hex('config'),
    rawSnapshotSha256: sha256Hex('raw'),
    candidateSha256: sha256Hex('candidate'),
    diffSummary: {
      added: 3,
      changed: 1,
      renamed: 0,
      removed: 0,
      netProducts: 3,
    },
    largeRemovalRequired: false,
    issues: ['note one', 'note two'],
  };
}

function manifestFixture(
  overrides: Partial<PublishedDatasetManifest> = {},
): PublishedDatasetManifest {
  return {
    dataset: DATASET,
    datasetVersionId: CANDIDATE_ID,
    version: SOURCE_VERSION,
    sourceIds: ['source.synthetic'],
    upstreamVersion: null,
    upstreamPublishedAt: null,
    publishedAt: '2026-10-07T11:00:00.000Z',
    importedAt: '2026-10-06T00:00:00Z',
    checksum: `sha256:${'a'.repeat(64)}`,
    schemaVersion: 'medication-catalogue-1',
    minimumClientVersion: '0.0.0',
    recordCounts: { products: 3, activeIngredients: 2 },
    coverage: 'Fictional coverage only. Not for clinical use.',
    rightsApprovalReference: 'FICT-APPROVAL-0001',
    clinicalReviewReference: 'FICT-REVIEW-0001',
    previousVersionId: null,
    ...overrides,
  };
}

function descriptorFixture(byteSize: number): PublishedBundleDescriptor {
  return {
    id: 'd'.repeat(36),
    datasetVersionId: CANDIDATE_ID,
    fileName: `bundle-${CANDIDATE_ID}.json`,
    contentType: 'application/json',
    byteSize,
    checksum: `sha256:${'b'.repeat(64)}`,
    url: 'https://published.invalid/never-persisted.json',
  };
}

describe('run row projection', () => {
  it('writes import-runs rows valid against the configured schema', async () => {
    const harness = createHarness();
    const bridge = stageBridge(harness);
    await bridge.ports.writeRunSummary('run-1', {
      runId: 'run-1',
      status: 'staged',
      datasetVersionId: CANDIDATE_ID,
      reviewData: reviewData(),
    });
    const row = harness.rest.rows
      .get('import-runs')
      ?.get(runRowId(sha256, 'run-1'));
    expect(row).toBeDefined();
    const keys = Object.keys(row ?? {})
      .filter((key) => !key.startsWith('$'))
      .sort();
    expect(keys).toEqual([
      'completenessStatus',
      'counts',
      'diffSummary',
      'importerVersion',
      'publicationStatus',
      'snapshotVersion',
      'sourceId',
      'startedAt',
      'validationFailures',
    ]);
    expect(row?.sourceId).toBe(TEST_CONFIG.sourceKey);
    expect(row?.snapshotVersion).toBe(SOURCE_VERSION);
    expect(row?.importerVersion).toBe(TEST_CONFIG.importerVersion);
    expect(row?.completenessStatus).toBe('complete');
    expect(row?.publicationStatus).toBe('staged');
    expect(String(row?.startedAt)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(() => JSON.parse(String(row?.counts))).not.toThrow();
    expect(() => JSON.parse(String(row?.diffSummary))).not.toThrow();
    expect(() => JSON.parse(String(row?.validationFailures))).not.toThrow();
    expect(JSON.parse(String(row?.counts))).toEqual(reviewData().diffSummary);
    harness.dispose();
  });

  it('bounds run summaries and quarantines byte-exact raw material', async () => {
    const harness = createHarness();
    const bridge = stageBridge(harness);
    const hugeIssues = Array.from(
      { length: 200 },
      (_unused, index) => `issue ${index} ${'x'.repeat(500)}`,
    );
    await bridge.ports.writeQuarantine(
      'run-2',
      utf8Bytes('raw-bytes-for-quarantine'),
      'malformed-snapshot',
      hugeIssues,
    );
    const stored = harness.rest.files
      .get('quarantine')
      ?.get(quarantineFileId(sha256, 'run-2', 'malformed-snapshot'));
    expect(stored).toBeDefined();
    expect(bytesToText(stored?.bytes ?? new Uint8Array())).toBe(
      'raw-bytes-for-quarantine',
    );
    expect(stored?.name).toBe(quarantineFileName('malformed-snapshot'));
    const row = harness.rest.rows
      .get('import-runs')
      ?.get(runRowId(sha256, 'run-2'));
    const failures = JSON.parse(String(row?.validationFailures)) as unknown[];
    expect(failures.length).toBeLessThanOrEqual(20);
    expect(String(row?.validationFailures).length).toBeLessThanOrEqual(8000);
    expect(row?.completenessStatus).toBe('malformed-snapshot');
    expect(row?.publicationStatus).toBe('quarantined');
    harness.dispose();
  });

  it('reuses a private row on collision only when every field matches', async () => {
    const harness = createHarness();
    const bridge = stageBridge(harness);
    const summary = {
      runId: 'run-3',
      status: 'staged',
      datasetVersionId: CANDIDATE_ID,
      reviewData: reviewData(),
    };
    await bridge.ports.writeRunSummary('run-3', summary);
    await bridge.ports.writeRunSummary('run-3', summary);
    expect(harness.rest.rowIds('import-runs')).toEqual([
      runRowId(sha256, 'run-3'),
    ]);
    harness.dispose();

    const clash = createHarness();
    const other = stageBridge(clash);
    await storeFor(clash).createPrivateRow(
      'import-runs',
      runRowId(sha256, 'run-3'),
      {
        sourceId: 'source.other',
        snapshotVersion: 'other',
        importerVersion: 'other',
        startedAt: '2026-10-07T09:00:00Z',
        completenessStatus: 'other',
        publicationStatus: 'other',
      },
    );
    await expect(other.ports.writeRunSummary('run-3', summary)).rejects.toThrow(
      /collision/i,
    );
    const row = clash.rest.rows
      .get('import-runs')
      ?.get(runRowId(sha256, 'run-3'));
    expect(row?.sourceId).toBe('source.other');
    clash.dispose();
  });
});

describe('candidate and review namespaces', () => {
  it('stores candidates as immutable reused private files', async () => {
    const harness = createHarness();
    const bridge = stageBridge(harness);
    const bytes = utf8Bytes('{"candidate":true}');
    await bridge.ports.writeCandidate(CANDIDATE_ID, bytes);
    await bridge.ports.writeCandidate(CANDIDATE_ID, bytes);
    const fileId = candidateFileId(sha256, CANDIDATE_ID);
    expect(harness.rest.fileIds('import-run-logs')).toEqual([fileId]);
    const stored = harness.rest.files.get('import-run-logs')?.get(fileId);
    expect(bytesToText(stored?.bytes ?? new Uint8Array())).toBe(
      '{"candidate":true}',
    );
    expect(stored?.name).toBe(candidateFileName(CANDIDATE_ID));
    expect(harness.rest.fileIds('published-datasets')).toEqual([]);
    harness.dispose();
  });

  it('keeps one immutable review per candidate and baseline binding', async () => {
    const harness = createHarness();
    const first = stageBridge(harness);
    await first.ports.writeReview(CANDIDATE_ID, reviewData());
    await first.ports.writeReview(CANDIDATE_ID, reviewData());
    const expectedId = reviewFileId(sha256, {
      stageOperationId: STAGE_OPERATION,
      candidateVersionId: CANDIDATE_ID,
      baselineVersionId: null,
      baselineFingerprint: null,
    });
    expect(harness.rest.fileIds('import-run-logs')).toContain(expectedId);

    const moved = stageBridge(harness);
    moved.journal.baseline = {
      baselineVersionId: 'base-2',
      baselineFingerprint: `sha256:${'e'.repeat(64)}`,
    };
    await moved.ports.writeReview(CANDIDATE_ID, reviewData());
    const movedId = reviewFileId(sha256, {
      stageOperationId: STAGE_OPERATION,
      candidateVersionId: CANDIDATE_ID,
      baselineVersionId: 'base-2',
      baselineFingerprint: `sha256:${'e'.repeat(64)}`,
    });
    expect(movedId).not.toBe(expectedId);
    expect(harness.rest.fileIds('import-run-logs')).toContain(movedId);

    const stored = harness.rest.files.get('import-run-logs')?.get(expectedId);
    const parsed = JSON.parse(
      bytesToText(stored?.bytes ?? new Uint8Array()),
    ) as { purpose: string; baselineVersionId: string | null };
    expect(parsed.purpose).toBe('intermed-stage-review/v1');
    expect(parsed.baselineVersionId).toBeNull();
    harness.dispose();
  });

  it('filters core log messages down to bounded content-free events', async () => {
    const harness = createHarness();
    const bridge = stageBridge(harness);
    bridge.ports.log(`leaked raw content ${SENTINEL}`);
    expect(bridge.logs.join('\n')).not.toContain(SENTINEL);
    expect(bridge.logs.join('\n')).not.toContain('leaked');
    for (const line of bridge.logs) expect(line).toMatch(SAFE_LOG_PATTERN);
    harness.dispose();
  });
});

describe('publication writes', () => {
  it('writes file, descriptor row and manifest row last with the M3 projection', async () => {
    const harness = createHarness();
    const bridge = publishBridge(harness);
    const bytes = utf8Bytes('{"bundle":true}');
    await bridge.ports.writeBundleFile(
      CANDIDATE_ID,
      `bundle-${CANDIDATE_ID}.json`,
      bytes,
    );
    await bridge.ports.writeDescriptorRow(
      CANDIDATE_ID,
      descriptorFixture(bytes.length),
    );
    await bridge.ports.writeManifestRow(CANDIDATE_ID, manifestFixture());

    const writeCalls = harness.rest.calls
      .filter((call) => call.method === 'POST')
      .map((call) => call.path);
    expect(writeCalls).toEqual([
      '/v1/storage/buckets/published-datasets/files',
      '/v1/tablesdb/intermed-datasets/tables/dataset-bundles/rows',
      '/v1/tablesdb/intermed-datasets/tables/dataset-versions/rows',
    ]);
    for (const call of harness.rest.calls) {
      expect(call.method).not.toBe('DELETE');
      expect(call.method).not.toBe('PUT');
      expect(call.method).not.toBe('PATCH');
    }

    const bundleId = bundleFileId(sha256, CANDIDATE_ID);
    const bundle = harness.rest.files.get('published-datasets')?.get(bundleId);
    expect(bytesToText(bundle?.bytes ?? new Uint8Array())).toBe(
      '{"bundle":true}',
    );
    expect(bundle?.name).toBe(`bundle-${CANDIDATE_ID}.json`);

    const descriptor = harness.rest.rows
      .get('dataset-bundles')
      ?.get('d'.repeat(36));
    expect(descriptor).toBeDefined();
    const descriptorKeys = Object.keys(descriptor ?? {})
      .filter((key) => !key.startsWith('$'))
      .sort();
    expect(descriptorKeys).toEqual([
      'byteSize',
      'checksum',
      'contentType',
      'datasetVersionId',
      'fileId',
      'fileName',
    ]);
    expect(descriptor?.fileId).toBe(bundleId);
    expect(JSON.stringify(descriptor)).not.toContain('published.invalid');

    const manifest = harness.rest.rows
      .get('dataset-versions')
      ?.get(CANDIDATE_ID);
    expect(manifest).toBeDefined();
    const manifestKeys = Object.keys(manifest ?? {})
      .filter((key) => !key.startsWith('$'))
      .sort();
    expect(manifestKeys).toEqual([
      'checksum',
      'clinicalReviewReference',
      'coverage',
      'dataset',
      'importedAt',
      'minimumClientVersion',
      'publishedAt',
      'recordCounts',
      'rightsApprovalReference',
      'schemaVersion',
      'sourceIds',
      'status',
      'version',
    ]);
    expect(manifest?.status).toBe('published');
    expect(manifest?.dataset).toBe(DATASET);
    expect(manifest?.previousVersionId).toBeUndefined();
    expect(typeof manifest?.recordCounts).toBe('string');
    expect(JSON.parse(String(manifest?.recordCounts))).toEqual({
      products: 3,
      activeIngredients: 2,
    });
    expect(Array.isArray(manifest?.sourceIds)).toBe(true);
    harness.dispose();
  });

  it('converts genuine 409 responses into publication conflicts only', async () => {
    const harness = createHarness();
    const bridge = publishBridge(harness);
    const bytes = utf8Bytes('{"bundle":true}');
    harness.rest.failWhen(
      (call) => call.path.endsWith('/published-datasets/files'),
      { status: 409, message: 'fake conflict', times: 1 },
    );
    await expect(
      bridge.ports.writeBundleFile(
        CANDIDATE_ID,
        `bundle-${CANDIDATE_ID}.json`,
        bytes,
      ),
    ).rejects.toThrow(/already exists/i);

    harness.rest.failWhen(() => true, {
      status: 500,
      message: 'backend down',
    });
    await expect(
      bridge.ports.writeBundleFile(
        CANDIDATE_ID,
        `bundle-${CANDIDATE_ID}.json`,
        bytes,
      ),
    ).rejects.toThrow(/Backend error/);
    harness.dispose();
  });

  it('derives the real Appwrite public download URL from the trusted runtime', () => {
    expect(publicBundleDownloadUrl('file-0001')).toBe(
      'https://fra.cloud.appwrite.io/v1/storage/buckets/published-datasets/files/file-0001/download?project=intermed-dev',
    );
  });
});

describe('publication lock', () => {
  it('takes a fresh random owner per attempt and never reuses approval references', async () => {
    const harness = createHarness();
    const tokens = ['1'.repeat(48), '2'.repeat(48), '3'.repeat(48)];
    let index = 0;
    const bridge = publishBridge(harness, {
      randomToken: () => tokens[index++ % tokens.length] as string,
      approvalReference: 'FICT-APPROVAL-0001',
    });
    const first = await bridge.ports.acquirePublicationLock();
    const held = harness.rest.rows.get('import-runs')?.get('lock');
    expect(held?.approvalReference).toBe(tokens[0]);
    expect(held?.approvalReference).not.toBe('FICT-APPROVAL-0001');
    await first.release();
    const second = await bridge.ports.acquirePublicationLock();
    const reheld = harness.rest.rows.get('import-runs')?.get('lock');
    expect(reheld?.approvalReference).toBe(tokens[1]);
    await second.release();
    expect(harness.rest.rows.get('import-runs')?.has('lock')).toBe(false);
    harness.dispose();
  });

  it('fails closed while another attempt holds the global lock', async () => {
    const harness = createHarness();
    const first = publishBridge(harness, { randomToken: () => 'a'.repeat(48) });
    const second = publishBridge(harness, {
      randomToken: () => 'b'.repeat(48),
    });
    const lock = await first.ports.acquirePublicationLock();
    await expect(second.ports.acquirePublicationLock()).rejects.toThrow(
      /busy/i,
    );
    await lock.release();
    harness.dispose();
  });

  it('reports the committed outcome when lock release fails after a valid manifest', async () => {
    const harness = createHarness();
    const bridge = publishBridge(harness);
    const bytes = utf8Bytes('{"bundle":true}');
    const lock = await bridge.ports.acquirePublicationLock();
    await bridge.ports.writeBundleFile(
      CANDIDATE_ID,
      `bundle-${CANDIDATE_ID}.json`,
      bytes,
    );
    await bridge.ports.writeDescriptorRow(
      CANDIDATE_ID,
      descriptorFixture(bytes.length),
    );
    await bridge.ports.writeManifestRow(CANDIDATE_ID, manifestFixture());
    harness.rest.failWhen((call) => call.method === 'DELETE', {
      status: 500,
      message: 'release failed',
    });
    await expect(lock.release()).resolves.toBeUndefined();
    expect(bridge.journal.lockReleaseFailed).toBe(true);
    expect(bridge.journal.manifestCommitted).toBe(true);
    expect(harness.rest.rows.get('dataset-versions')?.has(CANDIDATE_ID)).toBe(
      true,
    );
    harness.dispose();
  });

  it('propagates a lock release failure when nothing was committed', async () => {
    const harness = createHarness();
    const bridge = publishBridge(harness);
    const lock = await bridge.ports.acquirePublicationLock();
    harness.rest.failWhen((call) => call.method === 'DELETE', {
      status: 500,
      message: 'release failed',
    });
    await expect(lock.release()).rejects.toThrow();
    harness.dispose();
  });
});

describe('publication retry reads', () => {
  it('determines actual content even when the descriptor row is an orphan', async () => {
    const harness = createHarness();
    const bridge = publishBridge(harness);
    const bytes = utf8Bytes('{"bundle":true}');
    await bridge.ports.writeBundleFile(
      CANDIDATE_ID,
      `bundle-${CANDIDATE_ID}.json`,
      bytes,
    );
    await expect(bridge.ports.readPublished()).resolves.toBeNull();
    const orphan = bridge.journal.orphan;
    expect(orphan?.filePresent).toBe(true);
    expect(orphan?.descriptorPresent).toBe(false);
    expect(orphan?.manifestPresent).toBe(false);
    expect(orphan?.fileSha256).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
    harness.dispose();
  });

  it('returns the complete published triple for a finished publication', async () => {
    const harness = createHarness();
    const bridge = publishBridge(harness);
    const bytes = utf8Bytes('{"bundle":true}');
    await bridge.ports.writeBundleFile(
      CANDIDATE_ID,
      `bundle-${CANDIDATE_ID}.json`,
      bytes,
    );
    await bridge.ports.writeDescriptorRow(
      CANDIDATE_ID,
      descriptorFixture(bytes.length),
    );
    await bridge.ports.writeManifestRow(CANDIDATE_ID, manifestFixture());
    const published = (await bridge.ports.readPublished()) as {
      bytes: Uint8Array;
      descriptor: PublishedBundleDescriptor;
      manifest: PublishedDatasetManifest;
    } | null;
    expect(published).not.toBeNull();
    expect(bytesToText(published?.bytes ?? new Uint8Array())).toBe(
      '{"bundle":true}',
    );
    expect(published?.descriptor.id).toBe('d'.repeat(36));
    expect(published?.manifest.datasetVersionId).toBe(CANDIDATE_ID);
    harness.dispose();
  });
});

function countsOf(
  catalogue: MedicationCatalogueSnapshot,
): Record<string, number> {
  return {
    products: catalogue.products.length,
    activeIngredients: catalogue.activeIngredients.length,
    medicationIngredients: catalogue.medicationIngredients.length,
    atcCodes: catalogue.atcCodes.length,
    dosageForms: catalogue.dosageForms.length,
    manufacturers: catalogue.manufacturers.length,
    marketingAuthorizationHolders:
      catalogue.marketingAuthorizationHolders.length,
    regulatoryDocuments: catalogue.regulatoryDocuments.length,
  };
}

describe('baseline reads', () => {
  it('reads and verifies the published baseline through a real manifest query', async () => {
    const harness = createHarness();
    const bridge = stageBridge(harness);
    const bytes = candidateBytes();
    const checksum = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const catalogue = JSON.parse(
      bytesToText(bytes),
    ) as MedicationCatalogueSnapshot;
    harness.seedFile(
      'published-datasets',
      bundleFileId(sha256, 'base-1'),
      'bundle-base-1.json',
      bytes,
    );
    harness.seedRow('dataset-bundles', 'b'.repeat(36), {
      datasetVersionId: 'base-1',
      fileId: bundleFileId(sha256, 'base-1'),
      fileName: 'bundle-base-1.json',
      contentType: 'application/json',
      byteSize: String(bytes.length),
      checksum,
    });
    harness.seedRow('dataset-versions', 'base-1', {
      dataset: DATASET,
      version: 'base-version',
      sourceIds: ['source.synthetic'],
      importedAt: '2026-10-06T00:00:00Z',
      checksum,
      schemaVersion: 'medication-catalogue-1',
      minimumClientVersion: '0.0.0',
      recordCounts: JSON.stringify(countsOf(catalogue)),
      coverage: 'Fictional coverage only. Not for clinical use.',
      rightsApprovalReference: 'FICT-APPROVAL-0000',
      clinicalReviewReference: 'FICT-REVIEW-0000',
      previousVersionId: null,
      status: 'published',
    });
    const baseline = (await bridge.ports.readBaseline()) as {
      baselineVersionId: string | null;
      baselineFingerprint: string | null;
      catalogue: MedicationCatalogueSnapshot;
    };
    expect(baseline.baselineVersionId).toBe('base-1');
    expect(baseline.baselineFingerprint).toBe(checksum);
    expect(baseline.catalogue.products.length).toBe(catalogue.products.length);
    harness.dispose();
  });

  it('fails closed when the published bundle checksum does not verify', async () => {
    const harness = createHarness();
    const bridge = stageBridge(harness);
    const bytes = candidateBytes();
    const catalogue = JSON.parse(
      bytesToText(bytes),
    ) as MedicationCatalogueSnapshot;
    harness.seedFile(
      'published-datasets',
      bundleFileId(sha256, 'base-1'),
      'bundle-base-1.json',
      bytes,
    );
    harness.seedRow('dataset-bundles', 'b'.repeat(36), {
      datasetVersionId: 'base-1',
      fileId: bundleFileId(sha256, 'base-1'),
      fileName: 'bundle-base-1.json',
      contentType: 'application/json',
      byteSize: String(bytes.length),
      checksum: `sha256:${'9'.repeat(64)}`,
    });
    harness.seedRow('dataset-versions', 'base-1', {
      dataset: DATASET,
      version: 'base-version',
      sourceIds: ['source.synthetic'],
      importedAt: '2026-10-06T00:00:00Z',
      checksum: `sha256:${'9'.repeat(64)}`,
      schemaVersion: 'medication-catalogue-1',
      minimumClientVersion: '0.0.0',
      recordCounts: JSON.stringify(countsOf(catalogue)),
      coverage: 'Fictional coverage only. Not for clinical use.',
      rightsApprovalReference: 'FICT-APPROVAL-0000',
      clinicalReviewReference: 'FICT-REVIEW-0000',
      status: 'published',
    });
    await expect(bridge.ports.readBaseline()).rejects.toThrow(/verif/i);
    harness.dispose();
  });

  it('reports an empty baseline when nothing is published', async () => {
    const harness = createHarness();
    const bridge = stageBridge(harness);
    const baseline = (await bridge.ports.readBaseline()) as {
      baselineVersionId: string | null;
      baselineFingerprint: string | null;
    };
    expect(baseline.baselineVersionId).toBeNull();
    expect(baseline.baselineFingerprint).toBeNull();
    harness.dispose();
  });
});
