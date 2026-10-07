/**
 * End-to-end handler flows over the stateful fake REST surface with the real
 * importer core, real domain serializer/validator and real crypto. Only the
 * HTTP boundary is faked. Blocked proofs are named after their dependency.
 */
import { canonicalizeConfig } from '@intermed/importer';
import {
  candidateBytes,
  createHarness,
  DATASET,
  derivations,
  describe,
  envelope,
  expect,
  it,
  PUBLISH_OPERATION,
  publishIntentDocument,
  RAW_FILE_ID,
  readSeedText,
  sha256Hex,
  snapshotBytes,
  STAGE_OPERATION,
  stageIntentDocument,
  TEST_CONFIG,
} from './handler-fixtures';
import { bytesToText, utf8Bytes } from './fake-appwrite-rest';

const { candidateFileId, intentFileId, intentFileName, reviewFileId } =
  derivations;

const CANDIDATE_ID = 'abc123def456';

interface World {
  rawBytes: Uint8Array;
  candidate: Uint8Array;
  configSha256: string;
  rawSha256: string;
  candidateSha256: string;
}

function world(): World {
  const rawBytes = snapshotBytes();
  const candidate = candidateBytes();
  return {
    rawBytes,
    candidate,
    configSha256: sha256Hex(
      canonicalizeConfig({
        ...TEST_CONFIG,
        syntheticAllowlist: [...TEST_CONFIG.syntheticAllowlist],
      }),
    ),
    rawSha256: sha256Hex(rawBytes),
    candidateSha256: sha256Hex(candidate),
  };
}

type Harness = ReturnType<typeof createHarness>;

function seedStageIntent(
  harness: Harness,
  state: World,
  overrides: Record<string, unknown> = {},
): void {
  harness.seedFile(
    'raw-sources',
    RAW_FILE_ID,
    'raw-snapshot.json',
    state.rawBytes,
  );
  const intent = stageIntentDocument(STAGE_OPERATION, {
    rawSnapshotSha256: state.rawSha256,
    ...overrides,
  });
  harness.seedFile(
    'import-run-logs',
    intentFileId(STAGE_OPERATION),
    intentFileName(STAGE_OPERATION),
    JSON.stringify(intent),
  );
}

function seedStageEvidence(harness: Harness, state: World): void {
  harness.seedFile(
    'import-run-logs',
    candidateFileId(CANDIDATE_ID),
    `candidate-v1.${CANDIDATE_ID}.json`,
    state.candidate,
  );
  harness.seedFile(
    'import-run-logs',
    reviewFileId({
      stageOperationId: STAGE_OPERATION,
      candidateVersionId: CANDIDATE_ID,
      baselineVersionId: null,
      baselineFingerprint: null,
    }),
    `stage-review-v1.${CANDIDATE_ID}.json`,
    JSON.stringify({
      purpose: 'intermed-stage-review/v1',
      stageOperationId: STAGE_OPERATION,
      dataset: DATASET,
      candidateVersionId: CANDIDATE_ID,
      baselineVersionId: null,
      baselineFingerprint: null,
      configSha256: state.configSha256,
      rawSnapshotSha256: state.rawSha256,
      candidateSha256: state.candidateSha256,
      diffSummary: {
        added: 3,
        changed: 0,
        renamed: 0,
        removed: 0,
        netProducts: 3,
      },
      largeRemovalRequired: false,
      issues: [],
    }),
  );
}

function seedPublishIntent(
  harness: Harness,
  state: World,
  overrides: Record<string, unknown> = {},
): void {
  const intent = publishIntentDocument(
    PUBLISH_OPERATION,
    {
      candidateVersionId: CANDIDATE_ID,
      candidateSha256: state.candidateSha256,
      rawSnapshotSha256: state.rawSha256,
    },
    overrides,
  );
  harness.seedFile(
    'import-run-logs',
    intentFileId(PUBLISH_OPERATION),
    intentFileName(PUBLISH_OPERATION),
    JSON.stringify(intent),
  );
}

