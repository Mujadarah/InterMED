/**
 * Handler denial gaps: raw-missing unknown, intent binding mismatch and
 * stale-baseline publish refusal. Each asserts the bounded status/code, that
 * no store write happened, and that logs leak no body, operation id,
 * credential or dataset text.
 */
import {
  buildSnapshotDocument,
  createHarness,
  DATASET,
  describe,
  envelope,
  expect,
  it,
  PUBLISH_OPERATION,
  publishIntentDocument,
  RAW_FILE_ID,
  SAFE_LOG_PATTERN,
  SENTINEL,
  sha256Hex,
  snapshotBytes,
  STAGE_OPERATION,
  stageIntentDocument,
} from './handler-fixtures';
import { derivations } from './handler-fixtures';
import { bytesToText, utf8Bytes } from './fake-appwrite-rest.mjs';

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

function postCalls(harness: Harness): number {
  return harness.rest.calls.filter(
    (call: { method: string }) => call.method === 'POST',
  ).length;
}

function leakedText(result: { body: unknown; logs: string[] }): string {
  return `${JSON.stringify(result.body)}\n${result.logs.join('\n')}`;
}

function expectNoLeak(result: { body: unknown; logs: string[] }): void {
  const rendered = leakedText(result);
  expect(rendered).not.toContain(SENTINEL);
  expect(rendered).not.toContain(STAGE_OPERATION);
  expect(rendered).not.toContain('op-stage-0002');
  expect(rendered).not.toContain(PUBLISH_OPERATION);
  expect(rendered).not.toContain('op-publish-0002');
  expect(rendered).not.toContain(DATASET);
  expect(rendered).not.toContain('synthetic-2026-10-06');
  expect(rendered).not.toContain('Fictivol');
  for (const line of result.logs) expect(line).toMatch(SAFE_LOG_PATTERN);
}

function writtenReviewFor(
  harness: Harness,
  stageOperationId: string,
): ReviewDoc {
  for (const stored of harness.rest.files.get('import-run-logs')?.values() ??
    []) {
    if (!stored.name.startsWith('stage-review-v1.')) continue;
    const parsed = JSON.parse(bytesToText(stored.bytes)) as ReviewDoc;
    if (parsed.stageOperationId === stageOperationId) return parsed;
  }
  throw new Error(`no staged review for ${stageOperationId}`);
}

function seedPublishFor(
  harness: Harness,
  operationId: string,
  review: ReviewDoc,
  overrides: Record<string, unknown> = {},
): void {
  const intent = publishIntentDocument(
    operationId,
    {
      candidateVersionId: review.candidateVersionId,
      candidateSha256: review.candidateSha256,
      rawSnapshotSha256: review.rawSnapshotSha256,
      baselineVersionId: review.baselineVersionId,
      baselineFingerprint: review.baselineFingerprint,
    },
    { stageOperationId: review.stageOperationId, ...overrides },
  );
  harness.seedFile(
    'import-run-logs',
    intentFileId(operationId),
    intentFileName(operationId),
    JSON.stringify(intent),
  );
}

