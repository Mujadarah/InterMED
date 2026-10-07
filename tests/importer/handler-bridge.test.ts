/**
 * Bridge contracts: StagePorts/PublishPorts mapped onto the injected Appwrite
 * store through a stateful fake of the real REST surface (streaming bodies,
 * flat rows with real metadata, real Storage `bucketId`, SDK query objects).
 * Real serializer, validator, deserializer and crypto throughout.
 */
import {
  deserializeCatalogue,
  type MedicationCatalogueSnapshot,
  type PublishedBundleDescriptor,
  type PublishedDatasetManifest,
} from '@intermed/domain';
import {
  AmbiguousWriteError,
  PublicationConflictError,
  PublicationLeaseError,
} from '@intermed/importer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  publicationRowId,
  quarantineFileId,
  reviewFileId,
  runRowId,
} from '../../infra/appwrite/functions/import-anmdmr/src/intent.js';
import {
  APPROVED_AT,
  candidateBytes,
  catalogueCounts,
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
import { bytesToText, FAKE_TABLES, utf8Bytes } from './fake-appwrite-rest.mjs';

const CANDIDATE_ID = 'abc123def456';
const sha256 = { hash: sha256Hex };

interface ReviewDataShape {
  candidateVersionId: string;
  configSha256: string;
  rawSnapshotSha256: string;
  candidateSha256: string;
  baselineVersionId: string | null;
  baselineFingerprint: string | null;
  completeness: 'complete';
  recordCounts: Record<string, number>;
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

interface LockHandle {
  lease: string;
  release: () => Promise<void>;
}

interface StagePortsShape {
  readBaseline: () => Promise<{
    baselineVersionId: string | null;
    baselineFingerprint: string | null;
    catalogue?: MedicationCatalogueSnapshot;
  }>;
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
  readPublishedBundleFile: (
    datasetVersionId: string,
    fileName: string,
  ) => Promise<Uint8Array | null>;
  readPublishedDescriptor: (
    datasetVersionId: string,
  ) => Promise<PublishedBundleDescriptor | null>;
  readPublishedManifest: (
    datasetVersionId: string,
  ) => Promise<PublishedDatasetManifest | null>;
  acquirePublicationLock: () => Promise<LockHandle>;
  writeBundleFile: (
    lease: string,
    id: string,
    name: string,
    bytes: Uint8Array,
  ) => Promise<void>;
  writeDescriptorRow: (
    lease: string,
    id: string,
    descriptor: PublishedBundleDescriptor,
  ) => Promise<void>;
  writeManifestRow: (
    lease: string,
    id: string,
    manifest: PublishedDatasetManifest,
  ) => Promise<void>;
  publicationTimestamp?: string;
}

interface Bridge<T> {
  ports: T;
  journal: Record<string, unknown>;
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
    getFileMetadata: (
      bucketId: string,
      fileId: string,
    ) => Promise<Record<string, unknown>>;
  };
}

function coreErrors() {
  return {
    newPublicationConflict: () => new PublicationConflictError(),
    newAmbiguousWrite: () => new AmbiguousWriteError(),
    newPublicationLease: () => new PublicationLeaseError(),
  };
}

function baseOptions(logs: string[]) {
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
    randomToken: () => 'f'.repeat(48),
    ...coreErrors(),
  };
}

function stageBridge(harness: Harness): Bridge<StagePortsShape> {
  const logs: string[] = [];
  const bridge = createStageBridge({
    store: storeFor(harness),
    ...baseOptions(logs),
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
    ...baseOptions(logs),
    candidateVersionId: CANDIDATE_ID,
    baselineVersionId: null,
    baselineFingerprint: null,
    publicationTimestamp: APPROVED_AT,
    ...overrides,
  }) as unknown as Bridge<PublishPortsShape>;
  return { ...bridge, logs };
}

function reviewData(): ReviewDataShape {
  return {
    candidateVersionId: CANDIDATE_ID,
    configSha256: sha256Hex('config'),
    rawSnapshotSha256: sha256Hex('raw'),
    candidateSha256: sha256Hex('candidate'),
    baselineVersionId: null,
    baselineFingerprint: null,
    completeness: 'complete',
    recordCounts: {
      dataSources: 1,
      datasetVersions: 1,
      products: 3,
      activeIngredients: 2,
      medicationIngredients: 2,
      atcCodes: 1,
      dosageForms: 1,
      manufacturers: 1,
      marketingAuthorizationHolders: 1,
      regulatoryDocuments: 0,
    },
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
    sourceIds: ['dsrclnksource.syntheticsynthetic'],
    upstreamVersion: null,
    upstreamPublishedAt: null,
    publishedAt: APPROVED_AT,
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
    url: publicBundleDownloadUrl(bundleFileId(sha256, CANDIDATE_ID)),
  };
}

