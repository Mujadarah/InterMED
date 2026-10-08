/**
 * Disjoint M5 Appwrite I/O client — real REST, fake tests only.
 * Minimal Node22-compatible injected-fetch store, no Appwrite SDK.
 * Thin bridge: strict transport/input/output validation only, no semantic
 * projection of manifests or catalogue fields.
 */

/* global Headers, Buffer, URL, FormData, Blob, TextDecoder */

const MAX_ID_LENGTH = 36;
const MAX_SINGLE_BYTES = 5 * 1024 * 1024; // 5MiB hard ceiling per object
const MAX_QUERIES = 100;
const MAX_QUERY_LENGTH = 4096;
const MAX_OWNER_TOKEN_LENGTH = 500; // matches approvalReference varchar(500)
const MAX_FILE_NAME_LENGTH = 255;
const MAX_PERMISSIONS = 32;
const ALLOWED_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9.\-_]*$/;
const DECIMAL_LENGTH_PATTERN = /^[0-9]{1,15}$/;

/**
 * Official Appwrite SDK query wire shape (`appwrite/sdk-for-web`
 * `src/query.ts`): `Query` serialises as `{ method, attribute, values }` and
 * drops the members that stay undefined, so filters carry `attribute` plus
 * `values`, ordering and null checks carry only `attribute`, and `limit`,
 * offsets and cursors carry only `values`. Queries are JSON *objects* on the
 * wire — the invented `["equal","status",["published"]]` array protocol is not
 * a query at all (the real backend answers 400 general_query_invalid).
 *
 * This is a deliberately bounded policy over the flat query forms, not full
 * SDK validation: only `method`/`attribute`/`values` own keys exist, method
 * families below define which of them are required and their strict types, and
 * composite (`or`/`and`/`elemMatch`) plus distance/vector/geo methods are
 * refused. Queries arrive as JSON strings, so no foreign prototype can survive
 * parsing; the own-key allowlist additionally rejects `__proto__` payloads.
 */
const QUERY_FIELDS = ['method', 'attribute', 'values'];
/** Filters: non-empty `attribute` + non-empty scalar `values` list. */
const QUERY_METHODS_SCALAR_LIST = [
  'equal',
  'notEqual',
  'lessThan',
  'lessThanEqual',
  'greaterThan',
  'greaterThanEqual',
  'contains',
  'notContains',
];
/** Range filters: exactly two scalar `values`. */
const QUERY_METHODS_SCALAR_PAIR = ['between', 'notBetween'];
/** Text filters: exactly one string in `values`. */
const QUERY_METHODS_TEXT = [
  'startsWith',
  'endsWith',
  'notStartsWith',
  'notEndsWith',
  'search',
  'notSearch',
  'regex',
];
/** Ordering and null checks: `attribute` only, never `values`. */
const QUERY_METHODS_ATTRIBUTE_ONLY = [
  'orderAsc',
  'orderDesc',
  'isNull',
  'isNotNull',
];
/** Paging: exactly one safe integer `values` entry, never `attribute`. */
const QUERY_METHODS_INTEGER = ['limit', 'offset'];
/** Cursors: exactly one non-empty string document ID, never `attribute`. */
const QUERY_METHODS_CURSOR = ['cursorAfter', 'cursorBefore'];
/** Projection/existence: non-empty list of non-empty attribute strings. */
const QUERY_METHODS_ATTRIBUTE_LIST = ['select', 'exists', 'notExists'];
/** Bare method: neither `attribute` nor `values`. */
const QUERY_METHODS_BARE = ['orderRandom'];

const DATABASE_ID = 'intermed-datasets';
const LOCK_TABLE_ID = 'import-runs';
const LOCK_ROW_ID = 'lock';

const TRUSTED_ORIGIN = 'https://fra.cloud.appwrite.io';
const TRUSTED_PROTOCOL = 'https:';
const TRUSTED_PATH_PREFIX = '/v1';