describe('handler denial gaps', () => {
  it('reports a missing raw snapshot as operation-unknown with no writes', async () => {
    const harness = createHarness();
    try {
      harness.seedFile(
        'import-run-logs',
        intentFileId(STAGE_OPERATION),
        intentFileName(STAGE_OPERATION),
        JSON.stringify(stageIntentDocument()),
      );
      const postsBefore = postCalls(harness);
      const result = await harness.call({
        bodyJson: envelope(STAGE_OPERATION),
      });
      expect(result.status).toBe(404);
      expect(result.body.code).toBe('operation-unknown');
      expect(result.body.operationRef).toMatch(/^[0-9a-f]{12}$/);
      expect(postCalls(harness)).toBe(postsBefore);
      expect(harness.rest.rowIds('import-runs')).toEqual([]);
      expect(harness.rest.fileIds('published-datasets')).toEqual([]);
      expect(harness.rest.rowIds('dataset-versions')).toEqual([]);
      expect(harness.rest.rowIds('dataset-bundles')).toEqual([]);
      expectNoLeak(result);
    } finally {
      harness.dispose();
    }
  });

  it('rejects an intent whose operation binding does not match with no writes', async () => {
    const harness = createHarness();
    try {
      const storedOperation = 'op-stage-0002';
      harness.seedFile(
        'import-run-logs',
        intentFileId(STAGE_OPERATION),
        intentFileName(STAGE_OPERATION),
        JSON.stringify(stageIntentDocument(storedOperation)),
      );
      const postsBefore = postCalls(harness);
      const result = await harness.call({
        bodyJson: envelope(STAGE_OPERATION),
      });
      expect(result.status).toBe(403);
      expect(result.body.code).toBe('operation-rejected');
      expect(result.body.operationRef).toMatch(/^[0-9a-f]{12}$/);
      expect(postCalls(harness)).toBe(postsBefore);
      expect(harness.rest.rowIds('import-runs')).toEqual([]);
      expect(harness.rest.fileIds('published-datasets')).toEqual([]);
      expect(harness.rest.rowIds('dataset-versions')).toEqual([]);
      expect(harness.rest.rowIds('dataset-bundles')).toEqual([]);
      expectNoLeak(result);
    } finally {
      harness.dispose();
    }
  });

  it('rejects a publish whose baseline went stale with no further writes', async () => {
    const harness = createHarness({ publishEnabled: true });
    try {
      const bytesA = snapshotBytes();
      harness.seedFile('raw-sources', RAW_FILE_ID, 'raw-a.json', bytesA);
      harness.seedFile(
        'import-run-logs',
        intentFileId(STAGE_OPERATION),
        intentFileName(STAGE_OPERATION),
        JSON.stringify(
          stageIntentDocument(STAGE_OPERATION, {
            rawSnapshotSha256: sha256Hex(bytesA),
          }),
        ),
      );
      expect(
        (await harness.call({ bodyJson: envelope(STAGE_OPERATION) })).body.code,
      ).toBe('staged');

      const documentB = buildSnapshotDocument({
        commercialName: 'Fictivol Two',
      });
      const bytesB = utf8Bytes(JSON.stringify(documentB));
      const stageB = 'op-stage-0002';
      harness.seedFile('raw-sources', 'raw-src-0002', 'raw-b.json', bytesB);
      harness.seedFile(
        'import-run-logs',
        intentFileId(stageB),
        intentFileName(stageB),
        JSON.stringify(
          stageIntentDocument(stageB, {
            rawSnapshotFileId: 'raw-src-0002',
            rawSnapshotSha256: sha256Hex(bytesB),
          }),
        ),
      );
      expect(
        (await harness.call({ bodyJson: envelope(stageB) })).body.code,
      ).toBe('staged');

      const reviewA = writtenReviewFor(harness, STAGE_OPERATION);
      const reviewB = writtenReviewFor(harness, stageB);
      seedPublishFor(harness, PUBLISH_OPERATION, reviewA);
      expect(
        (await harness.call({ bodyJson: envelope(PUBLISH_OPERATION) })).body
          .code,
      ).toBe('published');

      const publishB = 'op-publish-0002';
      seedPublishFor(harness, publishB, reviewB);
      const publishedFiles = harness.rest.fileIds('published-datasets');
      const versionRows = harness.rest.rowIds('dataset-versions');
      const callsBefore = harness.rest.calls.length;
      const stateBefore = JSON.stringify({
        rows: [...harness.rest.rows.entries()].map(([table, entries]) => [
          table,
          [...entries.entries()].sort(([a], [b]) => a.localeCompare(b)),
        ]),
        files: [...harness.rest.files.entries()].map(([bucket, entries]) => [
          bucket,
          [...entries.keys()].sort(),
        ]),
      });
      const result = await harness.call({ bodyJson: envelope(publishB) });
      expect(result.status).toBe(409);
      expect(result.body.code).toBe('stale-baseline');
      expect(result.body.operationRef).toMatch(/^[0-9a-f]{12}$/);
      const newCalls = harness.rest.calls.slice(callsBefore);
      const newPosts = newCalls.filter(
        (call: { method: string }) => call.method === 'POST',
      );
      for (const call of newPosts) {
        const path = (call as { path: string }).path;
        expect(path).toContain('import-runs');
        expect(path).not.toContain('published-datasets');
        expect(path).not.toContain('dataset-bundles');
        expect(path).not.toContain('dataset-versions');
      }
      const stateAfter = JSON.stringify({
        rows: [...harness.rest.rows.entries()].map(([table, entries]) => [
          table,
          [...entries.entries()].sort(([a], [b]) => a.localeCompare(b)),
        ]),
        files: [...harness.rest.files.entries()].map(([bucket, entries]) => [
          bucket,
          [...entries.keys()].sort(),
        ]),
      });
      expect(stateAfter).toBe(stateBefore);
      expect(harness.rest.rows.get('import-runs')?.has('lock')).toBe(false);
      expect(harness.rest.fileIds('published-datasets')).toEqual(
        publishedFiles,
      );
      expect(harness.rest.rowIds('dataset-versions')).toEqual(versionRows);
      expect(reviewFileId).toBeDefined();
      expectNoLeak(result);
    } finally {
      harness.dispose();
    }
  });
});
