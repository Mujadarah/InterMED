/**
 * End-to-end handler flows over the stateful fake of the real Appwrite REST
 * surface with the real importer core, real domain serializer/deserializer and
 * real crypto. Only the HTTP boundary is faked. The publication retry proof
 * advances the wall clock between calls: the publication timestamp is pinned
 * to the immutable owner approval timestamp, so the manifest is identical and
 * nothing is written twice.
 */
import {
  createHarness,
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
  vi,
} from './handler-fixtures';
import { bytesToText } from './fake-appwrite-rest.mjs';

const { intentFileId, intentFileName, reviewFileId } = derivations;

type Harness = ReturnType<typeof createHarness>;

interface ReviewDoc {
  purpose: string;
  stageOperationId: string;
  dataset: string;
  candidateVersionId: string;
  baselineVersionId: string | null;
  baselineFingerprint: string | null;
  configSha256: string;
  rawSnapshotSha256: string;
  candidateSha256: string;
  completeness: string;
  largeRemovalRequired: boolean;
}

function seedRaw(harness: Harness, bytes = snapshotBytes()): string {
  harness.seedFile('raw-sources', RAW_FILE_ID, 'raw-snapshot.json', bytes);
  harness.seedFile(
    'import-run-logs',
    intentFileId(STAGE_OPERATION),
    intentFileName(STAGE_OPERATION),
    JSON.stringify(
      stageIntentDocument(STAGE_OPERATION, {
        rawSnapshotSha256: sha256Hex(bytes),
      }),
    ),
  );
  return sha256Hex(bytes);
}

function stateOf(harness: Harness): string {
  const rows = [...harness.rest.rows.entries()]
    .map(([table, entries]) => [
      table,
      [...entries.entries()].sort(([a], [b]) => a.localeCompare(b)),
    ])
    .sort(([a], [b]) => String(a).localeCompare(String(b)));
  const files = [...harness.rest.files.entries()]
    .map(([bucket, entries]) => [
      bucket,
      [...entries.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, file]) => [id, file.name, sha256Hex(file.bytes)]),
    ])
    .sort(([a], [b]) => String(a).localeCompare(String(b)));
  return JSON.stringify({ rows, files });
}

function readReviewOf(harness: Harness, reviewBinding: ReviewDoc): ReviewDoc {
  const fileId = reviewFileId({
    stageOperationId: reviewBinding.stageOperationId,
    candidateVersionId: reviewBinding.candidateVersionId,
    baselineVersionId: reviewBinding.baselineVersionId,
    baselineFingerprint: reviewBinding.baselineFingerprint,
  });
  const stored = harness.rest.files.get('import-run-logs')?.get(fileId);
  return JSON.parse(
    bytesToText(stored?.bytes ?? new Uint8Array()),
  ) as unknown as ReviewDoc;
}

function writtenReview(harness: Harness): ReviewDoc {
  for (const stored of harness.rest.files.get('import-run-logs')?.values() ??
    []) {
    if (stored.name.startsWith('stage-review-v1.')) {
      return JSON.parse(bytesToText(stored.bytes)) as unknown as ReviewDoc;
    }
  }
  throw new Error('no staged review found');
}

