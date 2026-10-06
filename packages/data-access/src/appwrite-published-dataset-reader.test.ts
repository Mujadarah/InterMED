import { describe, expect, it } from 'vitest';
import { createAppwritePublishedDatasetReader } from './appwrite-published-dataset-reader';
import type {
  FetchLike,
  FetchLikeOptions,
  FetchLikeResponse,
} from './appwrite-published-dataset-reader';

const readerOptions = {
  endpoint: 'https://fra.cloud.appwrite.io/v1',
  projectId: 'intermed-dev',
  databaseId: 'intermed-datasets',
  versionsTableId: 'dataset-versions',
  bundlesTableId: 'dataset-bundles',
  bundleBucketId: 'published-datasets',
} as const;

const publishedRow = {
  $id: 'synthetic-fixture-version-0',
  $createdAt: '2026-01-01T00:00:00.000+00:00',
  $updatedAt: '2026-01-01T00:00:00.000+00:00',
  $permissions: ['read("any")'],
  $tableId: 'dataset-versions',
  $databaseId: 'intermed-datasets',
  dataset: 'synthetic-fixture-demo',
  version: '0.0.0-synthetic',
  sourceIds: ['synthetic-fixture-source'],
  upstreamVersion: 'SYNTHETIC-UPSTREAM-VERSION',
  upstreamPublishedAt: '2025-12-31T00:00:00.000Z',
  publishedAt: '2026-01-02T00:00:00.000Z',
  importedAt: '2026-01-01T00:00:00.000Z',
  checksum: 'SYNTHETIC-CHECKSUM-NOT-A-REAL-DIGEST',
  schemaVersion: '0.0.0-synthetic',
  minimumClientVersion: '0.0.0',
  recordCounts: '{"syntheticFixtureRows":1}',
  coverage: 'SYNTHETIC-COVERAGE-NOTE-NOT-A-CLINICAL-CLAIM',
  rightsApprovalReference: 'SYNTHETIC-RIGHTS-REFERENCE-NOT-A-PERMISSION',
  clinicalReviewReference: 'SYNTHETIC-REVIEW-REFERENCE-NOT-A-REVIEW',
  previousVersionId: null,
  status: 'published',
};

const bundleRow = {
  $id: 'synthetic-fixture-bundle-0',
  datasetVersionId: 'synthetic-fixture-version-0',
  fileId: 'synthetic-fixture-file-0',
  fileName: 'synthetic-fixture-bundle.json',
  contentType: 'application/json',
  byteSize: 12,
  checksum: 'SYNTHETIC-CHECKSUM-NOT-A-REAL-DIGEST',
};

/**
 * Byte-exact query strings produced by the Appwrite web SDK
 * (`Query.equal`, `Query.orderDesc`, `Query.limit`) for TablesDB, verified
 * against `src/query.ts` of https://github.com/appwrite/sdk-for-web on
 * 2026-10-06: `Query.toString()` serialises `{ method, attribute, values }`
 * and drops the members that stay undefined.
 */
const sdkQueries = {
  dataset:
    '{"method":"equal","attribute":"dataset","values":["synthetic-fixture-demo"]}',
  status: '{"method":"equal","attribute":"status","values":["published"]}',
  publishedAt: '{"method":"orderDesc","attribute":"publishedAt"}',
  limitOne: '{"method":"limit","values":[1]}',
  bundleForVersion:
    '{"method":"equal","attribute":"datasetVersionId","values":["synthetic-fixture-version-0"]}',
} as const;

/**
 * Decode the `queries[N]` request parameters exactly as the server would read
 * them, in the order they were sent.
 */
function sentQueries(url: string): readonly string[] {
  const params = new URL(url).searchParams;
  const queries: string[] = [];
  for (let index = 0; ; index += 1) {
    const query = params.get(`queries[${index}]`);
    if (query === null) break;
    queries.push(query);
  }
  return queries;
}

interface RecordedCall {
  readonly url: string;
  readonly options: FetchLikeOptions | undefined;
}

function fakeFetch(respond: () => FetchLikeResponse): {
  readonly fetchLike: FetchLike;
  readonly calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  return {
    calls,
    fetchLike: async (url, options) => {
      calls.push({ url, options });
      return respond();
    },
  };
}

