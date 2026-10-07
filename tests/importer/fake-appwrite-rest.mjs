/**
 * Stateful fake of the actual Appwrite REST surface for the import handler.
 *
 * Emulates real REST behaviour only: streaming `Response` bodies with
 * `Content-Length`, flat row/file objects with real `$metadata` fields
 * (including the real Storage `bucketId` context field), the TablesDB
 * `{ total, rows }` list envelope, Appwrite SDK query OBJECT strings and
 * Storage multipart form data. Project/key headers are verified on every call
 * and there is never a network or cloud access.
 */

export const FAKE_DATABASE_ID = 'intermed-datasets';

/**
 * Column schema mirroring `infra/appwrite/appwrite.config.development.json`;
 * a handler test asserts this stays byte-identical to the config as code.
 */
export const FAKE_TABLES = {
  'dataset-versions': [
    {
      key: 'dataset',
      type: 'varchar',
      size: 100,
      required: true,
      array: false,
    },
    {
      key: 'version',
      type: 'varchar',
      size: 100,
      required: true,
      array: false,
    },
    {
      key: 'sourceIds',
      type: 'varchar',
      size: 100,
      required: true,
      array: true,
    },
    {
      key: 'upstreamVersion',
      type: 'varchar',
      size: 200,
      required: false,
      array: false,
    },
    {
      key: 'upstreamPublishedAt',
      type: 'datetime',
      required: false,
      array: false,
    },
    { key: 'publishedAt', type: 'datetime', required: false, array: false },
    { key: 'importedAt', type: 'datetime', required: true, array: false },
    {
      key: 'checksum',
      type: 'varchar',
      size: 200,
      required: true,
      array: false,
    },
    {
      key: 'schemaVersion',
      type: 'varchar',
      size: 50,
      required: true,
      array: false,
    },
    {
      key: 'minimumClientVersion',
      type: 'varchar',
      size: 50,
      required: true,
      array: false,
    },
    { key: 'recordCounts', type: 'text', required: true, array: false },
    { key: 'coverage', type: 'text', required: true, array: false },
    {
      key: 'rightsApprovalReference',
      type: 'varchar',
      size: 500,
      required: true,
      array: false,
    },
    {
      key: 'clinicalReviewReference',
      type: 'varchar',
      size: 500,
      required: true,
      array: false,
    },
    {
      key: 'previousVersionId',
      type: 'varchar',
      size: 64,
      required: false,
      array: false,
    },
    {
      key: 'status',
      type: 'string',
      format: 'enum',
      elements: ['staging', 'validated', 'published', 'rejected', 'withdrawn'],
      required: true,
      array: false,
    },
  ],
  'dataset-bundles': [
    {
      key: 'datasetVersionId',
      type: 'varchar',
      size: 64,
      required: true,
      array: false,
    },
    { key: 'fileId', type: 'varchar', size: 64, required: true, array: false },
    {
      key: 'fileName',
      type: 'varchar',
      size: 255,
      required: true,
      array: false,
    },
    {
      key: 'contentType',
      type: 'varchar',
      size: 100,
      required: true,
      array: false,
    },
    { key: 'byteSize', type: 'bigint', required: true, min: 0, array: false },
    {
      key: 'checksum',
      type: 'varchar',
      size: 200,
      required: true,
      array: false,
    },
  ],
  'import-runs': [
    {
      key: 'sourceId',
      type: 'varchar',
      size: 100,
      required: true,
      array: false,
    },
    {
      key: 'snapshotVersion',
      type: 'varchar',
      size: 200,
      required: true,
      array: false,
    },
    {
      key: 'importerVersion',
      type: 'varchar',
      size: 50,
      required: true,
      array: false,
    },
    { key: 'startedAt', type: 'datetime', required: true, array: false },
    { key: 'completedAt', type: 'datetime', required: false, array: false },
    { key: 'counts', type: 'text', required: false, array: false },
    { key: 'validationFailures', type: 'text', required: false, array: false },
    { key: 'diffSummary', type: 'text', required: false, array: false },
    {
      key: 'completenessStatus',
      type: 'varchar',
      size: 50,
      required: true,
      array: false,
    },
    {
      key: 'approvalReference',
      type: 'varchar',
      size: 500,
      required: false,
      array: false,
    },
    {
      key: 'publicationStatus',
      type: 'varchar',
      size: 50,
      required: true,
      array: false,
    },
  ],
};

export const FAKE_BUCKETS = {
  'raw-sources': 536870912,
  quarantine: 536870912,
  'import-run-logs': 16777216,
  'published-datasets': 1073741824,
};