describe('Appwrite REST shape fidelity', () => {
  it('keeps the fake column schema identical to the config as code', () => {
    const config = JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          'infra',
          'appwrite',
          'appwrite.config.development.json',
        ),
        'utf8',
      ),
    ) as { tables: { $id: string; columns: unknown[] }[] };
    for (const table of config.tables) {
      expect(FAKE_TABLES[table.$id as keyof typeof FAKE_TABLES]).toEqual(
        table.columns,
      );
    }
  });

  it('returns real streaming Responses and the real bucketId context field', async () => {
    const harness = createHarness();
    const bridge = stageBridge(harness);
    await bridge.ports.writeCandidate(CANDIDATE_ID, utf8Bytes('{}'));
    const metadata = (await storeFor(harness).getFileMetadata(
      'import-run-logs',
      candidateFileId(sha256, CANDIDATE_ID),
    )) as Record<string, unknown>;
    expect(metadata.bucketId).toBe('import-run-logs');
    const rawResponse = await harness.rest.fetch(
      'https://fra.cloud.appwrite.io/v1/storage/buckets/import-run-logs/files/' +
        `${candidateFileId(sha256, CANDIDATE_ID)}`,
      {
        headers: {
          'X-Appwrite-Project': 'intermed-dev',
          'X-Appwrite-Key': SENTINEL,
        },
      },
    );
    expect(typeof rawResponse.body?.getReader).toBe('function');
    const payload = (await rawResponse.json()) as Record<string, unknown>;
    expect(payload.bucketId).toBe('import-run-logs');
    expect(payload.$bucketId).toBeUndefined();
    harness.dispose();
  });
});