const ALLOWED_TABLES_READ = [
  'import-runs',
  'dataset-versions',
  'dataset-bundles',
];
const ALLOWED_TABLES_PRIVATE_WRITE = ['import-runs'];
const ALLOWED_TABLES_PUBLISH = ['dataset-versions', 'dataset-bundles'];
const ALLOWED_BUCKETS_READ = [
  'raw-sources',
  'quarantine',
  'import-run-logs',
  'published-datasets',
];
const ALLOWED_BUCKETS_PRIVATE_WRITE = [
  'raw-sources',
  'quarantine',
  'import-run-logs',
];
const ALLOWED_BUCKETS_PUBLISH = ['published-datasets'];

class StoreError extends Error {
  constructor(code, message = '') {
    super(message || code);
    this.name = 'StoreError';
    this.code = code;
    this.safeMessage = message;
  }
}

/** Match a store failure by its class and stable code. */
function isStoreError(err, code) {
  return err instanceof StoreError && err.code === code;
}

/** Accept non-null objects except arrays for record validation. */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reject empty, oversized or unsafe physical Appwrite identifiers. */
function validateId(id) {
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    id.length > MAX_ID_LENGTH ||
    !ALLOWED_ID_PATTERN.test(id)
  ) {
    throw new StoreError('BAD_REQUEST', 'Invalid ID');
  }
}

/** Require a valid table identifier allowed for this operation. */
function validateTableId(id, allowed) {
  validateId(id);
  if (!allowed.includes(id)) {
    throw new StoreError('BAD_REQUEST', 'Invalid table ID');
  }
}

/** Require a valid bucket identifier allowed for this operation. */
function validateBucketId(id, allowed) {
  validateId(id);
  if (!allowed.includes(id)) {
    throw new StoreError('BAD_REQUEST', 'Invalid bucket ID');
  }
}

/** Reject blank or oversized publication-lock owner tokens. */
function validateOwnerToken(ownerToken) {
  if (
    typeof ownerToken !== 'string' ||
    ownerToken.trim().length === 0 ||
    ownerToken.length > MAX_OWNER_TOKEN_LENGTH
  ) {
    throw new StoreError('BAD_REQUEST', 'Invalid owner token');
  }
}

/** Reject empty, oversized or control-character-bearing upload names. */
function validateFileName(fileName) {
  if (
    typeof fileName !== 'string' ||
    fileName.length === 0 ||
    fileName.length > MAX_FILE_NAME_LENGTH
  ) {
    throw new StoreError('BAD_REQUEST', 'Invalid file name');
  }
  for (let i = 0; i < fileName.length; i += 1) {
    const code = fileName.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      throw new StoreError('BAD_REQUEST', 'Invalid file name');
    }
  }
}

/** Require a Blob within the configured single-upload byte limit. */
function validateUpload(fileBlob, limit) {
  if (!(fileBlob instanceof Blob)) {
    throw new StoreError('BAD_REQUEST', 'Invalid file');
  }
  if (!Number.isSafeInteger(fileBlob.size) || fileBlob.size < 0) {
    throw new StoreError('BAD_REQUEST', 'Invalid file');
  }
  if (fileBlob.size > limit) {
    throw new StoreError('BAD_REQUEST', 'Payload too large');
  }
}

/** Accept strings, booleans and finite numbers as query values. */
function isQueryScalar(value) {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

/** Check for an own query field without consulting its prototype. */
function hasQueryField(parsed, field) {
  return Object.prototype.hasOwnProperty.call(parsed, field);
}

/** Create a constant query error without including caller payloads. */
function invalidQuery() {
  return new StoreError('BAD_REQUEST', 'Invalid queries');
}

/** Require a nonempty string attribute or throw a constant query error. */
function requireQueryAttribute(parsed) {
  const attribute = parsed.attribute;
  if (typeof attribute !== 'string' || attribute.length === 0) {
    throw invalidQuery();
  }
}

/** Return a nonempty values array or throw a constant query error. */
function requireQueryValues(parsed) {
  const values = parsed.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw invalidQuery();
  }
  return values;
}

/** Reject a field forbidden by the selected query method. */
function requireNoQueryField(parsed, field) {
  if (hasQueryField(parsed, field)) {
    throw invalidQuery();
  }
}