function stateOf(harness: Harness): string {
  const rows = [...harness.rest.rows.entries()]
    .map(([table, entries]) => `${table}:[${[...entries.keys()].sort()}]`)
    .join(' ');
  const files = [...harness.rest.files.entries()]
    .map(
      ([bucket, entries]) =>
        `${bucket}:[${[...entries.keys()].sort()}]@${[...entries.values()]
          .map((file) => sha256Hex(file.bytes))
          .join(',')}]`,
    )
    .join(' ');
  return `${rows} ${files}`;
}

describe('stage flows', () => {
  it('stages a valid private intent and writes nothing public', async () => {
    const harness = createHarness();
    const state = world();
    seedStageIntent(harness, state);
    const result = await harness.call({ bodyJson: envelope(STAGE_OPERATION) });
    expect(result.status).toBe(200);
    expect(result.body.code).toBe('staged');
    expect(result.body.operationRef).toMatch(/^[0-9a-f]{12}$/);
    expect(harness.rest.fileIds('published-datasets')).toEqual([]);
    expect(harness.rest.rowIds('dataset-versions')).toEqual([]);
    expect(harness.rest.rowIds('dataset-bundles')).toEqual([]);
    expect(harness.rest.rowIds('import-runs').length).toBe(1);
    expect(
      harness.rest
        .fileIds('import-run-logs')
        .filter((id) => id.startsWith('cnd1')),
    ).toHaveLength(1);
    harness.dispose();
  });

  it('verifies the raw snapshot hash before any parse or write', async () => {
    const harness = createHarness();
    const state = world();
    seedStageIntent(harness, state, {
      rawSnapshotSha256: sha256Hex('different-bytes'),
    });
    const before = stateOf(harness);
    const result = await harness.call({ bodyJson: envelope(STAGE_OPERATION) });
    expect(result.status).toBe(403);
    expect(result.body.code).toBe('operation-rejected');
    expect(stateOf(harness)).toBe(before);
    harness.dispose();
  });

  it('quarantines malformed material privately and writes nothing public', async () => {
    const harness = createHarness();
    const rawBytes = utf8Bytes('{ this is not json');
    harness.seedFile('raw-sources', RAW_FILE_ID, 'raw-snapshot.json', rawBytes);
    harness.seedFile(
      'import-run-logs',
      intentFileId(STAGE_OPERATION),
      intentFileName(STAGE_OPERATION),
      JSON.stringify(
        stageIntentDocument(STAGE_OPERATION, {
          rawSnapshotSha256: sha256Hex(rawBytes),
        }),
      ),
    );
    const result = await harness.call({ bodyJson: envelope(STAGE_OPERATION) });
    expect(result.status).toBe(200);
    expect(result.body.code).toBe('quarantined');
    expect(result.body.summary).toMatchObject({
      status: 'quarantined',
      completenessStatus: 'malformed-snapshot',
    });
    expect(harness.rest.fileIds('published-datasets')).toEqual([]);
    expect(harness.rest.rowIds('dataset-versions')).toEqual([]);
    expect(harness.rest.rowIds('import-runs')).toHaveLength(1);
    const quarantined = harness.rest.fileNamed(
      'quarantine',
      'quarantine-v1.malformed-snapshot.raw',
    );
    expect(bytesToText(quarantined?.bytes ?? new Uint8Array())).toBe(
      '{ this is not json',
    );
    harness.dispose();
  });

  it('quarantines partial snapshots without touching public storage', async () => {
    const harness = createHarness();
    const document = {
      format: 'anmdmr-synthetic',
      schemaVersion: '1',
      synthetic: true,
      completeness: 'partial',
      sourceKey: 'source.synthetic',
      recordCounts: { products: 0 },
      products: [],
    };
    const rawBytes = utf8Bytes(JSON.stringify(document));
    harness.seedFile('raw-sources', RAW_FILE_ID, 'raw-snapshot.json', rawBytes);
    harness.seedFile(
      'import-run-logs',
      intentFileId(STAGE_OPERATION),
      intentFileName(STAGE_OPERATION),
      JSON.stringify(
        stageIntentDocument(STAGE_OPERATION, {
          rawSnapshotSha256: sha256Hex(rawBytes),
        }),
      ),
    );
    const result = await harness.call({ bodyJson: envelope(STAGE_OPERATION) });
    expect(result.status).toBe(200);
    expect(result.body.code).toBe('quarantined');
    expect(result.body.summary).toMatchObject({
      completenessStatus: 'partial-rejected',
    });
    expect(harness.rest.fileIds('published-datasets')).toEqual([]);
    harness.dispose();
  });

  it('stages retries idempotently without deleting or rewriting private intent', async () => {
    const harness = createHarness();
    const state = world();
    seedStageIntent(harness, state);
    const intentBefore = readSeedText(
      harness.rest,
      'import-run-logs',
      intentFileId(STAGE_OPERATION),
    );
    await harness.call({ bodyJson: envelope(STAGE_OPERATION) });
    const afterFirst = stateOf(harness);
    const second = await harness.call({ bodyJson: envelope(STAGE_OPERATION) });
    expect(second.status).toBe(200);
    expect(stateOf(harness)).toBe(afterFirst);
    expect(
      readSeedText(
        harness.rest,
        'import-run-logs',
        intentFileId(STAGE_OPERATION),
      ),
    ).toBe(intentBefore);
    harness.dispose();
  });
});