function seedPublishIntent(
  harness: Harness,
  review: ReviewDoc,
  overrides: Record<string, unknown> = {},
): void {
  const intent = publishIntentDocument(
    PUBLISH_OPERATION,
    {
      candidateVersionId: review.candidateVersionId,
      candidateSha256: review.candidateSha256,
      rawSnapshotSha256: review.rawSnapshotSha256,
      baselineVersionId: review.baselineVersionId,
      baselineFingerprint: review.baselineFingerprint,
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

async function stageOnce(harness: Harness, bytes = snapshotBytes()) {
  seedRaw(harness, bytes);
  return harness.call({ bodyJson: envelope(STAGE_OPERATION) });
}

describe('stage flows', () => {
  it('stages a full valid generation with private writes only', async () => {
    const harness = createHarness();
    const result = await stageOnce(harness);
    expect(result.status).toBe(200);
    expect(result.body.code, JSON.stringify(result.body)).toBe('staged');
    expect(result.body.operationRef).toMatch(/^[0-9a-f]{12}$/);
    const summary = result.body.summary as Record<string, unknown>;
    expect(summary.status).toBe('staged');
    expect(summary.completenessStatus).toBe('complete');
    expect(summary.approvalRequired).toBe(true);
    expect(harness.rest.fileIds('published-datasets')).toEqual([]);
    expect(harness.rest.rowIds('dataset-versions')).toEqual([]);
    expect(harness.rest.rowIds('dataset-bundles')).toEqual([]);
    expect(harness.rest.rowIds('import-runs').length).toBe(1);
    expect(
      harness.rest
        .fileIds('import-run-logs')
        .filter((id) => id.startsWith('cnd1')),
    ).toHaveLength(1);
    const review = writtenReview(harness);
    expect(review.completeness).toBe('complete');
    expect(review.candidateVersionId).toContain('\u001f');
    harness.dispose();
  });

  it('verifies the raw snapshot hash before any parse or write', async () => {
    const harness = createHarness();
    seedRaw(harness);
    harness.seedFile(
      'import-run-logs',
      intentFileId(STAGE_OPERATION),
      intentFileName(STAGE_OPERATION),
      JSON.stringify(
        stageIntentDocument(STAGE_OPERATION, {
          rawSnapshotSha256: sha256Hex('different-bytes'),
        }),
      ),
    );
    const before = stateOf(harness);
    const result = await harness.call({ bodyJson: envelope(STAGE_OPERATION) });
    expect(result.status).toBe(403);
    expect(result.body.code).toBe('operation-rejected');
    expect(stateOf(harness)).toBe(before);
    harness.dispose();
  });

  it('quarantines malformed material privately and writes nothing public', async () => {
    const harness = createHarness();
    const rawBytes = new TextEncoder().encode('{ this is not json');
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
      completenessStatus: 'malformed-json',
    });
    expect(harness.rest.fileIds('published-datasets')).toEqual([]);
    expect(harness.rest.rowIds('import-runs')).toHaveLength(1);
    const quarantined = harness.rest.fileNamed(
      'quarantine',
      'quarantine-v1.malformed-json.raw',
    );
    expect(bytesToText(quarantined?.bytes ?? new Uint8Array())).toBe(
      '{ this is not json',
    );
    harness.dispose();
  });

  it('quarantines partial snapshots without touching public storage', async () => {
    const harness = createHarness();
    const rawBytes = new TextEncoder().encode(
      JSON.stringify({
        format: 'anmdmr-synthetic',
        schemaVersion: '1',
        synthetic: true,
        completeness: 'partial',
        sourceKey: 'source.synthetic',
        recordCounts: { products: 0 },
        products: [],
      }),
    );
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
    expect(harness.rest.fileIds('published-datasets')).toEqual([]);
    harness.dispose();
  });

  it('stages the next generation against the published baseline', async () => {
    const harness = createHarness({ publishEnabled: true });
    const first = await stageOnce(harness);
    expect(first.status).toBe(200);
    const review = writtenReview(harness);
    seedPublishIntent(harness, review);
    const publishResult = await harness.call({
      bodyJson: envelope(PUBLISH_OPERATION),
    });
    expect(publishResult.status).toBe(200);

    const mutated = JSON.parse(bytesToText(snapshotBytes())) as Record<
      string,
      unknown
    >;
    const products = mutated.products as Record<string, unknown>[];
    (products[0] as Record<string, unknown>).commercialName =
      'Placebex Renamed';
    const secondBytes = new TextEncoder().encode(JSON.stringify(mutated));
    harness.seedFile(
      'raw-sources',
      RAW_FILE_ID,
      'raw-snapshot.json',
      secondBytes,
    );
    harness.seedFile(
      'import-run-logs',
      intentFileId('op-stage-0002'),
      intentFileName('op-stage-0002'),
      JSON.stringify(
        stageIntentDocument('op-stage-0002', {
          rawSnapshotSha256: sha256Hex(secondBytes),
        }),
      ),
    );
    const second = await harness.call({ bodyJson: envelope('op-stage-0002') });
    expect(second.status).toBe(200);
    expect(second.body.code).toBe('staged');
    const summary = second.body.summary as {
      diff: { renamed: number; added: number; removed: number };
    };
    expect(summary.diff.renamed).toBe(1);
    expect(summary.diff.added).toBe(0);
    expect(summary.diff.removed).toBe(0);
    harness.dispose();
  });
});

describe('publish flows', () => {
  const tampering: readonly {
    name: string;
    mutate: (harness: Harness, review: ReviewDoc) => void;
  }[] = [
    {
      name: 'a review that is missing entirely',
      mutate: (harness, review) => {
        harness.rest.files.get('import-run-logs')?.delete(
          reviewFileId({
            stageOperationId: review.stageOperationId,
            candidateVersionId: review.candidateVersionId,
            baselineVersionId: review.baselineVersionId,
            baselineFingerprint: review.baselineFingerprint,
          }),
        );
      },
    },
    {
      name: 'a raw checksum that does not match the review',
      mutate: (harness, review) =>
        rewriteReview(harness, review, {
          rawSnapshotSha256: sha256Hex('other'),
        }),
    },
    {
      name: 'a candidate checksum that does not match the review',
      mutate: (harness, review) =>
        rewriteReview(harness, review, {
          candidateSha256: sha256Hex('other'),
        }),
    },
    {
      name: 'a config binding that does not match the review',
      mutate: (harness, review) =>
        rewriteReview(harness, review, {
          configSha256: sha256Hex('other'),
        }),
    },
    {
      name: 'a baseline binding that does not match the review',
      mutate: (harness, review) =>
        rewriteReview(harness, review, {
          baselineVersionId: 'gen1000000000000000000000000000000',
          baselineFingerprint: `sha256:${'9'.repeat(64)}`,
        }),
    },
    {
      name: 'a large-removal requirement without explicit approval',
      mutate: (harness, review) => {
        rewriteReview(harness, review, { largeRemovalRequired: true });
        seedPublishIntent(harness, readReviewOf(harness, review), {
          largeRemovalApproval: false,
        });
      },
    },
    {
      name: 'a missing operational approval',
      mutate: (harness, review) => {
        seedPublishIntent(harness, review, { operationalApproval: false });
      },
    },
    {
      name: 'a different stage operation binding',
      mutate: (harness, review) =>
        rewriteReview(harness, review, { stageOperationId: 'op-stage-9999' }),
    },
  ];

  function rewriteReview(
    harness: Harness,
    review: ReviewDoc,
    overrides: Record<string, unknown>,
  ): void {
    const fileId = reviewFileId({
      stageOperationId: review.stageOperationId,
      candidateVersionId: review.candidateVersionId,
      baselineVersionId: review.baselineVersionId,
      baselineFingerprint: review.baselineFingerprint,
    });
    const stored = harness.rest.files.get('import-run-logs')?.get(fileId);
    const document = JSON.parse(
      bytesToText(stored?.bytes ?? new Uint8Array()),
    ) as Record<string, unknown>;
    if (stored) {
      stored.bytes = new TextEncoder().encode(
        JSON.stringify({ ...document, ...overrides }),
      );
    }
  }

  it.each(tampering)(
    'writes nothing at all for a publish attempt with $name',
    async (tamper) => {
      const harness = createHarness({ publishEnabled: true });
      await stageOnce(harness);
      const review = writtenReview(harness);
      seedPublishIntent(harness, review);
      tamper.mutate(harness, review);
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
    await stageOnce(harness);
    seedPublishIntent(harness, writtenReview(harness));
    const result = await harness.call({
      bodyJson: envelope(PUBLISH_OPERATION),
    });
    expect(result.status).toBe(200);
    expect(result.body.code).toBe('published');
    const writes = harness.rest.calls
      .filter(
        (call: { method: string; path: string; search: string }) =>
          call.method === 'POST',
      )
      .map(
        (call: { method: string; path: string; search: string }) => call.path,
      );
    expect(writes.slice(-3)).toEqual([
      '/v1/storage/buckets/published-datasets/files',
      '/v1/tablesdb/intermed-datasets/tables/dataset-bundles/rows',
      '/v1/tablesdb/intermed-datasets/tables/dataset-versions/rows',
    ]);
    expect(harness.rest.fileIds('published-datasets')).toHaveLength(1);
    expect(harness.rest.rowIds('dataset-versions').length).toBe(1);
    harness.dispose();
  });

  it('presents the identical publication on retry when the wall clock advances', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-08T00:00:00.000Z'));
      const harness = createHarness({ publishEnabled: true });
      await stageOnce(harness);
      seedPublishIntent(harness, writtenReview(harness));
      const first = await harness.call({
        bodyJson: envelope(PUBLISH_OPERATION),
      });
      expect(first.status).toBe(200);
      expect(first.body.code).toBe('published');
      const afterFirst = stateOf(harness);
      const manifestBefore = harness.rest.rows
        .get('dataset-versions')
        ?.get(harness.rest.rowIds('dataset-versions')[0] ?? '');

      // The wall clock advances far beyond the approval timestamp.
      vi.setSystemTime(new Date('2027-03-14T09:30:00.000Z'));
      const second = await harness.call({
        bodyJson: envelope(PUBLISH_OPERATION),
      });
      expect(second.status).toBe(200);
      expect(second.body.code).toBe('already-published');
      expect(stateOf(harness)).toBe(afterFirst);
      const manifestAfter = harness.rest.rows
        .get('dataset-versions')
        ?.get(harness.rest.rowIds('dataset-versions')[0] ?? '');
      expect(manifestAfter).toEqual(manifestBefore);
      expect(manifestAfter?.publishedAt).toBe('2026-10-07T10:00:00Z');
      const publicWrites = harness.rest.calls.filter(
        (call: { method: string; path: string; search: string }) =>
          call.method === 'POST' &&
          (call.path.endsWith('/published-datasets/files') ||
            call.path.endsWith('/dataset-bundles/rows') ||
            call.path.endsWith('/dataset-versions/rows')),
      );
      expect(publicWrites.length).toBe(3);
      harness.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('read-verifies a lost write response and still commits', async () => {
    const harness = createHarness({ publishEnabled: true });
    await stageOnce(harness);
    seedPublishIntent(harness, writtenReview(harness));
    harness.rest.failWhen(
      (call: { method: string; path: string; search: string }) =>
        call.method === 'POST' && call.path.endsWith('/dataset-bundles/rows'),
      {
        error: new Error('connection lost'),
        applyBeforeThrow: true,
        times: 1,
      },
    );
    const result = await harness.call({
      bodyJson: envelope(PUBLISH_OPERATION),
    });
    expect(result.status).toBe(200);
    expect(result.body.code).toBe('published');
    const summary = result.body.summary as { warnings: string[] };
    expect(summary.warnings.length).toBeGreaterThan(0);
    expect(harness.rest.rowIds('dataset-versions').length).toBe(1);
    harness.dispose();
  });

  it('reports the committed outcome when lock release fails after the manifest', async () => {
    const harness = createHarness({ publishEnabled: true });
    await stageOnce(harness);
    seedPublishIntent(harness, writtenReview(harness));
    harness.rest.failWhen(
      (call: { method: string; path: string; search: string }) =>
        call.method === 'DELETE',
      {
        status: 500,
        message: 'release failed',
      },
    );
    const result = await harness.call({
      bodyJson: envelope(PUBLISH_OPERATION),
    });
    expect(result.status).toBe(200);
    expect(result.body.code).toBe('published');
    const summary = result.body.summary as { warnings: string[] };
    expect(summary.warnings).toContain('lock-release-failed');
    expect(harness.rest.rowIds('dataset-versions').length).toBe(1);
    harness.dispose();
  });

  it('rejects a concurrent second publication while the lock is held', async () => {
    const harness = createHarness({ publishEnabled: true });
    await stageOnce(harness);
    seedPublishIntent(harness, writtenReview(harness));
    harness.seedRow('import-runs', 'lock', {
      sourceId: 'lock',
      snapshotVersion: 'lock',
      importerVersion: 'lock',
      startedAt: '2026-10-07T10:00:00.000Z',
      completenessStatus: 'lock',
      publicationStatus: 'lock',
      approvalReference: 'a'.repeat(48),
    });
    const second = await harness.call({
      bodyJson: envelope(PUBLISH_OPERATION),
    });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('publication-busy');
    expect(harness.rest.rowIds('dataset-versions')).toEqual([]);
    harness.dispose();
  });

  it('keeps the private intent read-only across publish retries', async () => {
    const harness = createHarness({ publishEnabled: true });
    await stageOnce(harness);
    seedPublishIntent(harness, writtenReview(harness));
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