/**
 * Bounded validation of one decoded SDK query object. Every failure is the
 * same constant `Invalid queries` error: offending payloads are never echoed.
 */
function validateQueryObject(parsed) {
  if (!isPlainObject(parsed)) throw invalidQuery();
  for (const key of Object.keys(parsed)) {
    if (!QUERY_FIELDS.includes(key)) throw invalidQuery();
  }
  const method = parsed.method;
  if (typeof method !== 'string' || method.length === 0) throw invalidQuery();

  if (QUERY_METHODS_SCALAR_LIST.includes(method)) {
    requireQueryAttribute(parsed);
    for (const value of requireQueryValues(parsed)) {
      if (!isQueryScalar(value)) throw invalidQuery();
    }
    return;
  }
  if (QUERY_METHODS_SCALAR_PAIR.includes(method)) {
    requireQueryAttribute(parsed);
    const values = requireQueryValues(parsed);
    if (values.length !== 2) throw invalidQuery();
    for (const value of values) {
      if (!isQueryScalar(value)) throw invalidQuery();
    }
    return;
  }
  if (QUERY_METHODS_TEXT.includes(method)) {
    requireQueryAttribute(parsed);
    const values = requireQueryValues(parsed);
    if (values.length !== 1 || typeof values[0] !== 'string') {
      throw invalidQuery();
    }
    return;
  }
  if (QUERY_METHODS_ATTRIBUTE_ONLY.includes(method)) {
    requireQueryAttribute(parsed);
    requireNoQueryField(parsed, 'values');
    return;
  }
  if (QUERY_METHODS_INTEGER.includes(method)) {
    requireNoQueryField(parsed, 'attribute');
    const values = requireQueryValues(parsed);
    const value = values[0];
    if (
      values.length !== 1 ||
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throw invalidQuery();
    }
    return;
  }
  if (QUERY_METHODS_CURSOR.includes(method)) {
    requireNoQueryField(parsed, 'attribute');
    const values = requireQueryValues(parsed);
    const value = values[0];
    if (
      values.length !== 1 ||
      typeof value !== 'string' ||
      value.length === 0
    ) {
      throw invalidQuery();
    }
    return;
  }
  if (QUERY_METHODS_ATTRIBUTE_LIST.includes(method)) {
    requireNoQueryField(parsed, 'attribute');
    for (const value of requireQueryValues(parsed)) {
      if (typeof value !== 'string' || value.length === 0) throw invalidQuery();
    }
    return;
  }
  if (QUERY_METHODS_BARE.includes(method)) {
    requireNoQueryField(parsed, 'attribute');
    requireNoQueryField(parsed, 'values');
    return;
  }
  // Unknown methods, including composite or/and/elemMatch and the
  // distance/vector/geo families, are refused by bounded policy.
  throw invalidQuery();
}

/** Validate bounded serialized queries while preserving their wire text. */
function validateQueries(queries) {
  if (!Array.isArray(queries) || queries.length > MAX_QUERIES) {
    throw new StoreError('BAD_REQUEST', 'Invalid queries');
  }
  return queries.map((query) => {
    if (
      typeof query !== 'string' ||
      query.length === 0 ||
      query.length > MAX_QUERY_LENGTH
    ) {
      throw new StoreError('BAD_REQUEST', 'Invalid queries');
    }
    let parsed;
    try {
      parsed = JSON.parse(query);
    } catch {
      throw new StoreError('BAD_REQUEST', 'Invalid queries');
    }
    validateQueryObject(parsed);
    return query;
  });
}

/** Serialize row data and permissions, rejecting reserved column names. */
function serializeRowPayload(rowId, data, permissions) {
  if (!isPlainObject(data)) {
    throw new StoreError('BAD_REQUEST', 'Invalid row data');
  }
  const keys = Object.keys(data);
  for (const key of keys) {
    if (key.length === 0 || key.charAt(0) === '$') {
      throw new StoreError('BAD_REQUEST', 'Invalid row data');
    }
  }
  try {
    return JSON.stringify({ rowId, data, permissions });
  } catch {
    throw new StoreError('BAD_REQUEST', 'Invalid row data');
  }
}