function jsonResponse(status: number, body: unknown): FetchLikeResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('Appwrite published dataset reader', () => {
  it('reads the published manifest with one unauthenticated public request', async () => {
    const { fetchLike, calls } = fakeFetch(() =>
      jsonResponse(200, { total: 1, rows: [publishedRow] }),
    );
    const reader = createAppwritePublishedDatasetReader({
      ...readerOptions,
      fetchLike,
    });

    const result = await reader.getManifest('synthetic-fixture-demo');

    expect(result).toEqual({
      status: 'available',
      value: {
        dataset: 'synthetic-fixture-demo',
        datasetVersionId: 'synthetic-fixture-version-0',
        version: '0.0.0-synthetic',
        sourceIds: ['synthetic-fixture-source'],
        upstreamVersion: 'SYNTHETIC-UPSTREAM-VERSION',
        upstreamPublishedAt: '2025-12-31T00:00:00.000Z',
        publishedAt: '2026-01-02T00:00:00.000Z',
        importedAt: '2026-01-01T00:00:00.000Z',
        checksum: 'SYNTHETIC-CHECKSUM-NOT-A-REAL-DIGEST',
        schemaVersion: '0.0.0-synthetic',
        minimumClientVersion: '0.0.0',
        recordCounts: { syntheticFixtureRows: 1 },
        coverage: 'SYNTHETIC-COVERAGE-NOTE-NOT-A-CLINICAL-CLAIM',
        rightsApprovalReference: 'SYNTHETIC-RIGHTS-REFERENCE-NOT-A-PERMISSION',
        clinicalReviewReference: 'SYNTHETIC-REVIEW-REFERENCE-NOT-A-REVIEW',
        previousVersionId: null,
      },
    });
    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error('missing recorded request');
    expect(call.options?.method).toBe('GET');
    expect(call.options?.headers).toEqual({
      'X-Appwrite-Project': 'intermed-dev',
    });
    expect(call.url).toBe(
      'https://fra.cloud.appwrite.io/v1/tablesdb/intermed-datasets/tables/dataset-versions/rows' +
        `?queries[0]=${encodeURIComponent(sdkQueries.dataset)}` +
        `&queries[1]=${encodeURIComponent(sdkQueries.status)}` +
        `&queries[2]=${encodeURIComponent(sdkQueries.publishedAt)}` +
        `&queries[3]=${encodeURIComponent(sdkQueries.limitOne)}`,
    );
  });

  it('sends manifest queries as the exact JSON strings of the Appwrite SDK', async () => {
    const { fetchLike, calls } = fakeFetch(() =>
      jsonResponse(200, { total: 1, rows: [publishedRow] }),
    );
    const reader = createAppwritePublishedDatasetReader({
      ...readerOptions,
      fetchLike,
    });

    await reader.getManifest('synthetic-fixture-demo');

    const call = calls[0];
    if (!call) throw new Error('missing recorded request');
    expect(sentQueries(call.url)).toEqual([
      sdkQueries.dataset,
      sdkQueries.status,
      sdkQueries.publishedAt,
      sdkQueries.limitOne,
    ]);
  });

  it('sends bundle queries as the exact JSON strings of the Appwrite SDK', async () => {
    const { fetchLike, calls } = fakeFetch(() =>
      jsonResponse(200, { total: 1, rows: [bundleRow] }),
    );
    const reader = createAppwritePublishedDatasetReader({
      ...readerOptions,
      fetchLike,
    });

    await reader.getBundleDescriptor('synthetic-fixture-version-0');

    const call = calls[0];
    if (!call) throw new Error('missing recorded request');
    expect(sentQueries(call.url)).toEqual([
      sdkQueries.bundleForVersion,
      sdkQueries.limitOne,
    ]);
  });

  it('sends no API key, JWT or session cookie with public reads', async () => {
    const { fetchLike, calls } = fakeFetch(() =>
      jsonResponse(200, { total: 0, rows: [] }),
    );
    const reader = createAppwritePublishedDatasetReader({
      ...readerOptions,
      fetchLike,
    });

    await reader.getManifest('synthetic-fixture-demo');

    for (const call of calls) {
      const headers = call.options?.headers ?? {};
      expect(Object.keys(headers)).toEqual(['X-Appwrite-Project']);
      expect(JSON.stringify(headers)).not.toMatch(/key|jwt|cookie|token/i);
    }
  });

  it('maps missing optional publication fields to null instead of values', async () => {
    const { fetchLike } = fakeFetch(() =>
      jsonResponse(200, {
        total: 1,
        rows: [
          {
            ...publishedRow,
            upstreamVersion: null,
            upstreamPublishedAt: null,
            publishedAt: null,
            previousVersionId: null,
          },
        ],
      }),
    );
    const reader = createAppwritePublishedDatasetReader({
      ...readerOptions,
      fetchLike,
    });

    const result = await reader.getManifest('synthetic-fixture-demo');

    expect(result).toMatchObject({
      status: 'available',
      value: {
        upstreamVersion: null,
        upstreamPublishedAt: null,
        publishedAt: null,
        previousVersionId: null,
      },
    });
  });

  it('reports a dataset without a published generation as absent', async () => {
    const { fetchLike } = fakeFetch(() =>
      jsonResponse(200, { total: 0, rows: [] }),
    );
    const reader = createAppwritePublishedDatasetReader({
      ...readerOptions,
      fetchLike,
    });

    expect(await reader.getManifest('synthetic-fixture-demo')).toEqual({
      status: 'absent',
      reason: 'not-published',
    });
  });

  it('reports transport failure as unavailable without inventing data', async () => {
    const { fetchLike } = fakeFetch(() => {
      throw new TypeError('synthetic network failure');
    });
    const reader = createAppwritePublishedDatasetReader({
      ...readerOptions,
      fetchLike,
    });

    expect(await reader.getManifest('synthetic-fixture-demo')).toEqual({
      status: 'unavailable',
      reason: 'transport-error',
    });
  });

  it('reports refused access as unavailable', async () => {
    const { fetchLike } = fakeFetch(() => jsonResponse(401, { message: 'no' }));
    const reader = createAppwritePublishedDatasetReader({
      ...readerOptions,
      fetchLike,
    });

    expect(await reader.getManifest('synthetic-fixture-demo')).toEqual({
      status: 'unavailable',
      reason: 'denied',
    });
  });

  it('rejects rows missing required publication metadata', async () => {
    const { fetchLike } = fakeFetch(() =>
      jsonResponse(200, {
        total: 1,
        rows: [{ ...publishedRow, checksum: undefined }],
      }),
    );
    const reader = createAppwritePublishedDatasetReader({
      ...readerOptions,
      fetchLike,
    });

    expect(await reader.getManifest('synthetic-fixture-demo')).toEqual({
      status: 'unavailable',
      reason: 'invalid-response',
    });
  });

  it('rejects record counts that are not a count object', async () => {
    const notAnObject = fakeFetch(() =>
      jsonResponse(200, {
        total: 1,
        rows: [{ ...publishedRow, recordCounts: '["synthetic"]' }],
      }),
    );
    const notJson = fakeFetch(() =>
      jsonResponse(200, {
        total: 1,
        rows: [{ ...publishedRow, recordCounts: 'SYNTHETIC-NOT-JSON' }],
      }),
    );

    for (const { fetchLike } of [notAnObject, notJson]) {
      const reader = createAppwritePublishedDatasetReader({
        ...readerOptions,
        fetchLike,
      });
      expect(await reader.getManifest('synthetic-fixture-demo')).toEqual({
        status: 'unavailable',
        reason: 'invalid-response',
      });
    }
  });

  it('rejects a response that is not a row list', async () => {
    const { fetchLike } = fakeFetch(() => jsonResponse(200, { rows: 'nope' }));
    const reader = createAppwritePublishedDatasetReader({
      ...readerOptions,
      fetchLike,
    });

    expect(await reader.getManifest('synthetic-fixture-demo')).toEqual({
      status: 'unavailable',
      reason: 'invalid-response',
    });
  });

  it('reads a bundle descriptor and builds a public download location', async () => {
    const { fetchLike, calls } = fakeFetch(() =>
      jsonResponse(200, { total: 1, rows: [bundleRow] }),
    );
    const reader = createAppwritePublishedDatasetReader({
      ...readerOptions,
      fetchLike,
    });

    const result = await reader.getBundleDescriptor(
      'synthetic-fixture-version-0',
    );

    expect(result).toEqual({
      status: 'available',
      value: {
        id: 'synthetic-fixture-bundle-0',
        datasetVersionId: 'synthetic-fixture-version-0',
        fileName: 'synthetic-fixture-bundle.json',
        contentType: 'application/json',
        byteSize: 12,
        checksum: 'SYNTHETIC-CHECKSUM-NOT-A-REAL-DIGEST',
        url: 'https://fra.cloud.appwrite.io/v1/storage/buckets/published-datasets/files/synthetic-fixture-file-0/view?project=intermed-dev',
      },
    });
    const call = calls[0];
    if (!call) throw new Error('missing recorded request');
    expect(call.url).toContain(
      '/tablesdb/intermed-datasets/tables/dataset-bundles/rows?',
    );
  });

  it('reports a missing bundle descriptor as not found', async () => {
    const { fetchLike } = fakeFetch(() =>
      jsonResponse(200, { total: 0, rows: [] }),
    );
    const reader = createAppwritePublishedDatasetReader({
      ...readerOptions,
      fetchLike,
    });

    expect(
      await reader.getBundleDescriptor('synthetic-fixture-version-0'),
    ).toEqual({
      status: 'absent',
      reason: 'not-found',
    });
  });

  it('rejects empty identifiers instead of querying', async () => {
    const { fetchLike, calls } = fakeFetch(() =>
      jsonResponse(200, { total: 0, rows: [] }),
    );
    const reader = createAppwritePublishedDatasetReader({
      ...readerOptions,
      fetchLike,
    });

    await expect(reader.getManifest('')).rejects.toThrow();
    await expect(reader.getBundleDescriptor('  ')).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it('rejects bundle rows without a file reference', async () => {
    const { fetchLike } = fakeFetch(() =>
      jsonResponse(200, {
        total: 1,
        rows: [{ ...bundleRow, fileId: undefined }],
      }),
    );
    const reader = createAppwritePublishedDatasetReader({
      ...readerOptions,
      fetchLike,
    });

    expect(
      await reader.getBundleDescriptor('synthetic-fixture-version-0'),
    ).toEqual({
      status: 'unavailable',
      reason: 'invalid-response',
    });
  });
});