describe('run row projection', () => {
  it('writes import-runs rows valid against the configured schema', async () => {
    const harness = createHarness();
    const bridge = stageBridge(harness);
    await bridge.ports.writeReview(CANDIDATE_ID, reviewData());
    await bridge.ports.writeRunSummary('run-1', {
      runId: 'run-1',
      status: 'staged',
      completenessStatus: 'complete',
      datasetVersionId: CANDIDATE_ID,
      issueCodes: ['note one', 'note two'],
      largeRemovalRequired: false,
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
    expect(row?.completenessStatus).toBe('complete');
    expect(row?.publicationStatus).toBe('staged');
    expect(String(row?.startedAt)).toBe('2026-10-07T09:00:00Z');
    expect(() => JSON.parse(String(row?.counts))).not.toThrow();
    expect(() => JSON.parse(String(row?.diffSummary))).not.toThrow();
    expect(JSON.parse(String(row?.validationFailures))).toEqual([
      'note one',
      'note two',
    ]);
    harness.dispose();
  });

  it('quarantines byte-exact raw material in the quarantine bucket', async () => {
    const harness = createHarness();
    const bridge = stageBridge(harness);
    await bridge.ports.writeQuarantine(
      'run-2',
      utf8Bytes('raw-bytes-for-quarantine'),
      'malformed-json',
      ['json-parse'],
    );
    const stored = harness.rest.files
      .get('quarantine')
      ?.get(quarantineFileId(sha256, 'run-2', 'malformed-json'));
    expect(bytesToText(stored?.bytes ?? new Uint8Array())).toBe(
      'raw-bytes-for-quarantine',
    );
    expect(stored?.name).toBe('quarantine-v1.malformed-json.raw');
    harness.dispose();
  });

  it('reuses a private row on collision only when every field matches', async () => {
    const harness = createHarness();
    const bridge = stageBridge(harness);
    await bridge.ports.writeReview(CANDIDATE_ID, reviewData());
    const summary = {
      runId: 'run-3',
      status: 'staged',
      completenessStatus: 'complete',
      datasetVersionId: CANDIDATE_ID,
      issueCodes: ['note one', 'note two'],
      largeRemovalRequired: false,
    };
    await bridge.ports.writeRunSummary('run-3', summary);
    await bridge.ports.writeRunSummary('run-3', summary);
    expect(harness.rest.rowIds('import-runs')).toEqual([
      runRowId(sha256, 'run-3'),
    ]);

    const clash = createHarness();
    const other = stageBridge(clash);
    await other.ports.writeReview(CANDIDATE_ID, reviewData());
    await storeFor(clash).createPrivateRow(
      'import-runs',
      runRowId(sha256, 'run-3'),
      {
        sourceId: 'source.other',
        snapshotVersion: 'other',
        importerVersion: 'other',
        startedAt: '2026-10-07T09:00:00.000Z',
        completenessStatus: 'other',
        publicationStatus: 'other',
      },
    );
    await expect(other.ports.writeRunSummary('run-3', summary)).rejects.toThrow(
      /collision/i,
    );
    expect(
      clash.rest.rows.get('import-runs')?.get(runRowId(sha256, 'run-3'))
        ?.sourceId,
    ).toBe('source.other');
    clash.dispose();
    harness.dispose();
  });
});

describe('candidate and review namespaces', () => {
  it('stores candidates as immutable reused private files', async () => {
    const harness = createHarness();
    const bridge = stageBridge(harness);
    const bytes = utf8Bytes('{"candidate":true}');
    await bridge.ports.writeCandidate(CANDIDATE_ID, bytes);
    await bridge.ports.writeCandidate(CANDIDATE_ID, bytes);
    expect(harness.rest.fileIds('import-run-logs')).toEqual([
      candidateFileId(sha256, CANDIDATE_ID),
    ]);
    expect(
      harness.rest.files
        .get('import-run-logs')
        ?.get(candidateFileId(sha256, CANDIDATE_ID))?.name,
    ).toBe(candidateFileName(candidateFileId(sha256, CANDIDATE_ID)));
    expect(harness.rest.fileIds('published-datasets')).toEqual([]);
    harness.dispose();
  });

  it('binds the immutable review to baseline, hashes, counts and completeness', async () => {
    const harness = createHarness();
    const bridge = stageBridge(harness);
    const data = reviewData();
    await bridge.ports.writeReview(CANDIDATE_ID, data);
    const fileId = reviewFileId(sha256, {
      stageOperationId: STAGE_OPERATION,
      candidateVersionId: CANDIDATE_ID,
      baselineVersionId: null,
      baselineFingerprint: null,
    });
    const stored = harness.rest.files.get('import-run-logs')?.get(fileId);
    const parsed = JSON.parse(
      bytesToText(stored?.bytes ?? new Uint8Array()),
    ) as Record<string, unknown>;
    expect(parsed.purpose).toBe('intermed-stage-review/v1');
    expect(parsed.completeness).toBe('complete');
    expect(parsed.recordCounts).toEqual(data.recordCounts);
    expect(parsed.baselineVersionId).toBeNull();
    expect(parsed.candidateSha256).toBe(data.candidateSha256);

    const moved = stageBridge(harness);
    await moved.ports.writeReview(CANDIDATE_ID, {
      ...data,
      baselineVersionId: 'base-2',
      baselineFingerprint: `sha256:${'e'.repeat(64)}`,
    });
    const movedId = reviewFileId(sha256, {
      stageOperationId: STAGE_OPERATION,
      candidateVersionId: CANDIDATE_ID,
      baselineVersionId: 'base-2',
      baselineFingerprint: `sha256:${'e'.repeat(64)}`,
    });
    expect(movedId).not.toBe(fileId);
    expect(harness.rest.fileIds('import-run-logs')).toContain(movedId);
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
    const lock = await bridge.ports.acquirePublicationLock();
    await bridge.ports.writeBundleFile(
      lock.lease,
      CANDIDATE_ID,
      `bundle-${CANDIDATE_ID}.json`,
      bytes,
    );
    await bridge.ports.writeDescriptorRow(
      lock.lease,
      CANDIDATE_ID,
      descriptorFixture(bytes.length),
    );
    await bridge.ports.writeManifestRow(
      lock.lease,
      CANDIDATE_ID,
      manifestFixture(),
    );

    const writeCalls = harness.rest.calls
      .filter(
        (call: { method: string; path: string; search: string }) =>
          call.method === 'POST',
      )
      .map(
        (call: { method: string; path: string; search: string }) => call.path,
      );
    expect(writeCalls.slice(-3)).toEqual([
      '/v1/storage/buckets/published-datasets/files',
      '/v1/tablesdb/intermed-datasets/tables/dataset-bundles/rows',
      '/v1/tablesdb/intermed-datasets/tables/dataset-versions/rows',
    ]);
    for (const call of harness.rest.calls) {
      expect(call.method).not.toBe('PUT');
      expect(call.method).not.toBe('PATCH');
    }

    const bundleId = bundleFileId(sha256, CANDIDATE_ID);
    const bundle = harness.rest.files.get('published-datasets')?.get(bundleId);
    expect(bytesToText(bundle?.bytes ?? new Uint8Array())).toBe(
      '{"bundle":true}',
    );
    const descriptor = harness.rest.rows
      .get('dataset-bundles')
      ?.get('d'.repeat(36));
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
      ?.get(publicationRowId(sha256, CANDIDATE_ID));
    expect(manifest?.status).toBe('published');
    expect(manifest?.publishedAt).toBe(APPROVED_AT);
    expect(typeof manifest?.recordCounts).toBe('string');
    await lock.release();
    harness.dispose();
  });

  it('refuses writes from any foreign lease', async () => {
    const harness = createHarness();
    const bridge = publishBridge(harness);
    await expect(
      bridge.ports.writeBundleFile(
        'e'.repeat(48),
        CANDIDATE_ID,
        `bundle-${CANDIDATE_ID}.json`,
        utf8Bytes('{}'),
      ),
    ).rejects.toBeInstanceOf(PublicationLeaseError);
    expect(harness.rest.fileIds('published-datasets')).toEqual([]);
    harness.dispose();
  });

  it('maps genuine 409 to conflicts and lost write responses to ambiguity', async () => {
    const harness = createHarness();
    const bridge = publishBridge(harness);
    const bytes = utf8Bytes('{"bundle":true}');
    const lock = await bridge.ports.acquirePublicationLock();
    harness.rest.failWhen(
      (call: { method: string; path: string; search: string }) =>
        call.path.endsWith('/published-datasets/files'),
      { status: 409, message: 'fake conflict', times: 1 },
    );
    await expect(
      bridge.ports.writeBundleFile(
        lock.lease,
        CANDIDATE_ID,
        `bundle-${CANDIDATE_ID}.json`,
        bytes,
      ),
    ).rejects.toBeInstanceOf(PublicationConflictError);

    harness.rest.failWhen(
      (call: { method: string; path: string; search: string }) =>
        call.path.endsWith('/dataset-versions/rows'),
      {
        error: new Error('connection lost'),
        applyBeforeThrow: true,
        times: 1,
      },
    );
    await expect(
      bridge.ports.writeManifestRow(
        lock.lease,
        CANDIDATE_ID,
        manifestFixture(),
      ),
    ).rejects.toBeInstanceOf(AmbiguousWriteError);
    expect(
      harness.rest.rows
        .get('dataset-versions')
        ?.has(publicationRowId(sha256, CANDIDATE_ID)),
    ).toBe(true);
    harness.dispose();
  });

  it('derives the real Appwrite public download URL from the trusted runtime', () => {
    const fileId = bundleFileId(sha256, CANDIDATE_ID);
    expect(publicBundleDownloadUrl(fileId)).toBe(
      `https://fra.cloud.appwrite.io/v1/storage/buckets/published-datasets/files/${fileId}/download?project=intermed-dev`,
    );
  });
});

describe('publication retry reads', () => {
  it('reads each published component separately and reports orphans', async () => {
    const harness = createHarness();
    const bridge = publishBridge(harness);
    const bytes = utf8Bytes('{"bundle":true}');
    const lock = await bridge.ports.acquirePublicationLock();
    await bridge.ports.writeBundleFile(
      lock.lease,
      CANDIDATE_ID,
      `bundle-${CANDIDATE_ID}.json`,
      bytes,
    );
    await expect(
      bridge.ports.readPublishedBundleFile(
        CANDIDATE_ID,
        `bundle-${CANDIDATE_ID}.json`,
      ),
    ).resolves.toEqual(bytes);
    await expect(
      bridge.ports.readPublishedDescriptor(CANDIDATE_ID),
    ).resolves.toBeNull();
    await expect(
      bridge.ports.readPublishedManifest(CANDIDATE_ID),
    ).resolves.toBeNull();
    harness.dispose();
  });

  it('projects the descriptor url to the real download URL for retry comparison', async () => {
    const harness = createHarness();
    const bridge = publishBridge(harness);
    const bytes = utf8Bytes('{"bundle":true}');
    const lock = await bridge.ports.acquirePublicationLock();
    await bridge.ports.writeBundleFile(
      lock.lease,
      CANDIDATE_ID,
      `bundle-${CANDIDATE_ID}.json`,
      bytes,
    );
    await bridge.ports.writeDescriptorRow(
      lock.lease,
      CANDIDATE_ID,
      descriptorFixture(bytes.length),
    );
    await bridge.ports.writeManifestRow(
      lock.lease,
      CANDIDATE_ID,
      manifestFixture(),
    );
    const descriptor = await bridge.ports.readPublishedDescriptor(CANDIDATE_ID);
    expect(descriptor).not.toBeNull();
    expect(descriptor?.id).toBe('d'.repeat(36));
    expect(descriptor?.url).toBe(
      publicBundleDownloadUrl(bundleFileId(sha256, CANDIDATE_ID)),
    );
    const manifest = await bridge.ports.readPublishedManifest(CANDIDATE_ID);
    expect(manifest?.datasetVersionId).toBe(CANDIDATE_ID);
    expect(manifest?.publishedAt).toBe(APPROVED_AT);
    harness.dispose();
  });
});

describe('publication lock', () => {
  it('takes a fresh random lease per attempt and never reuses approval references', async () => {
    const harness = createHarness();
    const tokens = ['1'.repeat(48), '2'.repeat(48)];
    let index = 0;
    const bridge = publishBridge(harness, {
      randomToken: () => tokens[index++ % tokens.length] as string,
    });
    const first = await bridge.ports.acquirePublicationLock();
    expect(first.lease).toBe(tokens[0]);
    expect(
      harness.rest.rows.get('import-runs')?.get('lock')?.approvalReference,
    ).toBe(tokens[0]);
    await first.release();
    const second = await bridge.ports.acquirePublicationLock();
    expect(second.lease).toBe(tokens[1]);
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
});

describe('baseline reads', () => {
  function seedBaseline(harness: Harness, checksum: string) {
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
      byteSize: bytes.length,
      checksum,
    });
    harness.seedRow('dataset-versions', 'base-1', {
      dataset: DATASET,
      version: 'base-version',
      sourceIds: ['dsrclnksource.syntheticsynthetic'],
      importedAt: '2026-10-06T00:00:00Z',
      checksum,
      schemaVersion: 'medication-catalogue-1',
      minimumClientVersion: '0.0.0',
      recordCounts: JSON.stringify(
        catalogueCounts(catalogue as unknown as Record<string, unknown>),
      ),
      coverage: 'Fictional coverage only. Not for clinical use.',
      rightsApprovalReference: 'FICT-APPROVAL-0000',
      clinicalReviewReference: 'FICT-REVIEW-0000',
      previousVersionId: null,
      status: 'published',
    });
    return { bytes, catalogue };
  }

  it('reads and verifies the published baseline with SDK query objects', async () => {
    const harness = createHarness();
    const bridge = stageBridge(harness);
    const bytes = candidateBytes();
    const checksum = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const seeded = seedBaseline(harness, checksum);
    const baseline = await bridge.ports.readBaseline();
    expect(baseline.baselineVersionId).toBe('base-1');
    expect(baseline.baselineFingerprint).toBe(checksum);
    expect(
      (baseline.catalogue as MedicationCatalogueSnapshot).products.length,
    ).toBe(seeded.catalogue.products.length);
    const listCalls = harness.rest.calls.filter(
      (call: { method: string; path: string; search: string }) =>
        call.method === 'GET' && call.path.endsWith('/rows'),
    );
    expect(listCalls.length).toBeGreaterThan(0);
    const wire = decodeURIComponent(listCalls[0]?.search ?? '');
    expect(wire).toContain('"attribute":"dataset"');
    expect(wire).toContain('"method":"equal"');
    expect(wire).toContain('"method":"orderDesc"');
    expect(wire).toContain('"method":"orderAsc"');
    expect(wire).toContain('"method":"limit"');
    harness.dispose();
  });

  it('fails closed when the published bundle checksum does not verify', async () => {
    const harness = createHarness();
    const bridge = stageBridge(harness);
    seedBaseline(harness, `sha256:${'9'.repeat(64)}`);
    await expect(bridge.ports.readBaseline()).rejects.toThrow(/verif/i);
    harness.dispose();
  });

  it('reports an empty baseline when nothing is published', async () => {
    const harness = createHarness();
    const bridge = stageBridge(harness);
    const baseline = await bridge.ports.readBaseline();
    expect(baseline.baselineVersionId).toBeNull();
    expect(baseline.baselineFingerprint).toBeNull();
    harness.dispose();
  });
});