const MAX_ID_LENGTH = 36;
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9.\-_]*$/;
const TEXT_LIMIT = 65535;
const DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?([zZ]|[+-]\d{2}:\d{2})$/;
const QUERY_METHODS = new Set([
  'equal',
  'notEqual',
  'lessThan',
  'lessThanEqual',
  'greaterThan',
  'greaterThanEqual',
  'contains',
  'notContains',
  'between',
  'notBetween',
  'startsWith',
  'endsWith',
  'notStartsWith',
  'notEndsWith',
  'search',
  'notSearch',
  'regex',
  'orderAsc',
  'orderDesc',
  'isNull',
  'isNotNull',
  'limit',
  'offset',
  'cursorAfter',
  'cursorBefore',
  'select',
  'exists',
  'notExists',
  'orderRandom',
]);

export function utf8Bytes(text) {
  return new TextEncoder().encode(text);
}

export function bytesToText(bytes) {
  return new TextDecoder().decode(bytes);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function bytesResponse(status, bytes) {
  return new Response(new Uint8Array(bytes), { status });
}

function problem(status, type) {
  return jsonResponse(status, { message: `fake ${type}`, type, code: status });
}

function checkColumnValue(column, value, violations) {
  if (value === null || value === undefined) {
    if (column.required) {
      violations.push(`missing required column ${column.key}`);
    }
    return;
  }
  const single = (item) => {
    if (column.type === 'varchar') {
      if (typeof item !== 'string') {
        violations.push(`column ${column.key} must be a string`);
      } else if (column.size !== undefined && item.length > column.size) {
        violations.push(`column ${column.key} exceeds size ${column.size}`);
      }
      return;
    }
    if (column.type === 'text') {
      if (typeof item !== 'string') {
        violations.push(`column ${column.key} must be text`);
      } else if (item.length > TEXT_LIMIT) {
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
      const okNumber =
        typeof item === 'number' && Number.isInteger(item) && item >= 0;
      const okString = typeof item === 'string' && /^[0-9]{1,19}$/.test(item);
      if (!okNumber && !okString) {
        violations.push(`column ${column.key} must be a bigint value`);
      }
      return;
    }
    if (typeof item !== 'string') {
      violations.push(`column ${column.key} must be a string`);
    } else if (
      column.elements !== undefined &&
      !column.elements.some((element) => element === item)
    ) {
      violations.push(`column ${column.key} is outside the allowed set`);
    }
  };
  if (column.array) {
    if (!Array.isArray(value)) {
      violations.push(`column ${column.key} must be an array`);
      return;
    }
    for (const item of value) single(item);
    return;
  }
  if (Array.isArray(value)) {
    violations.push(`column ${column.key} must not be an array`);
    return;
  }
  single(value);
}

function validateRowData(tableId, data) {
  const columns = FAKE_TABLES[tableId] ?? [];
  if (!isPlainObject(data)) return null;
  const known = new Map(columns.map((column) => [column.key, column]));
  const violations = [];
  for (const key of Object.keys(data)) {
    const column = known.get(key);
    if (!column) {
      violations.push(`unknown column ${key}`);
      continue;
    }
    checkColumnValue(column, data[key], violations);
  }
  for (const column of columns) {
    if (column.required && !(column.key in data)) {
      violations.push(`missing required column ${column.key}`);
    }
  }
  return violations.length === 0 ? { ...data } : null;
}

/** Appwrite SDK `Query` object wire shape: `{ method, attribute, values }`. */
function parseQueries(searchParams) {
  const raw = [];
  for (const [key, value] of searchParams.entries()) {
    if (key === 'queries[]' || /^queries\[\d+\]$/.test(key)) raw.push(value);
  }
  return raw.map((entry) => {
    const parsed = JSON.parse(entry);
    if (!isPlainObject(parsed)) throw new Error('bad query');
    const keys = Object.keys(parsed);
    const allowed = ['method', 'attribute', 'values'];
    if (keys.some((key) => !allowed.includes(key)))
      throw new Error('bad query');
    const { method, attribute, values } = parsed;
    if (typeof method !== 'string' || !QUERY_METHODS.has(method)) {
      throw new Error('bad query');
    }
    const needsAttribute = [
      'equal',
      'notEqual',
      'lessThan',
      'lessThanEqual',
      'greaterThan',
      'greaterThanEqual',
      'contains',
      'notContains',
      'between',
      'notBetween',
      'startsWith',
      'endsWith',
      'notStartsWith',
      'notEndsWith',
      'search',
      'notSearch',
      'regex',
      'orderAsc',
      'orderDesc',
      'isNull',
      'isNotNull',
      'exists',
      'notExists',
    ];
    const bareAttribute = ['orderAsc', 'orderDesc', 'isNull', 'isNotNull'];
    const bareValues = ['limit', 'offset', 'cursorAfter', 'cursorBefore'];
    if (needsAttribute.includes(method)) {
      if (typeof attribute !== 'string' || attribute.length === 0) {
        throw new Error('bad query');
      }
    } else if (attribute !== undefined) {
      throw new Error('bad query');
    }
    if (bareAttribute.includes(method) && values !== undefined) {
      throw new Error('bad query');
    }
    if (bareValues.includes(method)) {
      if (!Array.isArray(values) || values.length !== 1) {
        throw new Error('bad query');
      }
    } else if (
      method !== 'orderRandom' &&
      !bareAttribute.includes(method) &&
      !Array.isArray(values)
    ) {
      throw new Error('bad query');
    }
    return { method, attribute, values };
  });
}

function applyQueries(rows, queries) {
  let output = rows.slice();
  for (const query of queries) {
    const attribute = query.attribute;
    const values = query.values ?? [];
    if (query.method === 'equal') {
      const [expected] = values;
      output = output.filter((row) => row[attribute] === expected);
    } else if (query.method === 'orderAsc') {
      output.sort((a, b) =>
        String(a[attribute] ?? '').localeCompare(String(b[attribute] ?? '')),
      );
    } else if (query.method === 'orderDesc') {
      output.sort((a, b) =>
        String(b[attribute] ?? '').localeCompare(String(a[attribute] ?? '')),
      );
    } else if (query.method === 'cursorAfter') {
      const [cursor] = values;
      const index = output.findIndex((row) => row.$id === cursor);
      output = index >= 0 ? output.slice(index + 1) : output;
    } else if (query.method === 'limit') {
      output = output.slice(0, Number(values[0]));
    } else {
      throw new Error('unsupported query method');
    }
  }
  return output;
}

export function createFakeAppwriteRest(options) {
  const projectId = options.projectId ?? 'intermed-dev';
  const endpoint = options.endpoint ?? 'https://fra.cloud.appwrite.io/v1';
  const calls = [];
  const faults = [];
  const rows = new Map(Object.keys(FAKE_TABLES).map((id) => [id, new Map()]));
  const files = new Map(Object.keys(FAKE_BUCKETS).map((id) => [id, new Map()]));
  let clock = 0;

  function nextInstant() {
    clock += 1;
    return new Date(Date.UTC(2026, 9, 7, 0, 0, clock)).toISOString();
  }

  function flatRow(tableId, rowId, values) {
    return {
      $id: rowId,
      $sequence: 1,
      $createdAt: nextInstant(),
      $updatedAt: nextInstant(),
      $permissions: Array.isArray(values.$permissions)
        ? values.$permissions
        : [],
      $databaseId: FAKE_DATABASE_ID,
      $tableId: tableId,
      ...Object.fromEntries(
        Object.entries(values).filter(([key]) => !key.startsWith('$')),
      ),
    };
  }

  function flatFile(bucketId, fileId, stored) {
    return {
      $id: fileId,
      $createdAt: nextInstant(),
      $updatedAt: nextInstant(),
      $permissions: [...stored.permissions],
      bucketId,
      name: stored.name,
      mimeType: 'application/octet-stream',
      sizeOriginal: stored.bytes.length,
      sizeActual: stored.bytes.length,
      chunksTotal: 1,
      chunksUploaded: 1,
    };
  }

  async function handle(url, init) {
    const method = String(init?.method ?? 'GET').toUpperCase();
    const parsed = new URL(String(url));
    void parsed;
    const headerNames = [];
    const requestHeaders = init?.headers;
    if (requestHeaders && typeof requestHeaders.keys === 'function') {
      for (const name of requestHeaders.keys()) {
        headerNames.push(name.toLowerCase());
      }
    }
    const call = {
      method,
      url: String(url),
      path: parsed.pathname,
      search: parsed.search,
      headerNames,
    };
    calls.push(call);

    for (const fault of faults) {
      if (fault.remaining <= 0 || !fault.match(call)) continue;
      fault.remaining -= 1;
      if (fault.applyBeforeThrow) await apply(call, init, parsed, true);
      if (fault.error) throw fault.error;
      return jsonResponse(fault.status ?? 500, {
        message: fault.message ?? 'fake general_unknown_error',
        type: 'general_unknown_error',
        code: fault.status ?? 500,
      });
    }
    return apply(call, init, parsed);
  }

  async function apply(call, init, parsed, skipFaults) {
    const method = call.method;
    void skipFaults;
    if (!call.url.startsWith(endpoint)) return problem(404, 'not_found');
    const headerValue = (wanted) => {
      const headers = init?.headers;
      if (!headers) return null;
      if (typeof headers.get === 'function') return headers.get(wanted);
      for (const [name, value] of Object.entries(headers)) {
        if (name.toLowerCase() === wanted.toLowerCase()) return value;
      }
      return null;
    };
    if (headerValue('x-appwrite-project') !== projectId) {
      return problem(401, 'general_unauthorized_scope');
    }
    if (headerValue('x-appwrite-key') !== options.serverKey) {
      return problem(401, 'general_unauthorized_scope');
    }

    const path = call.url.slice(endpoint.length).split('?')[0] ?? '';
    const tableRows = /^\/tablesdb\/([^/]+)\/tables\/([^/]+)\/rows$/;
    const tableRow = /^\/tablesdb\/([^/]+)\/tables\/([^/]+)\/rows\/([^/]+)$/;
    const bucketFiles = /^\/storage\/buckets\/([^/]+)\/files$/;
    const bucketFile = /^\/storage\/buckets\/([^/]+)\/files\/([^/]+)$/;
    const bucketDownload =
      /^\/storage\/buckets\/([^/]+)\/files\/([^/]+)\/download$/;

    const rowsMatch = tableRows.exec(path);
    if (rowsMatch && method === 'GET') {
      const tableId = rowsMatch[2];
      if (!FAKE_TABLES[tableId]) return problem(404, 'table_not_found');
      let queries;
      try {
        queries = parseQueries(parsed.searchParams);
      } catch {
        return problem(400, 'general_query_invalid');
      }
      const all = [...(rows.get(tableId)?.entries() ?? [])].map(
        ([rowId, values]) => flatRow(tableId, rowId, values),
      );
      let filtered;
      try {
        filtered = applyQueries(all, queries);
      } catch {
        return problem(400, 'general_query_invalid');
      }
      return jsonResponse(200, { total: filtered.length, rows: filtered });
    }
    if (rowsMatch && method === 'POST') {
      const tableId = rowsMatch[2];
      if (!FAKE_TABLES[tableId]) return problem(404, 'table_not_found');
      let body;
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
      const validated = validateRowData(tableId, body.data);
      if (validated === null) return problem(400, 'general_argument_invalid');
      const storage = rows.get(tableId);
      if (storage.has(rowId)) return problem(409, 'general_argument_conflict');
      const stored = {
        ...validated,
        $permissions: Array.isArray(body.permissions) ? body.permissions : [],
      };
      storage.set(rowId, stored);
      return jsonResponse(201, flatRow(tableId, rowId, stored));
    }
    const rowMatch = tableRow.exec(path);
    if (rowMatch && method === 'GET') {
      const stored = rows.get(rowMatch[2])?.get(rowMatch[3]);
      if (!stored) return problem(404, 'row_not_found');
      return jsonResponse(200, flatRow(rowMatch[2], rowMatch[3], stored));
    }
    if (rowMatch && method === 'DELETE') {
      const storage = rows.get(rowMatch[2]);
      if (!storage?.has(rowMatch[3])) return problem(404, 'row_not_found');
      storage.delete(rowMatch[3]);
      return new Response(null, { status: 204 });
    }

    const filesMatch = bucketFiles.exec(path);
    if (filesMatch && method === 'POST') {
      const bucketId = filesMatch[1];
      const storage = files.get(bucketId);
      if (!storage) return problem(404, 'bucket_not_found');
      const form = init?.body;
      if (!(form instanceof FormData)) {
        return problem(400, 'general_argument_invalid');
      }
      const fileId = form.get('fileId');
      const file = form.get('file');
      if (
        typeof fileId !== 'string' ||
        fileId.length === 0 ||
        fileId.length > MAX_ID_LENGTH ||
        !ID_PATTERN.test(fileId) ||
        !(file instanceof Blob)
      ) {
        return problem(400, 'general_argument_invalid');
      }
      return createFileResponse(bucketId, fileId, file, form, storage);
    }
    const fileMatch = bucketFile.exec(path) ?? bucketDownload.exec(path);
    if (fileMatch && method === 'GET') {
      const bucketId = fileMatch[1];
      const fileId = fileMatch[2];
      const stored = files.get(bucketId)?.get(fileId);
      if (!stored) return problem(404, 'file_not_found');
      if (bucketDownload.test(path)) {
        return bytesResponse(200, stored.bytes);
      }
      return jsonResponse(200, flatFile(bucketId, fileId, stored));
    }
    return problem(404, 'not_found');
  }

  async function createFileResponse(bucketId, fileId, file, form, storage) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const limit = FAKE_BUCKETS[bucketId] ?? 0;
    if (bytes.length > limit) return problem(400, 'storage_file_too_large');
    if (storage.has(fileId)) return problem(409, 'general_argument_conflict');
    const permissions = form
      .getAll('permissions[]')
      .filter((item) => typeof item === 'string');
    const stored = {
      name: file instanceof File ? file.name : 'unnamed',
      bytes,
      permissions,
    };
    storage.set(fileId, stored);
    return jsonResponse(201, flatFile(bucketId, fileId, stored));
  }

  return {
    fetch: (url, init) => handle(url, init),
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
        applyBeforeThrow: failOptions.applyBeforeThrow === true,
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
}
