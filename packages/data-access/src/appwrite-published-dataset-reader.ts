import type {
  PublishedBundleDescriptor,
  PublishedDatasetManifest,
  PublishedDatasetRead,
  PublishedDatasetReader,
  PublishedDatasetUnavailable,
} from '@intermed/domain';
import { z } from 'zod';

/** Minimal response surface of a `fetch`-like function. */
export interface FetchLikeResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

/** Minimal request surface: this reader only ever performs GET requests. */
export interface FetchLikeOptions {
  readonly method?: 'GET';
  readonly headers?: Readonly<Record<string, string>>;
}

/** Injected transport. `globalThis.fetch` satisfies this shape. */
export type FetchLike = (
  url: string,
  options?: FetchLikeOptions,
) => Promise<FetchLikeResponse>;

export interface AppwritePublishedDatasetReaderOptions {
  /** Base API endpoint including the version path, no trailing slash needed. */
  readonly endpoint: string;
  /** Public project identifier. Never a key: keys never reach a browser. */
  readonly projectId: string;
  readonly databaseId: string;
  readonly versionsTableId: string;
  readonly bundlesTableId: string;
  readonly bundleBucketId: string;
  readonly fetchLike: FetchLike;
}

/** Row list envelope of the TablesDB REST API. */
const rowListSchema = z.object({
  total: z.number().optional(),
  rows: z.array(z.unknown()),
});

/** Publication metadata row, validated at the transport boundary. */
const versionRowSchema = z.object({
  $id: z.string().min(1),
  dataset: z.string().min(1),
  version: z.string().min(1),
  sourceIds: z.array(z.string().min(1)),
  upstreamVersion: z.string().nullish(),
  upstreamPublishedAt: z.string().nullish(),
  publishedAt: z.string().nullish(),
  importedAt: z.string().min(1),
  checksum: z.string().min(1),
  schemaVersion: z.string().min(1),
  minimumClientVersion: z.string().min(1),
  recordCounts: z.string().min(1),
  coverage: z.string().min(1),
  rightsApprovalReference: z.string().min(1),
  clinicalReviewReference: z.string().min(1),
  previousVersionId: z.string().nullish(),
  status: z.string().min(1),
});

/** Bundle descriptor row, validated at the transport boundary. */
const bundleRowSchema = z.object({
  $id: z.string().min(1),
  datasetVersionId: z.string().min(1),
  fileId: z.string().min(1),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  byteSize: z.union([
    z.number().int().nonnegative(),
    z.string().regex(/^[0-9]+$/),
  ]),
  checksum: z.string().min(1),
});

const recordCountsSchema = z.record(z.string(), z.number().int().nonnegative());

/**
 * Map a non-successful HTTP status onto an explicit unavailable reason so a
 * refused or broken response is never mistaken for "nothing published".
 */
function failureForStatus(status: number): PublishedDatasetUnavailable {
  return {
    status: 'unavailable',
    reason: status >= 400 && status < 500 ? 'denied' : 'transport-error',
  };
}

/**
 * Appwrite REST query strings for TablesDB. These mirror `Query.equal`,
 * `Query.orderDesc` and `Query.limit` of the official web SDK exactly
 * (`src/query.ts` of https://github.com/appwrite/sdk-for-web, `Query` builds
 * `{ method, attribute, values }` and JSON-bigint drops the members that stay
 * undefined), so `equal` carries `attribute` plus `values`, `orderDesc` carries
 * only `attribute`, and `limit` carries only `values`. The adapter never sends
 * bigint values, so `JSON.stringify` is byte-compatible with the SDK here.
 */
function equalQuery(attribute: string, value: string): string {
  return JSON.stringify({ method: 'equal', attribute, values: [value] });
}

function orderDescQuery(attribute: string): string {
  return JSON.stringify({ method: 'orderDesc', attribute });
}

function limitQuery(limit: number): string {
  return JSON.stringify({ method: 'limit', values: [limit] });
}

function baseUrl(endpoint: string): string {
  return endpoint.replace(/\/+$/, '');
}

function rowsUrl(
  options: AppwritePublishedDatasetReaderOptions,
  tableId: string,
  queries: readonly string[],
): string {
  const search = queries
    .map((query, index) => `queries[${index}]=${encodeURIComponent(query)}`)
    .join('&');
  return `${baseUrl(options.endpoint)}/tablesdb/${encodeURIComponent(options.databaseId)}/tables/${encodeURIComponent(tableId)}/rows?${search}`;
}

