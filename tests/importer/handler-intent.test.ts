/**
 * Private operation intent contracts: deterministic reserved-name file
 * identity, strict purpose-bound schemas, and the rule that candidate, review
 * or raw material can never stand in for an owner approval intent.
 */
import {
  bundleFileId,
  candidateFileId,
  candidateFileName,
  intentFileId,
  intentFileName,
  isReservedIntentFileName,
  parseIntentDocument,
  parseReviewDocument,
  quarantineFileId,
  reviewFileId,
  reviewFileName,
  reviewMatchesIntent,
  runRowId,
} from '../../infra/appwrite/functions/import-anmdmr/src/intent.js';
import {
  createHarness,
  derivations,
  describe,
  envelope,
  expect,
  it,
  publishIntentDocument,
  sha256Hex,
  STAGE_OPERATION,
  stageIntentDocument,
} from './handler-fixtures';

const sha256 = { hash: sha256Hex };
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9.\-_]*$/;

function reviewDocument(): Record<string, unknown> {
  return {
    purpose: 'intermed-stage-review/v1',
    stageOperationId: STAGE_OPERATION,
    dataset: 'synthetic-medication-catalogue',
    candidateVersionId: 'abc123def456',
    baselineVersionId: null,
    baselineFingerprint: null,
    configSha256: 'a'.repeat(64),
    rawSnapshotSha256: 'b'.repeat(64),
    candidateSha256: 'c'.repeat(64),
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
      changed: 0,
      renamed: 0,
      removed: 0,
      netProducts: 3,
    },
    largeRemovalRequired: false,
    issues: [],
  };
}

describe('private operation intent identity', () => {
  it('derives reserved file ids and names exactly as published', () => {
    expect(intentFileId(sha256, STAGE_OPERATION)).toBe(
      derivations.intentFileId(STAGE_OPERATION),
    );
    expect(intentFileName(STAGE_OPERATION)).toBe(
      derivations.intentFileName(STAGE_OPERATION),
    );
    expect(candidateFileId(sha256, 'abc123def456')).toBe(
      derivations.candidateFileId('abc123def456'),
    );
    expect(candidateFileName('abc123def456')).toBe(
      derivations.candidateFileName('abc123def456'),
    );
    expect(
      reviewFileId(sha256, {
        stageOperationId: STAGE_OPERATION,
        candidateVersionId: 'abc123def456',
        baselineVersionId: null,
        baselineFingerprint: null,
      }),
    ).toBe(
      derivations.reviewFileId({
        stageOperationId: STAGE_OPERATION,
        candidateVersionId: 'abc123def456',
        baselineVersionId: null,
        baselineFingerprint: null,
      }),
    );
    expect(quarantineFileId(sha256, 'run-a', 'malformed-snapshot')).toBe(
      derivations.quarantineFileId('run-a', 'malformed-snapshot'),
    );
    expect(runRowId(sha256, 'run-a')).toBe(derivations.runRowId('run-a'));
    expect(bundleFileId(sha256, 'abc123def456')).toBe(
      derivations.bundleFileId('abc123def456'),
    );
  });

  it('keeps every derived identifier safe for Appwrite rows and files', () => {
    const ids = [
      intentFileId(sha256, STAGE_OPERATION),
      candidateFileId(sha256, 'abc123def456'),
      reviewFileId(sha256, {
        stageOperationId: STAGE_OPERATION,
        candidateVersionId: 'abc123def456',
        baselineVersionId: 'base-1',
        baselineFingerprint: `sha256:${'d'.repeat(64)}`,
      }),
      quarantineFileId(sha256, 'run-a', 'partial-snapshot'),
      runRowId(sha256, 'run-a'),
      bundleFileId(sha256, 'abc123def456'),
    ];
    for (const id of ids) {
      expect(id.length).toBeLessThanOrEqual(36);
      expect(id).toMatch(SAFE_ID);
    }
  });

  it('keeps candidate, review and intent identities disjoint', () => {
    const intentId = intentFileId(sha256, STAGE_OPERATION);
    const candidateId = candidateFileId(sha256, 'abc123def456');
    const reviewId = reviewFileId(sha256, {
      stageOperationId: STAGE_OPERATION,
      candidateVersionId: 'abc123def456',
      baselineVersionId: null,
      baselineFingerprint: null,
    });
    expect(new Set([intentId, candidateId, reviewId]).size).toBe(3);
  });

  it('binds the review identity to the baseline binding', () => {
    const first = reviewFileId(sha256, {
      stageOperationId: STAGE_OPERATION,
      candidateVersionId: 'abc123def456',
      baselineVersionId: 'base-1',
      baselineFingerprint: `sha256:${'d'.repeat(64)}`,
    });
    const sameRetry = reviewFileId(sha256, {
      stageOperationId: STAGE_OPERATION,
      candidateVersionId: 'abc123def456',
      baselineVersionId: 'base-1',
      baselineFingerprint: `sha256:${'d'.repeat(64)}`,
    });
    const otherBaseline = reviewFileId(sha256, {
      stageOperationId: STAGE_OPERATION,
      candidateVersionId: 'abc123def456',
      baselineVersionId: 'base-2',
      baselineFingerprint: `sha256:${'e'.repeat(64)}`,
    });
    expect(sameRetry).toBe(first);
    expect(otherBaseline).not.toBe(first);
    expect(reviewFileName('abc123def456')).toBe(
      derivations.reviewFileName('abc123def456'),
    );
  });

  it('accepts only the fixed reserved intent file name', () => {
    expect(
      isReservedIntentFileName(
        intentFileName(STAGE_OPERATION),
        STAGE_OPERATION,
      ),
    ).toBe(true);
    expect(
      isReservedIntentFileName('op-intent-v1.op-other.json', STAGE_OPERATION),
    ).toBe(false);
    expect(
      isReservedIntentFileName('candidate-v1.abc.json', STAGE_OPERATION),
    ).toBe(false);
    expect(
      isReservedIntentFileName(reviewFileName('abc'), STAGE_OPERATION),
    ).toBe(false);
  });
});

