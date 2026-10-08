import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createAppwriteStore } from '../../infra/appwrite/functions/import-anmdmr/src/appwrite-store.js';

type JSONValue = string | number | boolean | null | JSONObject | JSONValue[];
interface JSONObject {
  [k: string]: JSONValue;
}

type Store = ReturnType<typeof createAppwriteStore>;

interface StoreConfig {
  fetch: typeof fetch;
  endpoint: string;
  projectId: string;
  serverKey: string;
  maxBytes?: number;
}

interface FakeFetchOptions {
  method?: string;
  headers?: Headers | Record<string, string>;
  body?: string | FormData;
  redirect?: RequestRedirect | undefined;
}

interface FakeState {
  tables: Record<string, Map<string, JSONObject>>;
  buckets: Record<string, Map<string, JSONObject>>;
}

interface TrackedSource {
  pulled: number;
  cancelled: boolean;
}

const ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = 'intermed-dev';
const ROWS_PREFIX = '/v1/tablesdb/intermed-datasets/tables';
const FILES_PREFIX = '/v1/storage/buckets';
const FIVE_MIB = 5 * 1024 * 1024;
const LOCK_COLUMNS = [
  'sourceId',
  'snapshotVersion',
  'importerVersion',
  'startedAt',
  'completenessStatus',
  'publicationStatus',
  'approvalReference',
];

function toHeaders(
  input: Headers | Record<string, string> | undefined,
): Headers {
  if (input === undefined) return new Headers();
  return input instanceof Headers ? input : new Headers(input);
}

function jsonResponse(payload: JSONValue, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function errorResponse(status: number, message: string): Response {
  return jsonResponse({ message }, status);
}

function bytesResponse(
  chunkCount: number,
  chunkBytes: number,
  declaredContentLength?: number,
): {
  response: Response;
  source: TrackedSource;
} {
  const source: TrackedSource = { pulled: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      source.pulled += 1;
      if (source.pulled > chunkCount) {
        controller.close();
        return;
      }
      controller.enqueue(new Uint8Array(chunkBytes));
    },
    cancel() {
      source.cancelled = true;
    },
  });
  const headers = new Headers({ 'content-type': 'application/json' });
  if (declaredContentLength !== undefined) {
    headers.set('content-length', String(declaredContentLength));
  }
  return {
    response: new Response(stream as unknown as BodyInit, {
      status: 200,
      headers,
    }),
    source,
  };
}

function rawStreamResponse(
  stream: ReadableStream<Uint8Array | string>,
  declaredContentLength?: number,
): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (declaredContentLength !== undefined) {
    headers.set('content-length', String(declaredContentLength));
  }
  return new Response(stream as unknown as BodyInit, { status: 200, headers });
}

function singleChunkStream(
  value: Uint8Array | string,
): ReadableStream<Uint8Array | string> {
  let sent = false;
  return new ReadableStream<Uint8Array | string>({
    pull(controller) {
      if (sent) {
        controller.close();
        return;
      }
      sent = true;
      controller.enqueue(value);
    },
  });
}

function failingStream(message: string): ReadableStream<Uint8Array | string> {
  return new ReadableStream<Uint8Array | string>({
    pull() {
      throw new Error(message);
    },
  });
}

function createFakeServer(serverKey: string) {
  const state: FakeState = {
    tables: {
      'import-runs': new Map(),
      'dataset-bundles': new Map(),
      'dataset-versions': new Map(),
    },
    buckets: {
      'raw-sources': new Map(),
      quarantine: new Map(),
      'import-run-logs': new Map(),
      'published-datasets': new Map(),
    },
  };

  const fetchMock = vi.fn(
    async (
      url: string | URL | Request,
      options?: FakeFetchOptions,
    ): Promise<Response> => {
      const method = options?.method ?? 'GET';
      const headers = toHeaders(options?.headers);
      const reqProject = headers.get('X-Appwrite-Project');
      const reqKey = headers.get('X-Appwrite-Key');
      if (reqProject !== PROJECT_ID)
        return errorResponse(401, 'Unauthorized project');
      if (reqKey !== serverKey) return errorResponse(401, 'Unauthorized key');

      const urlObj = new URL(url.toString());
      const path = urlObj.pathname;

      const tableMatch = path.match(
        /^\/v1\/tablesdb\/intermed-datasets\/tables\/([^/]+)\/rows(?:\/([^/]+))?$/,
      );
      if (tableMatch) {
        const tableId = tableMatch[1] ?? '';
        const rowId = tableMatch[2];
        const table = state.tables[tableId];
        if (!table) return errorResponse(404, 'Table not found');

        if (method === 'POST') {
          const parsed = JSON.parse(String(options?.body ?? '')) as {
            rowId: string;
            data: JSONObject;
            permissions: string[];
          };
          if (table.has(parsed.rowId)) return errorResponse(409, 'Conflict');
          const row: JSONObject = {
            ...parsed.data,
            $id: parsed.rowId,
            $sequence: 1,
            $createdAt: '2026-10-07T00:00:00.000+00:00',
            $updatedAt: '2026-10-07T00:00:00.000+00:00',
            $permissions: parsed.permissions,
            $databaseId: 'intermed-datasets',
            $tableId: tableId,
          };
          table.set(parsed.rowId, row);
          return jsonResponse(row);
        }

        if (method === 'GET' && rowId !== undefined) {
          const row = table.get(rowId);
          if (!row) return errorResponse(404, 'Not found');
          return jsonResponse(row);
        }

        if (method === 'GET') {
          return jsonResponse({
            total: table.size,
            rows: Array.from(table.values()),
          });
        }

        if (method === 'DELETE' && rowId !== undefined) {
          if (!table.has(rowId)) return errorResponse(404, 'Not found');
          table.delete(rowId);
          return jsonResponse({});
        }
      }

      const storageMatch = path.match(
        /^\/v1\/storage\/buckets\/([^/]+)\/files(?:\/([^/]+))?(?:\/(download))?$/,
      );
      if (storageMatch) {
        const bucketId = storageMatch[1] ?? '';
        const fileId = storageMatch[2];
        const action = storageMatch[3];
        const bucket = state.buckets[bucketId];
        if (!bucket) return errorResponse(404, 'Bucket not found');

        if (method === 'POST') {
          const form = options?.body;
          if (!(form instanceof FormData))
            return errorResponse(400, 'Bad multipart');
          const fileIdValue = form.get('fileId');
          const filePart = form.get('file');
          const newId = typeof fileIdValue === 'string' ? fileIdValue : '';
          if (bucket.has(newId)) return errorResponse(409, 'File conflict');
          const perms = form
            .getAll('permissions[]')
            .filter((entry): entry is string => typeof entry === 'string');
          const record: JSONObject = {
            $id: newId,
            name: filePart instanceof File ? filePart.name : 'unnamed',
            sizeOriginal: filePart instanceof Blob ? filePart.size : 0,
            // Real Storage metadata field name (recorded): `bucketId`, no `$`.
            bucketId: bucketId,
            $createdAt: '2026-10-07T00:00:00.000+00:00',
            $updatedAt: '2026-10-07T00:00:00.000+00:00',
            $permissions: perms,
          };
          bucket.set(newId, record);
          return jsonResponse(record);
        }

        if (method === 'GET' && fileId !== undefined && action === 'download') {
          if (!bucket.has(fileId)) return errorResponse(404, 'Not found');
          return new Response(new TextEncoder().encode('fake content'), {
            status: 200,
            headers: { 'content-type': 'application/octet-stream' },
          });
        }

        if (method === 'GET' && fileId !== undefined) {
          const record = bucket.get(fileId);
          if (!record) return errorResponse(404, 'Not found');
          return jsonResponse(record);
        }
      }

      return errorResponse(400, 'Bad mock path');
    },
  );

  return { state, fetchMock };
}