/** Validate the shape and size of optional response permissions. */
function verifyPermissions(record) {
  const permissions = record.$permissions;
  if (permissions === undefined) return;
  if (!Array.isArray(permissions) || permissions.length > MAX_PERMISSIONS) {
    throw new StoreError('SERVER_ERROR', 'Invalid response permissions');
  }
  for (const permission of permissions) {
    if (typeof permission !== 'string') {
      throw new StoreError('SERVER_ERROR', 'Invalid response permissions');
    }
  }
}

/** Reject present response context fields that disagree with the request. */
function verifyContext(record, tableId, bucketId) {
  if (tableId !== undefined) {
    if (record.$tableId !== undefined && record.$tableId !== tableId) {
      throw new StoreError('SERVER_ERROR', 'Response context mismatch');
    }
    if (
      record.$databaseId !== undefined &&
      record.$databaseId !== DATABASE_ID
    ) {
      throw new StoreError('SERVER_ERROR', 'Response context mismatch');
    }
  }
  if (bucketId !== undefined) {
    // Real Storage metadata names the bucket in `bucketId` (no `$`) — recorded
    // in after-file-raw-sources.json / preserved-file.json. The legacy
    // `$bucketId` key never appears in real responses, so it is never accepted
    // as the real field: when present it is verified as a non-conflicting extra
    // and can never mask a conflicting `bucketId`. Any present context value
    // must be a strict string match for the requested bucket; absent metadata
    // stays accepted (thin bridge).
    if (record.bucketId !== undefined && record.bucketId !== bucketId) {
      throw new StoreError('SERVER_ERROR', 'Response context mismatch');
    }
    if (record.$bucketId !== undefined && record.$bucketId !== bucketId) {
      throw new StoreError('SERVER_ERROR', 'Response context mismatch');
    }
  }
}

/** Return a row after checking its identity, context and permission shape. */
function verifyRowShape(row, requestedId, tableId) {
  if (!isPlainObject(row)) {
    throw new StoreError('SERVER_ERROR', 'Invalid response shape');
  }
  if (typeof row.$id !== 'string' || row.$id.length === 0) {
    throw new StoreError('SERVER_ERROR', 'Missing $id in response');
  }
  if (requestedId !== undefined && row.$id !== requestedId) {
    throw new StoreError('SERVER_ERROR', 'Response ID mismatch');
  }
  verifyContext(row, tableId, undefined);
  verifyPermissions(row);
  return row;
}

/** Validate a row-list envelope and every returned row before use. */
function verifyListShape(list, tableId) {
  if (!isPlainObject(list)) {
    throw new StoreError('SERVER_ERROR', 'Invalid list response shape');
  }
  const { total, rows } = list;
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new StoreError('SERVER_ERROR', 'Invalid list format');
  }
  if (!Array.isArray(rows)) {
    throw new StoreError('SERVER_ERROR', 'Invalid list format');
  }
  for (const row of rows) {
    verifyRowShape(row, undefined, tableId);
  }
  return list;
}

/** Return file metadata after checking identity, size and context. */
function verifyFileShape(file, requestedId, bucketId) {
  if (!isPlainObject(file)) {
    throw new StoreError('SERVER_ERROR', 'Invalid response shape');
  }
  if (typeof file.$id !== 'string' || file.$id.length === 0) {
    throw new StoreError('SERVER_ERROR', 'Missing $id in response');
  }
  if (requestedId !== undefined && file.$id !== requestedId) {
    throw new StoreError('SERVER_ERROR', 'Response ID mismatch');
  }
  const size = file.sizeOriginal;
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) {
    throw new StoreError('SERVER_ERROR', 'Invalid file size');
  }
  verifyContext(file, undefined, bucketId);
  verifyPermissions(file);
  return file;
}

/** Map HTTP failures to stable store errors without backend response text. */
function statusToError(status) {
  if (status === 404) return new StoreError('NOT_FOUND', 'Resource not found');
  if (status === 409) return new StoreError('CONFLICT', 'Resource conflict');
  if (status === 401 || status === 403) {
    return new StoreError('UNAUTHORIZED', 'Unauthorized');
  }
  if (status === 400) {
    return new StoreError('BAD_REQUEST', 'Bad request to backend');
  }
  return new StoreError('SERVER_ERROR', 'Backend error');
}