function bundleUrl(
  options: AppwritePublishedDatasetReaderOptions,
  fileId: string,
): string {
  return `${baseUrl(options.endpoint)}/storage/buckets/${encodeURIComponent(options.bundleBucketId)}/files/${encodeURIComponent(fileId)}/view?project=${encodeURIComponent(options.projectId)}`;
}

/**
 * Perform one anonymous public row listing. Only the public project identifier
 * header is sent: no key, no JWT, no session.
 */
async function listRows(
  options: AppwritePublishedDatasetReaderOptions,
  tableId: string,
  queries: readonly string[],
): Promise<PublishedDatasetRead<readonly unknown[]>> {
  let response: FetchLikeResponse;
  try {
    response = await options.fetchLike(rowsUrl(options, tableId, queries), {
      method: 'GET',
      headers: { 'X-Appwrite-Project': options.projectId },
    });
  } catch {
    return { status: 'unavailable', reason: 'transport-error' };
  }
  if (!response.ok) return failureForStatus(response.status);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: 'unavailable', reason: 'invalid-response' };
  }
  const list = rowListSchema.safeParse(body);
  if (!list.success)
    return { status: 'unavailable', reason: 'invalid-response' };
  return { status: 'available', value: list.data.rows };
}

/**
 * Parse published record counts. @returns The counts, or null when the payload
 * is not a count object.
 */
function parseRecordCounts(source: string): Record<string, number> | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(source);
  } catch {
    return null;
  }
  const counts = recordCountsSchema.safeParse(decoded);
  return counts.success ? counts.data : null;
}

/**
 * Create a read-only Appwrite adapter over the public TablesDB and Storage REST
 * endpoints. Responses are validated with Zod at this boundary and converted to
 * the vendor-neutral domain contract; nothing vendor-specific leaves it.
 */
export function createAppwritePublishedDatasetReader(
  options: AppwritePublishedDatasetReaderOptions,
): PublishedDatasetReader {
  return {
    getManifest: async (dataset) => {
      if (!dataset.trim()) throw new Error('dataset identifier is required');
      const listed = await listRows(options, options.versionsTableId, [
        equalQuery('dataset', dataset),
        equalQuery('status', 'published'),
        orderDescQuery('publishedAt'),
        limitQuery(1),
      ]);
      if (listed.status !== 'available') return listed;
      const [raw] = listed.value;
      if (raw === undefined)
        return { status: 'absent', reason: 'not-published' };
      const row = versionRowSchema.safeParse(raw);
      if (!row.success)
        return { status: 'unavailable', reason: 'invalid-response' };
      const recordCounts = parseRecordCounts(row.data.recordCounts);
      if (!recordCounts)
        return { status: 'unavailable', reason: 'invalid-response' };
      const manifest: PublishedDatasetManifest = {
        dataset: row.data.dataset,
        datasetVersionId: row.data.$id,
        version: row.data.version,
        sourceIds: row.data.sourceIds,
        upstreamVersion: row.data.upstreamVersion ?? null,
        upstreamPublishedAt: row.data.upstreamPublishedAt ?? null,
        publishedAt: row.data.publishedAt ?? null,
        importedAt: row.data.importedAt,
        checksum: row.data.checksum,
        schemaVersion: row.data.schemaVersion,
        minimumClientVersion: row.data.minimumClientVersion,
        recordCounts,
        coverage: row.data.coverage,
        rightsApprovalReference: row.data.rightsApprovalReference,
        clinicalReviewReference: row.data.clinicalReviewReference,
        previousVersionId: row.data.previousVersionId ?? null,
      };
      return { status: 'available', value: manifest };
    },
    getBundleDescriptor: async (datasetVersionId) => {
      if (!datasetVersionId.trim())
        throw new Error('dataset version identifier is required');
      const listed = await listRows(options, options.bundlesTableId, [
        equalQuery('datasetVersionId', datasetVersionId),
        limitQuery(1),
      ]);
      if (listed.status !== 'available') return listed;
      const [raw] = listed.value;
      if (raw === undefined) return { status: 'absent', reason: 'not-found' };
      const row = bundleRowSchema.safeParse(raw);
      if (!row.success)
        return { status: 'unavailable', reason: 'invalid-response' };
      const descriptor: PublishedBundleDescriptor = {
        id: row.data.$id,
        datasetVersionId: row.data.datasetVersionId,
        fileName: row.data.fileName,
        contentType: row.data.contentType,
        byteSize:
          typeof row.data.byteSize === 'string'
            ? Number(row.data.byteSize)
            : row.data.byteSize,
        checksum: row.data.checksum,
        url: bundleUrl(options, row.data.fileId),
      };
      return { status: 'available', value: descriptor };
    },
  };
}