describe('private intent schemas', () => {
  it('accepts a well-formed stage intent', () => {
    const parsed = parseIntentDocument(JSON.stringify(stageIntentDocument()));
    expect(parsed.ok).toBe(true);
    if (parsed.ok)
      expect(parsed.intent.purpose).toBe('intermed-synthetic-stage/v1');
  });

  it('accepts a well-formed publish intent', () => {
    const parsed = parseIntentDocument(
      JSON.stringify(
        publishIntentDocument('op-publish-0001', {
          candidateVersionId: 'abc123def456',
          candidateSha256: 'c'.repeat(64),
          rawSnapshotSha256: 'b'.repeat(64),
        }),
      ),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.intent.purpose).toBe('intermed-synthetic-publish/v1');
    }
  });

  const stageTampering: readonly {
    name: string;
    mutate: (doc: Record<string, unknown>) => void;
  }[] = [
    { name: 'an extra key', mutate: (doc) => void (doc.extra = 'x') },
    { name: 'a missing purpose', mutate: (doc) => void delete doc.purpose },
    {
      name: 'a wrong purpose',
      mutate: (doc) => void (doc.purpose = 'intermed-synthetic-publish/v1'),
    },
    {
      name: 'a foreign operation id',
      mutate: (doc) => void (doc.operationId = 'op-other'),
    },
    {
      name: 'a non-synthetic declaration',
      mutate: (doc) => void (doc.syntheticOnly = false),
    },
    {
      name: 'a bad raw checksum',
      mutate: (doc) => void (doc.rawSnapshotSha256 = 'not-a-hash'),
    },
    {
      name: 'an encoding outside the config policy',
      mutate: (doc) => void (doc.encoding = 'utf-16'),
    },
    {
      name: 'an unsupported parser encoding',
      mutate: (doc) =>
        void (doc.config = {
          ...(doc.config as Record<string, unknown>),
          parserEncoding: 'utf-16',
        }),
    },
    {
      name: 'a missing parser encoding',
      mutate: (doc) =>
        void (doc.config = {
          ...(doc.config as Record<string, unknown>),
          parserEncoding: undefined,
        }),
    },
    {
      name: 'an unbounded dataset',
      mutate: (doc) => void (doc.dataset = ''),
    },
    {
      name: 'a bad issue timestamp',
      mutate: (doc) => void (doc.issuedAt = 'yesterday'),
    },
    {
      name: 'a smuggled approval flag',
      mutate: (doc) => void (doc.operationalApproval = true),
    },
    {
      name: 'an importer version over the Appwrite column limit',
      mutate: (doc) =>
        void (doc.config = {
          ...(doc.config as Record<string, unknown>),
          importerVersion: 'i'.repeat(51),
        }),
    },
    {
      name: 'a schema version over the Appwrite column limit',
      mutate: (doc) =>
        void (doc.config = {
          ...(doc.config as Record<string, unknown>),
          schemaVersion: 's'.repeat(51),
        }),
    },
    {
      name: 'a source version over the Appwrite column limit',
      mutate: (doc) =>
        void (doc.config = {
          ...(doc.config as Record<string, unknown>),
          sourceVersion: 'v'.repeat(201),
        }),
    },
    {
      name: 'an unlisted source key',
      mutate: (doc) =>
        void (doc.config = {
          ...(doc.config as Record<string, unknown>),
          sourceKey: 'source.not-listed',
        }),
    },
    {
      name: 'an empty synthetic allowlist',
      mutate: (doc) =>
        void (doc.config = {
          ...(doc.config as Record<string, unknown>),
          syntheticAllowlist: [],
        }),
    },
    {
      name: 'an extra config key',
      mutate: (doc) =>
        void (doc.config = {
          ...(doc.config as Record<string, unknown>),
          publicBaseUrl: 'https://example.invalid',
        }),
    },
  ];

  it.each(stageTampering)('rejects a stage intent carrying $name', (tamper) => {
    const doc = stageIntentDocument() as Record<string, unknown>;
    tamper.mutate(doc);
    expect(parseIntentDocument(JSON.stringify(doc)).ok).toBe(false);
  });

  const publishTampering: readonly {
    name: string;
    mutate: (doc: Record<string, unknown>) => void;
  }[] = [
    {
      name: 'no operational approval',
      mutate: (doc) => void (doc.operationalApproval = false),
    },
    {
      name: 'a missing operational approval',
      mutate: (doc) => void delete doc.operationalApproval,
    },
    {
      name: 'a blank human actor',
      mutate: (doc) => void (doc.approvedBy = ' '),
    },
    {
      name: 'a missing approval reference',
      mutate: (doc) => void delete doc.approvalReference,
    },
    {
      name: 'a missing approval timestamp',
      mutate: (doc) => void delete doc.approvedAt,
    },
    {
      name: 'an approval reference over the Appwrite column limit',
      mutate: (doc) => void (doc.approvalReference = 'r'.repeat(501)),
    },
    {
      name: 'a version over the Appwrite column limit',
      mutate: (doc) => void (doc.version = 'v'.repeat(101)),
    },
    {
      name: 'a missing large-removal approval',
      mutate: (doc) => void delete doc.largeRemovalApproval,
    },
    {
      name: 'a bad candidate checksum',
      mutate: (doc) => void (doc.candidateSha256 = 'zz'),
    },
    {
      name: 'a malformed baseline fingerprint',
      mutate: (doc) => void (doc.baselineFingerprint = 'md5:123'),
    },
    {
      name: 'a missing stage operation binding',
      mutate: (doc) => void delete doc.stageOperationId,
    },
    {
      name: 'inline raw bytes',
      mutate: (doc) => void (doc.rawBytes = 'e30='),
    },
    {
      name: 'a human approval smuggled into the stage intent shape',
      mutate: (doc) => void (doc.purpose = 'intermed-synthetic-stage/v1'),
    },
  ];

  it.each(publishTampering)(
    'rejects a publish intent carrying $name',
    (tamper) => {
      const doc = publishIntentDocument('op-publish-0001', {
        candidateVersionId: 'abc123def456',
        candidateSha256: 'c'.repeat(64),
        rawSnapshotSha256: 'b'.repeat(64),
      }) as Record<string, unknown>;
      tamper.mutate(doc);
      expect(parseIntentDocument(JSON.stringify(doc)).ok).toBe(false);
    },
  );

  it('never mistakes a stage review for an approval intent', () => {
    expect(parseIntentDocument(JSON.stringify(reviewDocument())).ok).toBe(
      false,
    );
    const review = parseReviewDocument(JSON.stringify(reviewDocument()));
    expect(review.ok).toBe(true);
  });

  it('never mistakes candidate bytes or raw material for an approval intent', () => {
    expect(parseIntentDocument('{"products":[]}').ok).toBe(false);
    expect(parseIntentDocument('not json').ok).toBe(false);
    expect(parseReviewDocument(JSON.stringify(stageIntentDocument())).ok).toBe(
      false,
    );
    expect(
      parseIntentDocument(
        JSON.stringify({ purpose: 'intermed-stage-review/v1' }),
      ).ok,
    ).toBe(false);
  });

  it('binds a review to the publish intent bindings it must match', () => {
    const review = reviewDocument();
    const intent = publishIntentDocument('op-publish-0001', {
      candidateVersionId: 'abc123def456',
      candidateSha256: 'c'.repeat(64),
      rawSnapshotSha256: 'b'.repeat(64),
    }) as Record<string, unknown>;
    expect(reviewMatchesIntent(intent, review, 'a'.repeat(64))).toBe(true);
    expect(reviewMatchesIntent(intent, review, 'f'.repeat(64))).toBe(false);
    expect(
      reviewMatchesIntent(
        { ...intent, rawSnapshotSha256: 'e'.repeat(64) },
        review,
        'a'.repeat(64),
      ),
    ).toBe(false);
    expect(
      reviewMatchesIntent(
        { ...intent, candidateVersionId: 'other-candidate' },
        review,
        'a'.repeat(64),
      ),
    ).toBe(false);
  });

  it('accepts the optional bounded quarantine reason a real large-removal stage emits', () => {
    const parsed = parseReviewDocument(
      JSON.stringify({
        ...reviewDocument(),
        quarantineReason: 'large-removal',
      }),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.review.quarantineReason).toBe('large-removal');
    }
  });

  it.each([
    ['an empty reason', ''],
    ['a blank reason', ' '],
    ['an oversized reason', 'r'.repeat(51)],
    ['a reason with spaces', 'large removal'],
    ['an uppercase reason', 'Large-Removal'],
    ['a non-string reason', 7],
  ])('rejects a review carrying %s', (_name, value) => {
    expect(
      parseReviewDocument(
        JSON.stringify({ ...reviewDocument(), quarantineReason: value }),
      ).ok,
    ).toBe(false);
  });

  it('still rejects a review carrying an unknown extra field', () => {
    expect(
      parseReviewDocument(
        JSON.stringify({ ...reviewDocument(), surprise: 'large-removal' }),
      ).ok,
    ).toBe(false);
  });
});