describe('Appwrite Store', () => {
  const serverKeyCanary = 'SECRET_CANARY_KEY_123';
  let server: ReturnType<typeof createFakeServer>;
  let state: FakeState;
  let fakeFetch: ReturnType<typeof createFakeServer>['fetchMock'];
  let store: Store;

  function makeStore(overrides: Partial<StoreConfig> = {}): Store {
    const config: StoreConfig = {
      fetch: fakeFetch as unknown as typeof fetch,
      endpoint: ENDPOINT,
      projectId: PROJECT_ID,
      serverKey: serverKeyCanary,
      ...overrides,
    };
    return createAppwriteStore(
      config as Parameters<typeof createAppwriteStore>[0],
    );
  }

  function calls(): {
    url: URL;
    method: string;
    headers: Headers;
    body: string | FormData | undefined;
    redirect?: RequestRedirect | undefined;
  }[] {
    return fakeFetch.mock.calls.map(([url, options]) => ({
      url: new URL(url.toString()),
      method: options?.method ?? 'GET',
      headers: toHeaders(options?.headers),
      body: options?.body,
      redirect: options?.redirect,
    }));
  }

  function seedRow(tableId: string, row: JSONObject): void {
    seedRawRow(tableId, String(row.$id), row);
  }

  function seedRawRow(tableId: string, key: string, row: JSONObject): void {
    const table = state.tables[tableId];
    if (!table) throw new Error('unknown table');
    table.set(key, row);
  }

  function seedFile(bucketId: string, record: JSONObject): void {
    seedRawFile(bucketId, String(record.$id), record);
  }

  function seedRawFile(
    bucketId: string,
    key: string,
    record: JSONObject,
  ): void {
    const bucket = state.buckets[bucketId];
    if (!bucket) throw new Error('unknown bucket');
    bucket.set(key, record);
  }

  function flatRow(
    tableId: string,
    rowId: string,
    data: JSONObject,
  ): JSONObject {
    return {
      ...data,
      $id: rowId,
      $sequence: 1,
      $createdAt: '2026-10-07T00:00:00.000+00:00',
      $updatedAt: '2026-10-07T00:00:00.000+00:00',
      $permissions: [],
      $databaseId: 'intermed-datasets',
      $tableId: tableId,
    };
  }

  function fileRecord(
    bucketId: string,
    fileId: string,
    size: number,
  ): JSONObject {
    return {
      $id: fileId,
      name: 'f.bin',
      sizeOriginal: size,
      // Real Storage metadata field name (recorded in after-file-raw-sources
      // and preserved-file): `bucketId`, no `$`.
      bucketId: bucketId,
      $createdAt: '2026-10-07T00:00:00.000+00:00',
      $updatedAt: '2026-10-07T00:00:00.000+00:00',
      $permissions: [],
    };
  }

  beforeEach(() => {
    server = createFakeServer(serverKeyCanary);
    state = server.state;
    fakeFetch = server.fetchMock;
    store = makeStore();
  });

  describe('configuration guards (before network)', () => {
    it('rejects untrusted endpoint and project', () => {
      expect(() => makeStore({ endpoint: 'https://wrong.example/v1' })).toThrow(
        'Untrusted endpoint',
      );
      expect(() => makeStore({ projectId: 'wrong-project' })).toThrow(
        'Untrusted project',
      );
      expect(fakeFetch).not.toHaveBeenCalled();
    });

    it('rejects missing or non-string server key', () => {
      expect(() => makeStore({ serverKey: '' })).toThrow('Missing server key');
      expect(() => makeStore({ serverKey: 123 as unknown as string })).toThrow(
        'Missing server key',
      );
      expect(fakeFetch).not.toHaveBeenCalled();
    });

    it('rejects non-function fetch', () => {
      expect(() =>
        makeStore({ fetch: undefined as unknown as typeof fetch }),
      ).toThrow('Missing fetch');
      expect(fakeFetch).not.toHaveBeenCalled();
    });

    it('rejects invalid maxBytes budgets', () => {
      for (const bad of [0, -1, 1.5, '5000', Number.NaN, FIVE_MIB + 1]) {
        expect(() => makeStore({ maxBytes: bad as unknown as number })).toThrow(
          'Invalid max bytes',
        );
      }
      expect(fakeFetch).not.toHaveBeenCalled();
    });
  });

  describe('input validation (before network)', () => {
    it('rejects non-string and malformed IDs instead of coercing them', async () => {
      const badIds: unknown[] = [
        123,
        1.5,
        true,
        null,
        undefined,
        { id: 'x' },
        '',
        'unsafe!id',
        'a'.repeat(37),
        '-start',
        '.start',
        'has space',
        'slash/id',
      ];
      for (const badId of badIds) {
        await expect(
          store.getRow('import-runs', badId as string),
        ).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          safeMessage: 'Invalid ID',
        });
        await expect(
          store.createPrivateRow('import-runs', badId as string, { a: 1 }),
        ).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          safeMessage: 'Invalid ID',
        });
        await expect(
          store.getFileMetadata('raw-sources', badId as string),
        ).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          safeMessage: 'Invalid ID',
        });
      }
      await expect(
        store.createPrivateRow(123 as unknown as string, 'row1', {}),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      await expect(
        store.publishRow(
          'dataset-bundles',
          'row2',
          123 as unknown as JSONObject,
        ),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        safeMessage: 'Invalid row data',
      });
      expect(fakeFetch).not.toHaveBeenCalled();
    });

    it('refuses PUBLIC writes to private targets before fetch', async () => {
      const blob = new Blob(['x']);
      await expect(store.publishRow('import-runs', 'row1', {})).rejects.toThrow(
        'Invalid table ID',
      );
      await expect(
        store.publishFile('raw-sources', 'f1', blob, 'f.txt'),
      ).rejects.toThrow('Invalid bucket ID');
      await expect(
        store.publishFile('quarantine', 'f1', blob, 'f.txt'),
      ).rejects.toThrow('Invalid bucket ID');
      await expect(
        store.publishFile('import-run-logs', 'f1', blob, 'f.txt'),
      ).rejects.toThrow('Invalid bucket ID');
      expect(fakeFetch).not.toHaveBeenCalled();
    });

    it('refuses PRIVATE writes to public targets before fetch', async () => {
      const blob = new Blob(['x']);
      await expect(
        store.createPrivateRow('dataset-versions', 'row1', {}),
      ).rejects.toThrow('Invalid table ID');
      await expect(
        store.createPrivateRow('dataset-bundles', 'row1', {}),
      ).rejects.toThrow('Invalid table ID');
      await expect(
        store.createPrivateFile('published-datasets', 'f1', blob, 'f.txt'),
      ).rejects.toThrow('Invalid bucket ID');
      expect(fakeFetch).not.toHaveBeenCalled();
    });

    it('rejects non-object and metadata-spoofing row data', async () => {
      for (const bad of [null, [], 'str', 5, { $id: 'spoof' }, { '': 1 }]) {
        await expect(
          store.createPrivateRow('import-runs', 'row1', bad as JSONObject),
        ).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          safeMessage: 'Invalid row data',
        });
      }
      expect(fakeFetch).not.toHaveBeenCalled();
    });

    it('rejects oversized JSON payload before fetch', async () => {
      await expect(
        store.createPrivateRow('import-runs', 'r1', {
          key: 'a'.repeat(FIVE_MIB + 1),
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        safeMessage: 'Payload too large',
      });
      expect(fakeFetch).not.toHaveBeenCalled();
    });

    it('rejects bad uploads with strict types before fetch', async () => {
      const notBlob = { size: 4, name: 'x' };
      await expect(
        store.createPrivateFile(
          'raw-sources',
          'f1',
          notBlob as unknown as Blob,
          'f.txt',
        ),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        safeMessage: 'Invalid file',
      });

      const huge = new Blob(['a'.repeat(FIVE_MIB + 1)]);
      await expect(
        store.createPrivateFile('raw-sources', 'f2', huge, 'f.txt'),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        safeMessage: 'Payload too large',
      });

      const blob = new Blob(['x']);
      await expect(
        store.createPrivateFile('raw-sources', 'f3', blob, 'bad\r\nname.txt'),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        safeMessage: 'Invalid file name',
      });
      await expect(
        store.createPrivateFile('raw-sources', 'f4', blob, ''),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        safeMessage: 'Invalid file name',
      });
      expect(fakeFetch).not.toHaveBeenCalled();
    });

    it('rejects malformed or unbounded queries before fetch', async () => {
      const tooMany = Array.from({ length: 101 }, () => '["limit",1]');
      const badQueries: unknown[] = [
        'not-an-array',
        ['equal', 'status', ['x']],
        [1, 2],
        tooMany,
        ['x'.repeat(5000)],
        ['{broken'],
        ['"scalar"'],
        ['{}'],
        ['[]'],
        [['equal']],
      ];
      for (const bad of badQueries) {
        await expect(
          store.listRows('import-runs', bad as string[]),
        ).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          safeMessage: 'Invalid queries',
        });
      }
      expect(fakeFetch).not.toHaveBeenCalled();
    });

    it('rejects invalid owner tokens before fetch', async () => {
      for (const bad of ['', '   ', 7 as unknown as string, 't'.repeat(501)]) {
        await expect(store.acquireLock(bad)).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          safeMessage: 'Invalid owner token',
        });
        await expect(store.releaseLock(bad)).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          safeMessage: 'Invalid owner token',
        });
      }
      expect(fakeFetch).not.toHaveBeenCalled();
    });
  });

  describe('single upload size cap', () => {
    it('accepts single uploads at the exact 5 MiB cap and one byte below', async () => {
      // The source packet must fit the single-object 5 MiB client cap
      // (MAX_SINGLE_BYTES). The cap is inclusive: exactly 5 MiB and 5 MiB-1
      // must reach the backend as a real Blob/Response round trip, while
      // 5 MiB+1 is refused before fetch (rejection test above).
      const atCap = new Blob(['a'.repeat(FIVE_MIB)]);
      const underCap = new Blob(['b'.repeat(FIVE_MIB - 1)]);
      const uploadedAtCap = await store.createPrivateFile(
        'raw-sources',
        'file-cap',
        atCap,
        'cap.bin',
      );
      const uploadedUnderCap = await store.createPrivateFile(
        'raw-sources',
        'file-under',
        underCap,
        'under.bin',
      );
      expect(uploadedAtCap.sizeOriginal).toBe(FIVE_MIB);
      expect(uploadedAtCap.bucketId).toBe('raw-sources');
      expect(uploadedUnderCap.sizeOriginal).toBe(FIVE_MIB - 1);
      expect(fakeFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('SDK query object protocol (recorded Appwrite shapes)', () => {
    // Byte-identical wire strings of the official SDK `Query` object form
    // (`appwrite/sdk-for-web` `src/query.ts` serialises `{ method, attribute,
    // values }` and drops the members that stay undefined). These are exactly
    // what the M3 reader (`packages/data-access/src/appwrite-published-
    // dataset-reader.ts`) sends, and what the recorded anonymous public read
    // (task-b-independent-public-query-shape.json) got HTTP 200 with.
    const RECORDED_QUERIES = [
      '{"method":"equal","attribute":"status","values":["published"]}',
      '{"method":"orderDesc","attribute":"publishedAt"}',
      '{"method":"limit","values":[1]}',
    ];
    // The invented array protocol was REJECTed by the real backend with
    // 400 / general_query_invalid on that same recorded read; it must never
    // reach fetch.
    const INVENTED_ARRAY_QUERIES = [
      '["equal","status",["published"]]',
      '["limit",1]',
    ];
    const RECORDED_ROW_ID = 'version-aba05ea1b8fc3e49f18d517b';

    it('accepts the recorded SDK query objects and forwards them verbatim', async () => {
      await expect(
        store.listRows('dataset-versions', RECORDED_QUERIES),
      ).resolves.toBeDefined();
      const [call] = calls();
      if (!call) expect.unreachable('no call recorded');
      expect(call.url.pathname).toBe(`${ROWS_PREFIX}/dataset-versions/rows`);
      expect(call.url.searchParams.getAll('queries[]')).toEqual(
        RECORDED_QUERIES,
      );
    });

    it('rejects the invented array query shapes before fetch', async () => {
      for (const bad of INVENTED_ARRAY_QUERIES) {
        await expect(
          store.listRows('dataset-versions', [bad]),
        ).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          safeMessage: 'Invalid queries',
        });
      }
      expect(fakeFetch).not.toHaveBeenCalled();
    });

    it('accepts the official orderAsc $id and cursorAfter paging shapes', async () => {
      const paging = [
        '{"method":"orderAsc","attribute":"$id"}',
        `{"method":"cursorAfter","values":["${RECORDED_ROW_ID}"]}`,
        '{"method":"limit","values":[1]}',
      ];
      await store.listRows('dataset-versions', paging);
      const [call] = calls();
      if (!call) expect.unreachable('no call recorded');
      expect(call.url.searchParams.getAll('queries[]')).toEqual(paging);
    });

    it('accepts every legitimate flat SDK query form without over-restricting', async () => {
      const legitimate = [
        '{"method":"equal","attribute":"status","values":["published","staging"]}',
        '{"method":"notEqual","attribute":"status","values":["withdrawn"]}',
        '{"method":"lessThan","attribute":"publishedAt","values":["2026-12-31T00:00:00.000+00:00"]}',
        '{"method":"lessThanEqual","attribute":"version","values":[3]}',
        '{"method":"greaterThan","attribute":"version","values":[1.5]}',
        '{"method":"greaterThanEqual","attribute":"version","values":[2]}',
        '{"method":"between","attribute":"version","values":[1,3]}',
        '{"method":"notBetween","attribute":"version","values":[4,9]}',
        '{"method":"startsWith","attribute":"dataset","values":["synthetica"]}',
        '{"method":"endsWith","attribute":"dataset","values":["demo"]}',
        '{"method":"notStartsWith","attribute":"dataset","values":["x"]}',
        '{"method":"notEndsWith","attribute":"dataset","values":["x"]}',
        '{"method":"search","attribute":"coverage","values":["synthetica"]}',
        '{"method":"notSearch","attribute":"coverage","values":["fictivol"]}',
        '{"method":"contains","attribute":"sourceIds","values":["src-1"]}',
        '{"method":"notContains","attribute":"sourceIds","values":["src-9"]}',
        '{"method":"regex","attribute":"dataset","values":["^synthetica"]}',
        '{"method":"isNull","attribute":"previousVersionId"}',
        '{"method":"isNotNull","attribute":"publishedAt"}',
        '{"method":"orderAsc","attribute":"$id"}',
        '{"method":"orderDesc","attribute":"publishedAt"}',
        '{"method":"orderRandom"}',
        '{"method":"limit","values":[1]}',
        '{"method":"offset","values":[0]}',
        `{"method":"cursorAfter","values":["${RECORDED_ROW_ID}"]}`,
        `{"method":"cursorBefore","values":["${RECORDED_ROW_ID}"]}`,
        '{"method":"select","values":["$id","status"]}',
        '{"method":"exists","values":["publishedAt"]}',
        '{"method":"notExists","values":["previousVersionId"]}',
      ];
      await store.listRows('dataset-versions', legitimate);
      const [call] = calls();
      if (!call) expect.unreachable('no call recorded');
      expect(call.url.searchParams.getAll('queries[]')).toEqual(legitimate);
    });

    it('rejects method/attribute/values field violations as constant errors', async () => {
      const badObjects = [
        '{"method":7,"values":[1]}',
        '{"method":"equal","attribute":"status"}',
        '{"method":"equal","attribute":"status","values":[]}',
        '{"method":"equal","values":["published"]}',
        '{"method":"equal","attribute":"","values":["x"]}',
        '{"method":"equal","attribute":"status","values":[{"nested":1}]}',
        '{"method":"equal","attribute":"status","values":[null]}',
        '{"method":"greaterThan","attribute":"score","values":[1e999]}',
        '{"method":"between","attribute":"version","values":[1]}',
        '{"method":"between","attribute":"version","values":[1,2,3]}',
        '{"method":"startsWith","attribute":"dataset","values":["a","b"]}',
        '{"method":"startsWith","attribute":"dataset","values":[1]}',
        '{"method":"orderDesc","attribute":"publishedAt","values":["x"]}',
        '{"method":"orderAsc"}',
        '{"method":"orderRandom","values":[1]}',
        '{"method":"orderRandom","attribute":"$id"}',
        '{"method":"limit"}',
        '{"method":"limit","values":["1"]}',
        '{"method":"limit","values":[1.5]}',
        '{"method":"limit","values":[1,2]}',
        '{"method":"limit","values":[1e999]}',
        '{"method":"limit","values":[1],"attribute":"publishedAt"}',
        '{"method":"offset","values":[-1]}',
        '{"method":"offset","values":[1],"attribute":"$id"}',
        '{"method":"cursorAfter","values":[7]}',
        '{"method":"cursorAfter","values":[""]}',
        '{"method":"cursorBefore"}',
        '{"method":"cursorAfter","values":["id"],"attribute":"$id"}',
        '{"method":"select","values":[1]}',
        '{"method":"select","values":[]}',
        '{"method":"exists","values":["a"],"attribute":"b"}',
        '{"method":"dropTable","values":["dataset-versions"]}',
        '{"method":"or","values":[{"method":"equal","attribute":"a","values":["b"]}]}',
        '{"method":"and","values":[]}',
        '{"method":"elemMatch","attribute":"items","values":[]}',
        '{"method":"limit","values":[1],"extra":"field"}',
        '{"method":"limit","values":[1],"__proto__":{"polluted":true}}',
      ];
      for (const bad of badObjects) {
        try {
          await store.listRows('dataset-versions', [bad]);
          expect.unreachable('expected query rejection');
        } catch (err: unknown) {
          expect(err).toMatchObject({
            code: 'BAD_REQUEST',
            safeMessage: 'Invalid queries',
          });
          expect(String(err)).not.toContain(bad);
        }
      }
      expect(fakeFetch).not.toHaveBeenCalled();
    });
  });

  describe('exact REST shape', () => {
    it('creates private rows with exact path, method, headers and empty permissions', async () => {
      await store.createPrivateRow('import-runs', 'row1', { sourceId: 's1' });
      const [call] = calls();
      if (!call) expect.unreachable('no call recorded');
      expect(call.url.toString()).toBe(
        `https://fra.cloud.appwrite.io${ROWS_PREFIX}/import-runs/rows`,
      );
      expect(call.method).toBe('POST');
      expect(call.headers.get('X-Appwrite-Project')).toBe(PROJECT_ID);
      expect(call.headers.get('X-Appwrite-Key')).toBe(serverKeyCanary);
      expect(call.url.toString()).not.toContain(serverKeyCanary);
      const body = JSON.parse(String(call.body)) as JSONObject;
      expect(body).toEqual({
        rowId: 'row1',
        data: { sourceId: 's1' },
        permissions: [],
      });
      expect(String(call.body)).not.toContain(serverKeyCanary);
    });

    it('publishes rows with read("any") on version/bundle tables only', async () => {
      await store.publishRow('dataset-versions', 'v1', { checksum: 'c' });
      await store.publishRow('dataset-bundles', 'b1', { checksum: 'c' });
      const recorded = calls();
      expect(recorded.map((c) => c.url.pathname)).toEqual([
        `${ROWS_PREFIX}/dataset-versions/rows`,
        `${ROWS_PREFIX}/dataset-bundles/rows`,
      ]);
      for (const call of recorded) {
        expect(call.method).toBe('POST');
        const body = JSON.parse(String(call.body)) as JSONObject;
        expect(body.permissions).toEqual(['read("any")']);
      }
    });

    it('uses exact GET/DELETE row paths', async () => {
      seedRow('import-runs', flatRow('import-runs', 'row9', { sourceId: 's' }));
      await store.getRow('import-runs', 'row9');
      await store.listRows('import-runs');
      const recorded = calls();
      expect(recorded[0]?.url.pathname).toBe(
        `${ROWS_PREFIX}/import-runs/rows/row9`,
      );
      expect(recorded[0]?.method).toBe('GET');
      expect(recorded[1]?.url.pathname).toBe(`${ROWS_PREFIX}/import-runs/rows`);
      expect(recorded[1]?.url.search).toBe('');
      expect(recorded[1]?.method).toBe('GET');
    });

    it('encodes list queries as queries[] parameters without changing the path', async () => {
      // Real SDK `Query` object wire shapes, not invented arrays.
      const queries = [
        '{"method":"equal","attribute":"publicationStatus","values":["staging"]}',
        '{"method":"limit","values":[10]}',
      ];
      await store.listRows('dataset-versions', queries);
      const [call] = calls();
      if (!call) expect.unreachable('no call recorded');
      expect(call.url.pathname).toBe(`${ROWS_PREFIX}/dataset-versions/rows`);
      expect(call.url.searchParams.getAll('queries[]')).toEqual(queries);
    });

    it('uploads private files without any permissions field at all', async () => {
      const blob = new Blob(['data'], { type: 'text/plain' });
      await store.createPrivateFile('raw-sources', 'file1', blob, 'f1.txt');
      const [call] = calls();
      if (!call) expect.unreachable('no call recorded');
      expect(call.url.pathname).toBe(`${FILES_PREFIX}/raw-sources/files`);
      expect(call.method).toBe('POST');
      const form = call.body;
      if (!(form instanceof FormData))
        throw expect.unreachable('body not form');
      expect(Array.from(form.keys())).toEqual(['fileId', 'file']);
      expect(form.getAll('permissions[]')).toEqual([]);
      expect(form.get('fileId')).toBe('file1');
    });

    it('publishes files with exactly one read("any") permission entry', async () => {
      const blob = new Blob(['data']);
      await store.publishFile('published-datasets', 'file2', blob, 'f2.txt');
      const [call] = calls();
      if (!call) expect.unreachable('no call recorded');
      expect(call.url.pathname).toBe(
        `${FILES_PREFIX}/published-datasets/files`,
      );
      const form = call.body;
      if (!(form instanceof FormData))
        throw expect.unreachable('body not form');
      expect(form.getAll('permissions[]')).toEqual(['read("any")']);
    });

    it('uses exact file metadata and download paths', async () => {
      seedFile('quarantine', fileRecord('quarantine', 'f9', 12));
      await store.getFileMetadata('quarantine', 'f9');
      await store.downloadFile('quarantine', 'f9');
      const recorded = calls();
      expect(recorded[0]?.url.pathname).toBe(
        `${FILES_PREFIX}/quarantine/files/f9`,
      );
      expect(recorded[0]?.method).toBe('GET');
      expect(recorded[1]?.url.pathname).toBe(
        `${FILES_PREFIX}/quarantine/files/f9/download`,
      );
      expect(recorded[1]?.method).toBe('GET');
    });
  });

  describe('response schema guards', () => {
    it('accepts flat rows with $id metadata and honours the requested ID', async () => {
      const created = await store.createPrivateRow('import-runs', 'row1', {
        sourceId: 's1',
      });
      expect(created.$id).toBe('row1');
      expect(created.$tableId).toBe('import-runs');
      expect(created.$databaseId).toBe('intermed-datasets');
      expect(created.sourceId).toBe('s1');
      expect(created.data).toBeUndefined();
    });

    it('rejects rows without a string $id', async () => {
      seedRawRow('import-runs', 'row1', { sourceId: 's' });
      seedRawRow('dataset-bundles', 'row1', { $id: 42, sourceId: 's' });
      await expect(store.getRow('import-runs', 'row1')).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        safeMessage: 'Missing $id in response',
      });
      await expect(
        store.getRow('dataset-bundles', 'row1'),
      ).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        safeMessage: 'Missing $id in response',
      });
    });

    it('rejects mismatched row and file IDs', async () => {
      seedRawRow('import-runs', 'row1', flatRow('import-runs', 'other', {}));
      seedRawFile(
        'raw-sources',
        'file1',
        fileRecord('raw-sources', 'other-file', 1),
      );
      await expect(store.getRow('import-runs', 'row1')).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        safeMessage: 'Response ID mismatch',
      });
      await expect(
        store.getFileMetadata('raw-sources', 'file1'),
      ).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        safeMessage: 'Response ID mismatch',
      });
    });

    it('rejects mismatched database/table/bucket context metadata', async () => {
      seedRow('import-runs', {
        ...flatRow('import-runs', 'row1', {}),
        $tableId: 'dataset-bundles',
      });
      seedRow('dataset-bundles', {
        ...flatRow('dataset-bundles', 'row2', {}),
        $databaseId: 'other-db',
      });
      seedFile('raw-sources', {
        ...fileRecord('raw-sources', 'file1', 1),
        bucketId: 'quarantine',
      });
      await expect(store.getRow('import-runs', 'row1')).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        safeMessage: 'Response context mismatch',
      });
      await expect(
        store.getRow('dataset-bundles', 'row2'),
      ).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        safeMessage: 'Response context mismatch',
      });
      await expect(
        store.getFileMetadata('raw-sources', 'file1'),
      ).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        safeMessage: 'Response context mismatch',
      });
    });

    it('accepts the real { total, rows } list envelope', async () => {
      seedRow('import-runs', flatRow('import-runs', 'row1', { sourceId: 's' }));
      const listed = await store.listRows('import-runs');
      expect(listed.total).toBe(1);
      expect(Array.isArray(listed.rows)).toBe(true);
      expect(listed.rows[0]?.$id).toBe('row1');
    });

    it('rejects the legacy documents envelope and bad totals', async () => {
      fakeFetch.mockResolvedValueOnce(
        jsonResponse({ total: 1, documents: [] }),
      );
      await expect(store.listRows('import-runs')).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        safeMessage: 'Invalid list format',
      });

      for (const total of [
        1.5,
        -1,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        '3',
      ]) {
        fakeFetch.mockResolvedValueOnce(jsonResponse({ total, rows: [] }));
        await expect(store.listRows('import-runs')).rejects.toMatchObject({
          code: 'SERVER_ERROR',
          safeMessage: 'Invalid list format',
        });
      }

      fakeFetch.mockResolvedValueOnce(jsonResponse({ total: 1, rows: {} }));
      await expect(store.listRows('import-runs')).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        safeMessage: 'Invalid list format',
      });

      fakeFetch.mockResolvedValueOnce(
        jsonResponse({ total: 1, rows: [{ noId: 1 }] }),
      );
      await expect(store.listRows('import-runs')).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        safeMessage: 'Missing $id in response',
      });

      fakeFetch.mockResolvedValueOnce('not-an-object' as unknown as Response);
      await expect(store.listRows('import-runs')).rejects.toMatchObject({
        code: 'SERVER_ERROR',
      });
    });

    it('rejects invalid list envelope objects', async () => {
      fakeFetch.mockResolvedValueOnce(jsonResponse([]));
      await expect(store.listRows('import-runs')).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        safeMessage: 'Invalid list response shape',
      });
    });

    it('rejects malformed $permissions metadata', async () => {
      seedRawRow('import-runs', 'row1', {
        ...flatRow('import-runs', 'row1', {}),
        $permissions: 'read("any")',
      });
      await expect(store.getRow('import-runs', 'row1')).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        safeMessage: 'Invalid response permissions',
      });
      seedRawFile('raw-sources', 'file1', {
        ...fileRecord('raw-sources', 'file1', 1),
        $permissions: [1, 2],
      });
      await expect(
        store.getFileMetadata('raw-sources', 'file1'),
      ).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        safeMessage: 'Invalid response permissions',
      });
    });

    it('validates file metadata size as bounded numeric data', async () => {
      const badSizes: JSONValue[] = [
        Number.NaN,
        -1,
        1.5,
        '12',
        null,
        Number.MAX_SAFE_INTEGER + 2,
      ];
      for (const size of badSizes) {
        seedFile('raw-sources', {
          ...fileRecord('raw-sources', 'file1', 0),
          sizeOriginal: size,
        });
        await expect(
          store.getFileMetadata('raw-sources', 'file1'),
        ).rejects.toMatchObject({
          code: 'SERVER_ERROR',
          safeMessage: 'Invalid file size',
        });
      }
      seedFile('raw-sources', {
        ...fileRecord('raw-sources', 'file1', 0),
        sizeOriginal: 0,
      });
      const meta = await store.getFileMetadata('raw-sources', 'file1');
      expect(meta.sizeOriginal).toBe(0);
    });
  });

  describe('file metadata bucket context (real bucketId field)', () => {
    // Recorded real Storage metadata (after-file-raw-sources.json,
    // preserved-file.json) names the bucket in `bucketId` — `$bucketId` never
    // appears in real responses. Required shape is unchanged ($id / sizeOriginal
    // / $permissions). The legacy `$bucketId` key is tolerated only as a
    // non-conflicting extra: it can never substitute for the real field or mask
    // a conflicting one.
    it('rejects recorded real file metadata whose bucketId names another bucket', async () => {
      seedRawFile(
        'raw-sources',
        'file1',
        fileRecord('published-datasets', 'file1', 25959),
      );
      await expect(
        store.getFileMetadata('raw-sources', 'file1'),
      ).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        safeMessage: 'Response context mismatch',
      });
    });

    it('accepts recorded real file metadata for the requested bucket', async () => {
      seedRawFile(
        'raw-sources',
        'file1',
        fileRecord('raw-sources', 'file1', 16),
      );
      const meta = await store.getFileMetadata('raw-sources', 'file1');
      expect(meta.$id).toBe('file1');
      expect(meta.bucketId).toBe('raw-sources');
      expect(meta.sizeOriginal).toBe(16);
    });

    it('never lets the legacy $bucketId key substitute for or mask the real field', async () => {
      // A conflicting legacy key is refused explicitly.
      seedRawFile('raw-sources', 'file1', {
        ...fileRecord('raw-sources', 'file1', 16),
        $bucketId: 'quarantine',
      });
      await expect(
        store.getFileMetadata('raw-sources', 'file1'),
      ).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        safeMessage: 'Response context mismatch',
      });

      // The fake key cannot mask a conflicting real bucketId.
      seedRawFile('raw-sources', 'file1', {
        ...fileRecord('published-datasets', 'file1', 16),
        $bucketId: 'raw-sources',
      });
      await expect(
        store.getFileMetadata('raw-sources', 'file1'),
      ).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        safeMessage: 'Response context mismatch',
      });

      // The fake key alone is never accepted as real context evidence: it is
      // handled exactly like absent context metadata (thin bridge).
      seedRawFile('raw-sources', 'file1', {
        $id: 'file1',
        name: 'f.bin',
        sizeOriginal: 16,
        $bucketId: 'raw-sources',
        $permissions: [],
      });
      await expect(
        store.getFileMetadata('raw-sources', 'file1'),
      ).resolves.toBeDefined();
    });

    it('refuses non-string bucket context values when present', async () => {
      seedRawFile('raw-sources', 'file1', {
        ...fileRecord('raw-sources', 'file1', 16),
        bucketId: 7,
      });
      await expect(
        store.getFileMetadata('raw-sources', 'file1'),
      ).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        safeMessage: 'Response context mismatch',
      });
    });
  });

  describe('bounded response reads', () => {
    it('streams a JSON body within the budget', async () => {
      const payload = flatRow('import-runs', 'row1', { sourceId: 's1' });
      const body = new TextEncoder().encode(JSON.stringify(payload));
      const source: TrackedSource = { pulled: 0, cancelled: false };
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          source.pulled += 1;
          if (source.pulled === 1) {
            controller.enqueue(body.slice(0, 10));
            return;
          }
          if (source.pulled === 2) {
            controller.enqueue(body.slice(10));
            return;
          }
          controller.close();
        },
      });
      fakeFetch.mockResolvedValueOnce(
        new Response(stream as unknown as BodyInit, { status: 200 }),
      );
      const smallStore = makeStore({ maxBytes: 4096 });
      const row = await smallStore.getRow('import-runs', 'row1');
      expect(row.sourceId).toBe('s1');
      expect(source.cancelled).toBe(false);
    });

    it('refuses and cancels an oversized streamed JSON body early', async () => {
      const { response, source } = bytesResponse(20, 64);
      fakeFetch.mockResolvedValueOnce(response);
      const smallStore = makeStore({ maxBytes: 128 });
      await expect(
        smallStore.getRow('import-runs', 'row1'),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        safeMessage: 'Response too large',
      });
      expect(source.cancelled).toBe(true);
      expect(source.pulled).toBeLessThan(21);
    });

    it('never trusts a lying Content-Length header', async () => {
      const { response, source } = bytesResponse(20, 64, 10);
      fakeFetch.mockResolvedValueOnce(response);
      const smallStore = makeStore({ maxBytes: 128 });
      await expect(
        smallStore.getRow('import-runs', 'row1'),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        safeMessage: 'Response too large',
      });
      expect(source.cancelled).toBe(true);
    });

    it('refuses early on a declared Content-Length over budget', async () => {
      const { response, source } = bytesResponse(2, 64, 4096);
      fakeFetch.mockResolvedValueOnce(response);
      const smallStore = makeStore({ maxBytes: 128 });
      await expect(
        smallStore.getRow('import-runs', 'row1'),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        safeMessage: 'Response too large',
      });
      expect(source.cancelled).toBe(true);
      // Only the stream's single prefetch chunk can ever be produced: the body
      // is refused and cancelled without a single read().
      expect(source.pulled).toBeLessThanOrEqual(1);
      expect(source.pulled).toBeLessThan(21);
    });

    it('refuses oversized downloads without buffering them', async () => {
      seedFile('raw-sources', fileRecord('raw-sources', 'file1', 1));
      const { response, source } = bytesResponse(20, 64);
      fakeFetch.mockResolvedValueOnce(response);
      const smallStore = makeStore({ maxBytes: 128 });
      await expect(
        smallStore.downloadFile('raw-sources', 'file1'),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        safeMessage: 'Response too large',
      });
      expect(source.cancelled).toBe(true);
      expect(source.pulled).toBeLessThan(21);
    });

    it('downloads bounded bytes as a Blob', async () => {
      seedFile('raw-sources', fileRecord('raw-sources', 'file1', 5));
      const blob = await store.downloadFile('raw-sources', 'file1');
      expect(blob.size).toBe('fake content'.length);
    });

    it('rejects hostile non-byte chunks and erroring streams safely', async () => {
      fakeFetch.mockResolvedValueOnce(
        rawStreamResponse(singleChunkStream('not-bytes')),
      );
      await expect(store.getRow('import-runs', 'row1')).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        safeMessage: 'Unsupported response chunk',
      });

      fakeFetch.mockResolvedValueOnce(
        rawStreamResponse(
          failingStream(`stream blew up with ${serverKeyCanary}`),
        ),
      );
      await expect(store.getRow('import-runs', 'row1')).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        safeMessage: 'Malformed response body',
      });
    });

    it('reports malformed JSON as a constant error without payload or secret data', async () => {
      fakeFetch.mockResolvedValueOnce(
        new Response(new TextEncoder().encode('{"broken'), { status: 200 }),
      );
      try {
        await store.getRow('import-runs', 'row1');
        expect.unreachable('expected malformed JSON rejection');
      } catch (err: unknown) {
        expect(err).toMatchObject({
          code: 'SERVER_ERROR',
          safeMessage: 'Malformed JSON response',
        });
        expect(String(err)).not.toContain('broken');
        expect(String(err)).not.toContain(serverKeyCanary);
      }

      fakeFetch.mockResolvedValueOnce(
        new Response(new Uint8Array([0xff, 0xfe, 0xfd]), { status: 200 }),
      );
      await expect(store.getRow('import-runs', 'row1')).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        safeMessage: 'Malformed JSON response',
      });
    });
  });

  describe('status and error mapping', () => {
    it('maps 404, 409 and 400 to typed codes', async () => {
      await expect(
        store.getRow('import-runs', 'missing'),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        safeMessage: 'Resource not found',
      });

      await store.createPrivateRow('import-runs', 'exists', { test: 1 });
      await expect(
        store.createPrivateRow('import-runs', 'exists', { test: 2 }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        safeMessage: 'Resource conflict',
      });
    });

    it('keeps a genuine 409 conflict distinct from a backend string', async () => {
      fakeFetch.mockResolvedValueOnce(
        errorResponse(400, 'Conflict: duplicate row'),
      );
      await expect(store.getRow('import-runs', 'row1')).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        safeMessage: 'Bad request to backend',
      });
    });

    it('maps 401 and 403 to UNAUTHORIZED without backend messages', async () => {
      for (const status of [401, 403]) {
        fakeFetch.mockResolvedValueOnce(
          errorResponse(status, 'nope secret text'),
        );
        await expect(store.getRow('import-runs', 'row1')).rejects.toMatchObject(
          {
            code: 'UNAUTHORIZED',
            safeMessage: 'Unauthorized',
          },
        );
      }
    });

    it('never leaks the server key from backend or network errors', async () => {
      fakeFetch.mockResolvedValueOnce(
        jsonResponse({ message: `Server error, key: ${serverKeyCanary}` }, 500),
      );
      try {
        await store.getRow('import-runs', 'test');
        expect.unreachable('expected backend error');
      } catch (err: unknown) {
        expect(err).toMatchObject({
          code: 'SERVER_ERROR',
          safeMessage: 'Backend error',
        });
        expect(String(err)).not.toContain(serverKeyCanary);
      }

      fakeFetch.mockRejectedValueOnce(
        new Error(`Network failed with ${serverKeyCanary}`),
      );
      try {
        await store.getRow('import-runs', 'test');
        expect.unreachable('expected network error');
      } catch (err: unknown) {
        expect(err).toMatchObject({
          code: 'SERVER_ERROR',
          safeMessage: 'Network error',
        });
        expect(String(err)).not.toContain(serverKeyCanary);
      }
    });
  });

  describe('lock ownership and export surface', () => {
    it('exports no delete or update methods at all', () => {
      expect(Object.keys(store).sort()).toEqual([
        'acquireLock',
        'createPrivateFile',
        'createPrivateRow',
        'downloadFile',
        'getFileMetadata',
        'getRow',
        'listRows',
        'publishFile',
        'publishRow',
        'releaseLock',
      ]);
    });

    it('works when methods are detached from the store object', async () => {
      const { acquireLock, releaseLock, getRow } = store;
      expect(await acquireLock('owner-detached')).toBe(true);
      const row = await getRow('import-runs', 'lock');
      expect(row.approvalReference).toBe('owner-detached');
      await releaseLock('owner-detached');
    });

    it('acquires with exactly the seven configured import-runs columns', async () => {
      expect(await store.acquireLock('owner1')).toBe(true);
      const [call] = calls();
      if (!call) expect.unreachable('no call recorded');
      expect(call.url.pathname).toBe(`${ROWS_PREFIX}/import-runs/rows`);
      const body = JSON.parse(String(call.body)) as {
        rowId: string;
        data: JSONObject;
        permissions: string[];
      };
      expect(body.rowId).toBe('lock');
      expect(Object.keys(body.data).sort()).toEqual([...LOCK_COLUMNS].sort());
      expect(body.data.approvalReference).toBe('owner1');
      expect(body.permissions).toEqual([]);

      const lockRow = await store.getRow('import-runs', 'lock');
      expect(lockRow.approvalReference).toBe('owner1');
      expect(lockRow.sourceId).toBe('lock');
      expect(lockRow.completenessStatus).toBe('lock');
      expect(lockRow.data).toBeUndefined();
    });

    it('reports contention as false and keeps the winner lock', async () => {
      expect(await store.acquireLock('owner1')).toBe(true);
      expect(await store.acquireLock('owner2')).toBe(false);
      const row = await store.getRow('import-runs', 'lock');
      expect(row.approvalReference).toBe('owner1');
    });

    it('refuses foreign release without deleting anything', async () => {
      expect(await store.acquireLock('owner1')).toBe(true);
      const callsBefore = fakeFetch.mock.calls.length;
      await expect(store.releaseLock('owner2')).rejects.toMatchObject({
        code: 'CONFLICT',
        safeMessage: 'Foreign lock refusal',
      });
      const deletes = calls().filter((c) => c.method === 'DELETE');
      expect(deletes).toEqual([]);
      expect(fakeFetch.mock.calls.length).toBe(callsBefore + 1);
      const row = await store.getRow('import-runs', 'lock');
      expect(row.approvalReference).toBe('owner1');
    });

    it('releases by deleting only the private lock row', async () => {
      expect(await store.acquireLock('owner1')).toBe(true);
      await store.releaseLock('owner1');
      const deletes = calls().filter((c) => c.method === 'DELETE');
      expect(deletes).toHaveLength(1);
      expect(deletes[0]?.url.pathname).toBe(
        `${ROWS_PREFIX}/import-runs/rows/lock`,
      );
    });

    it('tolerates only an explicit NOT_FOUND when releasing', async () => {
      await expect(store.releaseLock('owner1')).resolves.toBeUndefined();

      fakeFetch.mockResolvedValueOnce(errorResponse(500, 'boom'));
      await expect(store.releaseLock('owner1')).rejects.toMatchObject({
        code: 'SERVER_ERROR',
      });
    });

    it('ignores nested data wrappers and reads strict flat ownership', async () => {
      seedRow('import-runs', {
        $id: 'lock',
        $tableId: 'import-runs',
        $databaseId: 'intermed-datasets',
        data: { approvalReference: 'owner1' },
      });
      await expect(store.releaseLock('owner1')).rejects.toMatchObject({
        code: 'CONFLICT',
        safeMessage: 'Foreign lock refusal',
      });

      seedRow('import-runs', {
        ...flatRow('import-runs', 'lock', {}),
        approvalReference: 7,
      });
      await expect(store.releaseLock('owner1')).rejects.toMatchObject({
        code: 'CONFLICT',
        safeMessage: 'Foreign lock refusal',
      });
    });
  });

  describe('credential protection and redirect safety', () => {
    it('refuses to follow redirects and never forwards credentials to second origin', async () => {
      const fakeCredential = randomBytes(24).toString('hex');
      let targetRequests = 0;
      let fakeKeyForwarded = false;

      const trapServer = http.createServer((req, res) => {
        targetRequests += 1;
        if (req.headers['x-appwrite-key'] === fakeCredential) {
          fakeKeyForwarded = true;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
      });

      await new Promise<void>((resolve) => {
        trapServer.listen(0, '127.0.0.1', () => resolve());
      });
      const trapPort = (trapServer.address() as { port: number }).port;
      const targetUrl = `http://127.0.0.1:${trapPort}/trap`;

      const redirectServer = http.createServer((_req, res) => {
        res.writeHead(302, { location: targetUrl });
        res.end();
      });

      await new Promise<void>((resolve) => {
        redirectServer.listen(0, '127.0.0.1', () => resolve());
      });
      const redirectPort = (redirectServer.address() as { port: number }).port;

      try {
        const store = createAppwriteStore({
          endpoint: ENDPOINT,
          projectId: PROJECT_ID,
          serverKey: fakeCredential,
          fetch: ((url: string | URL | Request, options?: RequestInit) =>
            fetch(
              `http://127.0.0.1:${redirectPort}${new URL(url.toString()).pathname}${new URL(url.toString()).search}`,
              options,
            )) as unknown as typeof fetch,
        });

        await expect(
          store.getRow('import-runs', 'probe-row'),
        ).rejects.toMatchObject({
          code: 'SERVER_ERROR',
          safeMessage: 'Network error',
        });

        expect(targetRequests).toBe(0);
        expect(fakeKeyForwarded).toBe(false);
      } finally {
        if (typeof redirectServer.closeAllConnections === 'function') {
          redirectServer.closeAllConnections();
        }
        if (typeof trapServer.closeAllConnections === 'function') {
          trapServer.closeAllConnections();
        }
        await Promise.all([
          new Promise((resolve) => redirectServer.close(resolve)),
          new Promise((resolve) => trapServer.close(resolve)),
        ]);
      }
    });

    it('forces redirect: error on all outgoing requests', async () => {
      seedRow(
        'import-runs',
        flatRow('import-runs', 'row1', { sourceId: 's1' }),
      );
      await store.getRow('import-runs', 'row1');
      const [call] = calls();
      expect(call?.redirect).toBe('error');
    });
  });
});