describe('publish flows', () => {
  const tampering: readonly {
    name: string;
    mutate: (state: World, harness: Harness) => void;
  }[] = [
    {
      name: 'a review that is missing entirely',
      mutate: (_state, harness) => {
        harness.rest.files.get('import-run-logs')?.delete(
          reviewFileId({
            stageOperationId: STAGE_OPERATION,
            candidateVersionId: CANDIDATE_ID,
            baselineVersionId: null,
            baselineFingerprint: null,
          }),
        );
      },
    },
    {
      name: 'a raw checksum that does not match the review',
      mutate: (_state, harness) => {
        seedBrokenReview(harness, { rawSnapshotSha256: sha256Hex('other') });
      },
    },
    {
      name: 'a candidate checksum that does not match the review',
      mutate: (_state, harness) => {
        seedBrokenReview(harness, { candidateSha256: sha256Hex('other') });
      },
    },
    {
      name: 'a config binding that does not match the review',
      mutate: (_state, harness) => {
        seedBrokenReview(harness, { configSha256: sha256Hex('other') });
      },
    },
    {
      name: 'a baseline binding that does not match the review',
      mutate: (_state, harness) => {
        seedBrokenReview(harness, {
          baselineVersionId: 'base-9',
          baselineFingerprint: `sha256:${'9'.repeat(64)}`,
        });
      },
    },
    {
      name: 'a large-removal requirement without explicit approval',
      mutate: (_state, harness) => {
        seedBrokenReview(harness, { largeRemovalRequired: true });
        seedPublishIntent(harness, worldState, {
          largeRemovalApproval: false,
        });
      },
    },
    {
      name: 'a missing operational approval',
      mutate: (_state, harness) => {
        seedPublishIntent(harness, worldState, {
          operationalApproval: false,
        });
      },
    },
    {
      name: 'a different stage operation binding',
      mutate: (_state, harness) => {
        seedBrokenReview(harness, { stageOperationId: 'op-stage-other' });
      },
    },
  ];

  const worldState = world();

  function seedBrokenReview(
    harness: Harness,
    overrides: Record<string, unknown>,
  ): void {
    harness.seedFile(
      'import-run-logs',
      reviewFileId({
        stageOperationId: STAGE_OPERATION,
        candidateVersionId: CANDIDATE_ID,
        baselineVersionId: null,
        baselineFingerprint: null,
      }),
      `stage-review-v1.${CANDIDATE_ID}.json`,
      JSON.stringify({
        purpose: 'intermed-stage-review/v1',
        stageOperationId: STAGE_OPERATION,
        dataset: DATASET,
        candidateVersionId: CANDIDATE_ID,
        baselineVersionId: null,
        baselineFingerprint: null,
        configSha256: worldState.configSha256,
        rawSnapshotSha256: worldState.rawSha256,
        candidateSha256: worldState.candidateSha256,
        diffSummary: {
          added: 3,
          changed: 0,
          renamed: 0,
          removed: 0,
          netProducts: 3,
        },
        largeRemovalRequired: false,
        issues: [],
        ...overrides,
      }),
    );
  }

  it.each(tampering)(
    'writes nothing at all for a publish attempt with $name',
    async (tamper) => {
      const harness = createHarness({ publishEnabled: true });
      const state = world();
      seedStageEvidence(harness, state);
      seedPublishIntent(harness, state);
      tamper.mutate(state, harness);
      const before = stateOf(harness);
      const result = await harness.call({
        bodyJson: envelope(PUBLISH_OPERATION),
      });
      expect(result.status).toBe(403);
      expect(result.body.code).toBe('operation-rejected');
      expect(stateOf(harness)).toBe(before);
      harness.dispose();
    },
  );

  it('publishes an approved candidate with file, descriptor and manifest last', async () => {
    const harness = createHarness({ publishEnabled: true });
    const state = world();
    seedStageEvidence(harness, state);
    seedPublishIntent(harness, state);
    const result = await harness.call({
      bodyJson: envelope(PUBLISH_OPERATION),
    });
    expect(result.status).toBe(200);
    expect(result.body.code).toBe('published');
    const writes = harness.rest.calls
      .filter((call) => call.method === 'POST')
      .map((call) => call.path);
    expect(writes.slice(-3)).toEqual([
      '/v1/storage/buckets/published-datasets/files',
      '/v1/tablesdb/intermed-datasets/tables/dataset-bundles/rows',
      '/v1/tablesdb/intermed-datasets/tables/dataset-versions/rows',
    ]);
    harness.dispose();
  });

  it('reports the committed outcome when lock release fails after the manifest', async () => {
    const harness = createHarness({ publishEnabled: true });
    const state = world();
    seedStageEvidence(harness, state);
    seedPublishIntent(harness, state);
    harness.rest.failWhen((call) => call.method === 'DELETE', {
      status: 500,
      message: 'release failed',
    });
    const result = await harness.call({
      bodyJson: envelope(PUBLISH_OPERATION),
    });
    expect(result.status).toBe(200);
    expect(result.body.code).toBe('published');
    expect(result.body.summary).toMatchObject({ lockReleased: false });
    harness.dispose();
  });

  it('rejects a concurrent second publication while the lock is held', async () => {
    const harness = createHarness({ publishEnabled: true });
    const state = world();
    seedStageEvidence(harness, state);
    seedPublishIntent(harness, state);
    harness.seedRow('import-runs', 'lock', {
      sourceId: 'lock',
      snapshotVersion: 'lock',
      importerVersion: 'lock',
      startedAt: '2026-10-07T10:00:00Z',
      completenessStatus: 'lock',
      publicationStatus: 'lock',
      approvalReference: 'a'.repeat(48),
    });
    const second = await harness.call({
      bodyJson: envelope(PUBLISH_OPERATION),
    });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('publication-busy');
    expect(harness.rest.rows.get('import-runs')?.get('lock')).toBeDefined();
    harness.dispose();
  });

  it('keeps the private intent read-only across publish retries', async () => {
    const harness = createHarness({ publishEnabled: true });
    const state = world();
    seedStageEvidence(harness, state);
    seedPublishIntent(harness, state);
    const intentBefore = readSeedText(
      harness.rest,
      'import-run-logs',
      intentFileId(PUBLISH_OPERATION),
    );
    await harness.call({ bodyJson: envelope(PUBLISH_OPERATION) });
    const afterFirst = stateOf(harness);
    const second = await harness.call({
      bodyJson: envelope(PUBLISH_OPERATION),
    });
    expect(second.status).toBe(200);
    expect(second.body.code).toBe('already-published');
    expect(stateOf(harness)).toBe(afterFirst);
    expect(
      readSeedText(
        harness.rest,
        'import-run-logs',
        intentFileId(PUBLISH_OPERATION),
      ),
    ).toBe(intentBefore);
    harness.dispose();
  });
});