describe('handler intent loading', () => {
  it('rejects an intent file outside the reserved name prefix with no writes', async () => {
    const harness = createHarness();
    const operationId = 'op-stage-0001';
    harness.seedFile(
      'import-run-logs',
      intentFileId(sha256, operationId),
      'loose-file.json',
      JSON.stringify(stageIntentDocument(operationId)),
    );
    const result = await harness.call({ bodyJson: envelope(operationId) });
    expect(result.status).toBe(403);
    expect(result.body.code).toBe('operation-rejected');
    expect(harness.rest.rowIds('import-runs')).toEqual([]);
    expect(harness.rest.fileIds('published-datasets')).toEqual([]);
    harness.dispose();
  });

  it('rejects a review document stored at the approval intent id', async () => {
    const harness = createHarness();
    const operationId = 'op-stage-0001';
    harness.seedFile(
      'import-run-logs',
      intentFileId(sha256, operationId),
      intentFileName(operationId),
      JSON.stringify(reviewDocument()),
    );
    const result = await harness.call({ bodyJson: envelope(operationId) });
    expect(result.status).toBe(403);
    expect(result.body.code).toBe('operation-rejected');
    expect(harness.rest.rowIds('import-runs')).toEqual([]);
    harness.dispose();
  });

  it('rejects candidate bytes stored at the approval intent id', async () => {
    const harness = createHarness();
    const operationId = 'op-stage-0001';
    harness.seedFile(
      'import-run-logs',
      intentFileId(sha256, operationId),
      intentFileName(operationId),
      '{"dataSources":[],"datasetVersions":[]}',
    );
    const result = await harness.call({ bodyJson: envelope(operationId) });
    expect(result.status).toBe(403);
    expect(result.body.code).toBe('operation-rejected');
    expect(harness.rest.rowIds('import-runs')).toEqual([]);
    harness.dispose();
  });

  it('rejects a publish intent used while publication is disabled', async () => {
    const harness = createHarness({ publishEnabled: false });
    const operationId = 'op-publish-0001';
    harness.seedFile(
      'import-run-logs',
      intentFileId(sha256, operationId),
      intentFileName(operationId),
      JSON.stringify(
        publishIntentDocument(operationId, {
          candidateVersionId: 'abc123def456',
          candidateSha256: 'c'.repeat(64),
          rawSnapshotSha256: 'b'.repeat(64),
        }),
      ),
    );
    const result = await harness.call({ bodyJson: envelope(operationId) });
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ code: 'publication-disabled' });
    expect(harness.rest.calls.length).toBe(0);
    harness.dispose();
  });
});
