/**
 * Stateful fake of the Appwrite REST surface used by the import handler bridge.
 *
 * It emulates the actual vendor surface only: flat row/file objects with
 * `$metadata` fields, the TablesDB `{ total, rows[] }` list envelope (never the
 * legacy documents vocabulary), JSON query strings, Storage multipart form
 * data and project/key request headers. It performs no network access.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface FakeCall {
  readonly method: string;
  readonly url: string;
  readonly path: string;
  readonly headerNames: readonly string[];
}

export interface FakeRequestInit {
  readonly method?: string;
  readonly headers?: unknown;
  readonly body?: unknown;
}

export interface FakeResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  blob(): Promise<Blob>;
}

interface FakeResponseInit {
  readonly status: number;
  readonly jsonBody?: unknown;
  readonly bytes?: Uint8Array;
}

export interface FakeStoredFile {
  name: string;
  bytes: Uint8Array;
  permissions: readonly string[];
}

export interface FakeFault {
  match: (call: FakeCall) => boolean;
  status?: number | undefined;
  error?: Error | undefined;
  message?: string | undefined;
  remaining: number;
}

interface FakeColumn {
  readonly key: string;
  readonly type: string;
  readonly size?: number;
  readonly required: boolean;
  readonly array: boolean;
  readonly elements?: readonly string[];
}

interface FakeTable {
  readonly $id: string;
  readonly columns: readonly FakeColumn[];
}

interface FakeConfigShape {
  readonly projectId: string;
  readonly tables: readonly { $id: string; columns: readonly unknown[] }[];
}

export interface FakeAppwriteRest {
  readonly fetch: (
    url: string,
    init?: FakeRequestInit,
  ) => Promise<FakeResponse>;
  readonly calls: FakeCall[];
  readonly faults: FakeFault[];
  readonly rows: Map<string, Map<string, Record<string, unknown>>>;
  readonly files: Map<string, Map<string, FakeStoredFile>>;
  failWhen(
    match: (call: FakeCall) => boolean,
    options: {
      status?: number;
      error?: Error;
      message?: string;
      times?: number;
    },
  ): void;
  rowIds(tableId: string): string[];
  fileIds(bucketId: string): string[];
  fileNamed(bucketId: string, name: string): FakeStoredFile | undefined;
}

const MAX_ID_LENGTH = 36;
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9.\-_]*$/;
const TEXT_LIMIT = 65535;
const BUCKET_LIMITS: Readonly<Record<string, number>> = {
  'raw-sources': 536870912,
  quarantine: 536870912,
  'import-run-logs': 16777216,
  'published-datasets': 1073741824,
};
const KNOWN_BUCKETS = Object.keys(BUCKET_LIMITS);
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function loadTables(): Map<string, FakeTable> {
  const configPath = join(
    process.cwd(),
    'infra',
    'appwrite',
    'appwrite.config.development.json',
  );
  const parsed = JSON.parse(
    readFileSync(configPath, 'utf8'),
  ) as unknown as FakeConfigShape;
  const tables = new Map<string, FakeTable>();
  for (const table of parsed.tables) {
    tables.set(table.$id, {
      $id: table.$id,
      columns: table.columns as unknown as FakeColumn[],
    });
  }
  return tables;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function headerNames(init: FakeRequestInit | undefined): string[] {
  const headers = init?.headers;
  if (!headers) return [];
  if (typeof (headers as { keys?: unknown }).keys === 'function') {
    const names: string[] = [];
    for (const name of (
      headers as { keys: () => IterableIterator<string> }
    ).keys()) {
      names.push(name.toLowerCase());
    }
    return names;
  }
  return Object.keys(headers as Record<string, unknown>).map((name) =>
    name.toLowerCase(),
  );
}

function headerValue(
  init: FakeRequestInit | undefined,
  wanted: string,
): string | null {
  const headers = init?.headers;
  if (!headers) return null;
  const get = (headers as { get?: (name: string) => unknown }).get;
  if (typeof get === 'function') {
    const value = get.call(headers, wanted);
    return typeof value === 'string' ? value : null;
  }
  const record = headers as Record<string, unknown>;
  for (const [name, value] of Object.entries(record)) {
    if (name.toLowerCase() === wanted.toLowerCase()) {
      return typeof value === 'string' ? value : null;
    }
  }
  return null;
}

function checkColumnValue(
  column: FakeColumn,
  value: unknown,
  violations: string[],
): void {
  if (value === null || value === undefined) {
    if (column.required)
      violations.push(`missing required column ${column.key}`);
    return;
  }
  const checkSingle = (item: unknown): void => {
    if (column.type === 'varchar') {
      if (typeof item !== 'string') {
        violations.push(`column ${column.key} must be a string`);
        return;
      }
      if (column.size !== undefined && item.length > column.size) {
        violations.push(`column ${column.key} exceeds size ${column.size}`);
      }
      return;
    }
    if (column.type === 'text') {
      if (typeof item !== 'string') {
        violations.push(`column ${column.key} must be a text string`);
        return;
      }
      if (item.length > TEXT_LIMIT) {
        violations.push(`column ${column.key} exceeds text size`);
      }
      return;
    }
    if (column.type === 'datetime') {
      if (
        typeof item !== 'string' ||
        !DATETIME_PATTERN.test(item) ||
        Number.isNaN(Date.parse(item))
      ) {
        violations.push(`column ${column.key} must be a valid datetime`);
      }
      return;
    }
    if (column.type === 'bigint') {
      const validNumber =
        typeof item === 'number' && Number.isInteger(item) && item >= 0;
      const validString =
        typeof item === 'string' && /^[0-9]{1,19}$/.test(item);
      if (!validNumber && !validString) {
        violations.push(`column ${column.key} must be a bigint value`);
      }
      return;
    }
    if (column.type === 'string' || column.type === 'enum') {
      if (typeof item !== 'string') {
        violations.push(`column ${column.key} must be a string`);
        return;
      }
      if (
        column.elements !== undefined &&
        !column.elements.some((element) => element === item)
      ) {
        violations.push(`column ${column.key} is outside the allowed set`);
      }
      return;
    }
    violations.push(`column ${column.key} has an unknown type`);
  };
  if (column.array) {
    if (!Array.isArray(value)) {
      violations.push(`column ${column.key} must be an array`);
      return;
    }
    for (const item of value) checkSingle(item);
    return;
  }
  if (Array.isArray(value)) {
    violations.push(`column ${column.key} must not be an array`);
    return;
  }
  checkSingle(value);
}

function validateRowData(
  table: FakeTable,
  data: unknown,
): { ok: true; values: Record<string, unknown> } | { ok: false } {
  if (!isPlainObject(data)) return { ok: false };
  const known = new Map(table.columns.map((column) => [column.key, column]));
  const violations: string[] = [];
  for (const key of Object.keys(data)) {
    const column = known.get(key);
    if (!column) {
      violations.push(`unknown column ${key}`);
      continue;
    }
    checkColumnValue(column, data[key], violations);
  }
  for (const column of table.columns) {
    if (column.required && !(column.key in data)) {
      violations.push(`missing required column ${column.key}`);
    }
  }
  if (violations.length > 0) return { ok: false };
  return { ok: true, values: { ...data } };
}

interface ParsedQuery {
  method: string;
  column: string;
  values: readonly unknown[];
}

function parseQueries(searchParams: URLSearchParams): ParsedQuery[] {
  const raw: string[] = [];
  for (const [key, value] of searchParams.entries()) {
    if (key === 'queries[]' || /^queries\[\d+\]$/.test(key)) raw.push(value);
  }
  return raw.map((entry) => {
    const parsed: unknown = JSON.parse(entry);
    if (!isPlainObject(parsed)) throw new Error('bad query');
    const method = parsed.method;
    const column = parsed.column ?? parsed.attribute;
    const values = parsed.values;
    return {
      method: typeof method === 'string' ? method : '',
      column: typeof column === 'string' ? column : '',
      values: Array.isArray(values) ? values : [],
    };
  });
}

function applyQueries(
  rows: Record<string, unknown>[],
  queries: readonly ParsedQuery[],
): Record<string, unknown>[] {
  let output = rows.slice();
  for (const query of queries) {
    if (query.method === 'equal') {
      const [expected] = query.values;
      output = output.filter((row) => row[query.column] === expected);
    } else if (query.method === 'orderAsc') {
      output.sort((a, b) =>
        String(a[query.column] ?? '').localeCompare(
          String(b[query.column] ?? ''),
        ),
      );
    } else if (query.method === 'orderDesc') {
      output.sort((a, b) =>
        String(b[query.column] ?? '').localeCompare(
          String(a[query.column] ?? ''),
        ),
      );
    } else if (query.method === 'cursorAfter') {
      const [cursor] = query.values;
      const index = output.findIndex((row) => row.$id === cursor);
      output = index >= 0 ? output.slice(index + 1) : output;
    } else if (query.method === 'limit') {
      const [limit] = query.values;
      output = output.slice(0, Number(limit));
    } else {
      throw new Error('unsupported query method');
    }
  }
  return output;
}

function makeResponse(init: FakeResponseInit): FakeResponse {
  const { status, jsonBody, bytes } = init;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => jsonBody,
    blob: async () => new Blob([new Uint8Array(bytes ?? [])]),
  };
}

export function createFakeAppwriteRest(options: {
  serverKey: string;
  projectId?: string;
  endpoint?: string;
}): FakeAppwriteRest {
  const projectId = options.projectId ?? 'intermed-dev';
  const endpoint = options.endpoint ?? 'https://fra.cloud.appwrite.io/v1';
  const tables = loadTables();
  const calls: FakeCall[] = [];
  const faults: FakeFault[] = [];
  const rows = new Map<string, Map<string, Record<string, unknown>>>();
  const files = new Map<string, Map<string, FakeStoredFile>>();
  for (const tableId of tables.keys()) rows.set(tableId, new Map());
  for (const bucketId of KNOWN_BUCKETS) files.set(bucketId, new Map());
  let clock = 0;

  function nextInstant(): string {
    clock += 1;
    return new Date(Date.UTC(2026, 9, 7, 0, 0, clock)).toISOString();
  }

  function problem(status: number, type: string): FakeResponse {
    return makeResponse({
      status,
      jsonBody: { message: `fake ${type}`, type, code: status },
    });
  }

  function flatRow(
    tableId: string,
    rowId: string,
    values: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      $id: rowId,
      $createdAt: nextInstant(),
      $updatedAt: nextInstant(),
      $permissions: [],
      $tableId: tableId,
      $databaseId: 'intermed-datasets',
      ...values,
    };
  }

  function flatFile(
    bucketId: string,
    fileId: string,
    stored: FakeStoredFile,
  ): Record<string, unknown> {
    return {
      $id: fileId,
      $createdAt: nextInstant(),
      $updatedAt: nextInstant(),
      $permissions: [...stored.permissions],
      $bucketId: bucketId,
      name: stored.name,
      mimeType: 'application/octet-stream',
      sizeOriginal: stored.bytes.length,
      sizeActual: stored.bytes.length,
      chunksTotal: 1,
      chunksUploaded: 1,
    };
  }

  async function handle(
    url: string,
    init?: FakeRequestInit,
  ): Promise<FakeResponse> {
    const method = (init?.method ?? 'GET').toUpperCase();
    const parsed = new URL(url);
    const call: FakeCall = {
      method,
      url,
      path: parsed.pathname,
      headerNames: headerNames(init),
    };
    calls.push(call);

    for (const fault of faults) {
      if (fault.remaining <= 0 || !fault.match(call)) continue;
      fault.remaining -= 1;
      if (fault.error) throw fault.error;
      return makeResponse({
        status: fault.status ?? 500,
        jsonBody: {
          message: fault.message ?? 'fake general_unknown_error',
          type: 'general_unknown_error',
          code: fault.status ?? 500,
        },
      });
    }

    if (!url.startsWith(endpoint)) return problem(404, 'not_found');
    if (headerValue(init, 'x-appwrite-project') !== projectId) {
      return problem(401, 'general_unauthorized_scope');
    }
    if (headerValue(init, 'x-appwrite-key') !== options.serverKey) {
      return problem(401, 'general_unauthorized_scope');
    }

    const path = url.slice(endpoint.length).split('?')[0] ?? '';
    const tableRows = /^\/tablesdb\/([^/]+)\/tables\/([^/]+)\/rows$/;
    const tableRow = /^\/tablesdb\/([^/]+)\/tables\/([^/]+)\/rows\/([^/]+)$/;
    const bucketFiles = /^\/storage\/buckets\/([^/]+)\/files$/;
    const bucketFile = /^\/storage\/buckets\/([^/]+)\/files\/([^/]+)$/;
    const bucketDownload =
      /^\/storage\/buckets\/([^/]+)\/files\/([^/]+)\/download$/;

    const rowsMatch = tableRows.exec(path);
    if (rowsMatch && method === 'GET') {
      const tableId = rowsMatch[2] ?? '';
      const table = tables.get(tableId);
      if (!table) return problem(404, 'table_not_found');
      let queries: ParsedQuery[] = [];
      try {
        queries = parseQueries(parsed.searchParams);
      } catch {
        return problem(400, 'general_argument_invalid');
      }
      const all = [...(rows.get(tableId)?.values() ?? [])];
      const filtered = applyQueries(all, queries);
      return makeResponse({
        status: 200,
        jsonBody: { total: filtered.length, rows: filtered },
      });
    }
    if (rowsMatch && method === 'POST') {
      const tableId = rowsMatch[2] ?? '';
      const table = tables.get(tableId);
      if (!table) return problem(404, 'table_not_found');
      let body: unknown;
      try {
        body = JSON.parse(String(init?.body ?? ''));
      } catch {
        return problem(400, 'general_argument_invalid');
      }
      if (!isPlainObject(body)) return problem(400, 'general_argument_invalid');
      const rowId = body.rowId;
      if (
        typeof rowId !== 'string' ||
        rowId.length === 0 ||
        rowId.length > MAX_ID_LENGTH ||
        !ID_PATTERN.test(rowId)
      ) {
        return problem(400, 'general_argument_invalid');
      }
      const validated = validateRowData(table, body.data);
      if (!validated.ok) return problem(400, 'general_argument_invalid');
      const storage = rows.get(tableId);
      if (!storage) return problem(404, 'table_not_found');
      if (storage.has(rowId)) return problem(409, 'general_argument_conflict');
      const stored: Record<string, unknown> = {
        ...validated.values,
        $permissions: Array.isArray(body.permissions) ? body.permissions : [],
      };
      storage.set(rowId, stored);
      return makeResponse({
        status: 201,
        jsonBody: flatRow(tableId, rowId, stored),
      });
    }
    const rowMatch = tableRow.exec(path);
    if (rowMatch && method === 'GET') {
      const tableId = rowMatch[2] ?? '';
      const rowId = rowMatch[3] ?? '';
      const stored = rows.get(tableId)?.get(rowId);
      if (!stored) return problem(404, 'row_not_found');
      return makeResponse({
        status: 200,
        jsonBody: flatRow(tableId, rowId, stored),
      });
    }
    if (rowMatch && method === 'DELETE') {
      const tableId = rowMatch[2] ?? '';
      const rowId = rowMatch[3] ?? '';
      const storage = rows.get(tableId);
      if (!storage?.has(rowId)) return problem(404, 'row_not_found');
      storage.delete(rowId);
      return makeResponse({ status: 204 });
    }

    const filesMatch = bucketFiles.exec(path);
    if (filesMatch && method === 'POST') {
      const bucketId = filesMatch[1] ?? '';
      const storage = files.get(bucketId);
      if (!storage) return problem(404, 'bucket_not_found');
      const form = init?.body;
      if (!(form instanceof FormData)) {
        return problem(400, 'general_argument_invalid');
      }
      const fileId = form.get('fileId');
      const file = form.get('file');
      if (typeof fileId !== 'string' || !ID_PATTERN.test(fileId)) {
        return problem(400, 'general_argument_invalid');
      }
      if (fileId.length > MAX_ID_LENGTH || !(file instanceof Blob)) {
        return problem(400, 'general_argument_invalid');
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const limit = BUCKET_LIMITS[bucketId] ?? 0;
      if (bytes.length > limit) return problem(400, 'storage_file_too_large');
      if (storage.has(fileId)) return problem(409, 'general_argument_conflict');
      const permissions = form
        .getAll('permissions[]')
        .filter((item): item is string => typeof item === 'string');
      const stored: FakeStoredFile = {
        name: file instanceof File ? file.name : 'unnamed',
        bytes,
        permissions,
      };
      storage.set(fileId, stored);
      return makeResponse({
        status: 201,
        jsonBody: flatFile(bucketId, fileId, stored),
      });
    }
    const fileMatch = bucketFile.exec(path) ?? bucketDownload.exec(path);
    if (fileMatch && (method === 'GET' || method === 'HEAD')) {
      const bucketId = fileMatch[1] ?? '';
      const fileId = fileMatch[2] ?? '';
      const stored = files.get(bucketId)?.get(fileId);
      if (!stored) return problem(404, 'file_not_found');
      if (bucketDownload.test(path)) {
        return makeResponse({ status: 200, bytes: stored.bytes });
      }
      return makeResponse({
        status: 200,
        jsonBody: flatFile(bucketId, fileId, stored),
      });
    }
    return problem(404, 'not_found');
  }

  const rest: FakeAppwriteRest = {
    fetch: (url, init) => handle(String(url), init),
    calls,
    faults,
    rows,
    files,
    failWhen(match, failOptions) {
      faults.push({
        match,
        status: failOptions.status,
        error: failOptions.error,
        message: failOptions.message,
        remaining: failOptions.times ?? Number.POSITIVE_INFINITY,
      });
    },
    rowIds(tableId) {
      return [...(rows.get(tableId)?.keys() ?? [])].sort();
    },
    fileIds(bucketId) {
      return [...(files.get(bucketId)?.keys() ?? [])].sort();
    },
    fileNamed(bucketId, name) {
      for (const stored of files.get(bucketId)?.values() ?? []) {
        if (stored.name === name) return stored;
      }
      return undefined;
    },
  };
  return rest;
}

export function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