/** Attempt stream-reader cancellation without surfacing cleanup failures. */
async function cancelReader(reader) {
  try {
    await reader.cancel();
  } catch {
    // best effort: never surface stream internals
  }
}

/** Cancel an unread response body when supported, ignoring cleanup errors. */
async function cancelBody(body) {
  if (!body) return;
  try {
    if (typeof body.getReader === 'function') {
      await body.getReader().cancel();
    } else if (typeof body.cancel === 'function') {
      await body.cancel();
    }
  } catch {
    // best effort: never surface stream internals
  }
}

/** View binary stream chunks as bytes; return null for unsupported values. */
function chunkView(chunk) {
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
  if (ArrayBuffer.isView(chunk)) {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  return null;
}

/**
 * Bounded body read: refuses early on a strictly parsed Content-Length over the
 * budget and always enforces the budget on the bytes actually read, so a
 * missing, lying or hostile body can never force an unbounded allocation.
 */
async function readBoundedBody(response, limit) {
  const headers = response.headers;
  const declared =
    headers && typeof headers.get === 'function'
      ? headers.get('content-length')
      : null;
  if (
    typeof declared === 'string' &&
    DECIMAL_LENGTH_PATTERN.test(declared) &&
    Number(declared) > limit
  ) {
    await cancelBody(response.body);
    throw new StoreError('BAD_REQUEST', 'Response too large');
  }

  const body = response.body;
  if (body === null || body === undefined) return new Uint8Array(0);
  if (typeof body.getReader !== 'function') {
    throw new StoreError('SERVER_ERROR', 'Unsupported response body');
  }

  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const step = await reader.read();
      if (step.done) break;
      const view = chunkView(step.value);
      if (view === null) {
        throw new StoreError('SERVER_ERROR', 'Unsupported response chunk');
      }
      total += view.byteLength;
      if (total > limit) {
        throw new StoreError('BAD_REQUEST', 'Response too large');
      }
      chunks.push(view);
    }
  } catch (err) {
    await cancelReader(reader);
    if (err instanceof StoreError) throw err;
    throw new StoreError('SERVER_ERROR', 'Malformed response body');
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const view of chunks) {
    out.set(view, offset);
    offset += view.byteLength;
  }
  return out;
}

/**
 * Build a bounded REST store restricted to the trusted development endpoint and
 * project. `maxBytes` caps serialized row requests, uploaded file contents and
 * response bodies; it defaults to 5 MiB and must be an integer from 1 to 5 MiB.
 * Throws StoreError with BAD_REQUEST for invalid options. Returned operations
 * reject with StoreError for validation, transport and HTTP failures; only lock
 * acquisition conflicts and missing locks on release become fallback results.
 */
export function createAppwriteStore({
  fetch,
  endpoint,
  projectId,
  serverKey,
  maxBytes = MAX_SINGLE_BYTES,
}) {
  if (typeof fetch !== 'function') {
    throw new StoreError('BAD_REQUEST', 'Missing fetch');
  }
  if (endpoint !== 'https://fra.cloud.appwrite.io/v1') {
    throw new StoreError('BAD_REQUEST', 'Untrusted endpoint');
  }
  if (projectId !== 'intermed-dev') {
    throw new StoreError('BAD_REQUEST', 'Untrusted project');
  }
  if (!serverKey || typeof serverKey !== 'string') {
    throw new StoreError('BAD_REQUEST', 'Missing server key');
  }
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > MAX_SINGLE_BYTES
  ) {
    throw new StoreError('BAD_REQUEST', 'Invalid max bytes');
  }

  const databaseId = DATABASE_ID;

  /** Send an authenticated request and translate transport or HTTP failures. */
  async function request(path, options = {}) {
    if (
      typeof path !== 'string' ||
      !path.startsWith('/') ||
      path.startsWith('//')
    ) {
      throw new StoreError('BAD_REQUEST', 'Untrusted URL');
    }

    let targetUrl;
    try {
      targetUrl = new URL(`${endpoint}${path}`);
    } catch {
      throw new StoreError('BAD_REQUEST', 'Untrusted URL');
    }

    if (
      targetUrl.origin !== TRUSTED_ORIGIN ||
      targetUrl.protocol !== TRUSTED_PROTOCOL ||
      targetUrl.username !== '' ||
      targetUrl.password !== '' ||
      (targetUrl.pathname !== TRUSTED_PATH_PREFIX &&
        !targetUrl.pathname.startsWith(`${TRUSTED_PATH_PREFIX}/`))
    ) {
      throw new StoreError('BAD_REQUEST', 'Untrusted URL');
    }

    const headers = new Headers(options.headers || {});
    headers.set('X-Appwrite-Project', projectId);
    headers.set('X-Appwrite-Key', serverKey);

    let response;
    try {
      response = await fetch(targetUrl.toString(), {
        ...options,
        headers,
        redirect: 'error',
      });
    } catch {
      throw new StoreError('SERVER_ERROR', 'Network error');
    }

    if (!response.ok) {
      throw statusToError(response.status);
    }
    return response;
  }

  /** Read bounded response bytes and parse strict UTF-8 JSON. */
  async function requestJson(path, options = {}) {
    const response = await request(path, options);
    const bytes = await readBoundedBody(response, maxBytes);
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return JSON.parse(text);
    } catch {
      throw new StoreError('SERVER_ERROR', 'Malformed JSON response');
    }
  }

  /** Create an allowed private row with no resource permission grants. */
  async function createPrivateRow(tableId, rowId, data) {
    validateTableId(tableId, ALLOWED_TABLES_PRIVATE_WRITE);
    validateId(rowId);
    const bodyStr = serializeRowPayload(rowId, data, []);
    if (Buffer.byteLength(bodyStr, 'utf8') > maxBytes) {
      throw new StoreError('BAD_REQUEST', 'Payload too large');
    }
    const res = await requestJson(
      `/tablesdb/${databaseId}/tables/${tableId}/rows`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyStr,
      },
    );
    return verifyRowShape(res, rowId, tableId);
  }

  /** Create an immutable publication row with anonymous read permission. */
  async function publishRow(tableId, rowId, data) {
    validateTableId(tableId, ALLOWED_TABLES_PUBLISH);
    validateId(rowId);
    const bodyStr = serializeRowPayload(rowId, data, ['read("any")']);
    if (Buffer.byteLength(bodyStr, 'utf8') > maxBytes) {
      throw new StoreError('BAD_REQUEST', 'Payload too large');
    }
    const res = await requestJson(
      `/tablesdb/${databaseId}/tables/${tableId}/rows`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyStr,
      },
    );
    return verifyRowShape(res, rowId, tableId);
  }

  /** Read an allowed row and verify the returned identity and context. */
  async function getRow(tableId, rowId) {
    validateTableId(tableId, ALLOWED_TABLES_READ);
    validateId(rowId);
    const res = await requestJson(
      `/tablesdb/${databaseId}/tables/${tableId}/rows/${rowId}`,
    );
    return verifyRowShape(res, rowId, tableId);
  }

  /** List allowed rows using validated SDK-shaped queries and check the response. */
  async function listRows(tableId, queries = []) {
    validateTableId(tableId, ALLOWED_TABLES_READ);
    const checked = validateQueries(queries);
    const url = new URL(
      `${endpoint}/tablesdb/${databaseId}/tables/${tableId}/rows`,
    );
    checked.forEach((query) => url.searchParams.append('queries[]', query));

    const path = `/tablesdb/${databaseId}/tables/${tableId}/rows${url.search}`;
    const res = await requestJson(path);
    return verifyListShape(res, tableId);
  }

  /** Upload a bounded multipart file under the supplied bucket and permission policy. */
  async function uploadFile(bucketId, fileId, fileBlob, fileName, permissions) {
    validateBucketId(bucketId, permissions.allowedBuckets);
    validateId(fileId);
    validateFileName(fileName);
    validateUpload(fileBlob, maxBytes);

    const formData = new FormData();
    formData.append('fileId', fileId);
    formData.append('file', fileBlob, fileName);
    // Private uploads contribute no permissions entries at all; a public read
    // role is appended explicitly for published artefacts only.
    for (const permission of permissions.entries) {
      formData.append('permissions[]', permission);
    }

    const res = await requestJson(`/storage/buckets/${bucketId}/files`, {
      method: 'POST',
      body: formData,
    });
    return verifyFileShape(res, fileId, bucketId);
  }

  /** Create a file in a private bucket without resource permission grants. */
  async function createPrivateFile(bucketId, fileId, fileBlob, fileName) {
    return uploadFile(bucketId, fileId, fileBlob, fileName, {
      allowedBuckets: ALLOWED_BUCKETS_PRIVATE_WRITE,
      entries: [],
    });
  }

  /** Create a public-read bundle in the publication bucket. */
  async function publishFile(bucketId, fileId, fileBlob, fileName) {
    return uploadFile(bucketId, fileId, fileBlob, fileName, {
      allowedBuckets: ALLOWED_BUCKETS_PUBLISH,
      entries: ['read("any")'],
    });
  }

  /** Read file metadata and verify its identity, size and bucket context. */
  async function getFileMetadata(bucketId, fileId) {
    validateBucketId(bucketId, ALLOWED_BUCKETS_READ);
    validateId(fileId);
    const res = await requestJson(
      `/storage/buckets/${bucketId}/files/${fileId}`,
    );
    return verifyFileShape(res, fileId, bucketId);
  }

  /** Download an allowed file as a Blob while enforcing the response byte limit. */
  async function downloadFile(bucketId, fileId) {
    validateBucketId(bucketId, ALLOWED_BUCKETS_READ);
    validateId(fileId);
    const res = await request(
      `/storage/buckets/${bucketId}/files/${fileId}/download`,
    );
    const bytes = await readBoundedBody(res, maxBytes);
    return new Blob([bytes]);
  }

  /** Create the fixed private lock row; return false when it already exists. */
  async function acquireLock(ownerToken) {
    validateOwnerToken(ownerToken);
    try {
      await createPrivateRow(LOCK_TABLE_ID, LOCK_ROW_ID, {
        sourceId: LOCK_ROW_ID,
        snapshotVersion: LOCK_ROW_ID,
        importerVersion: LOCK_ROW_ID,
        startedAt: new Date().toISOString(),
        completenessStatus: LOCK_ROW_ID,
        publicationStatus: LOCK_ROW_ID,
        approvalReference: ownerToken,
      });
      return true;
    } catch (err) {
      if (isStoreError(err, 'CONFLICT')) return false;
      throw err;
    }
  }

  /** Delete an owned lock, tolerate absence and reject foreign ownership. */
  async function releaseLock(ownerToken) {
    validateOwnerToken(ownerToken);
    let lockRow;
    try {
      lockRow = await getRow(LOCK_TABLE_ID, LOCK_ROW_ID);
    } catch (err) {
      // Only an explicitly missing lock is acceptable on release.
      if (isStoreError(err, 'NOT_FOUND')) return;
      throw err;
    }
    // Flat row ownership only: no nested data wrapper, no TTL stealing and no
    // fictional compare-and-swap. A foreign or malformed lock is refused.
    const ref = lockRow.approvalReference;
    if (typeof ref !== 'string' || ref !== ownerToken) {
      throw new StoreError('CONFLICT', 'Foreign lock refusal');
    }
    try {
      await request(
        `/tablesdb/${databaseId}/tables/${LOCK_TABLE_ID}/rows/${LOCK_ROW_ID}`,
        { method: 'DELETE' },
      );
    } catch (err) {
      if (isStoreError(err, 'NOT_FOUND')) return;
      throw err;
    }
  }

  return {
    createPrivateRow,
    publishRow,
    getRow,
    listRows,
    createPrivateFile,
    publishFile,
    getFileMetadata,
    downloadFile,
    acquireLock,
    releaseLock,
  };
}
