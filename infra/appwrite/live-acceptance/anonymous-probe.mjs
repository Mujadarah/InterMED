const DEV_PROJECT = 'intermed-dev';
const DEV_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';

function assertDevelopmentProject(projectId, endpoint) {
  if (projectId !== DEV_PROJECT || endpoint.replace(/\/+$/, '') !== DEV_ENDPOINT)
    throw new Error('live acceptance is restricted to the fixed intermed-dev project');
}

function url(endpoint, path) {
  return `${endpoint.replace(/\/+$/, '')}${path}`;
}

function safeBody(text) {
  return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}

function responseHeader(response, name) {
  if (typeof response.headers?.get === 'function')
    return response.headers.get(name) ?? '';
  return response.headers?.[name] ?? '';
}

async function request(fetchLike, target, options = {}) {
  const { projectId: _projectId, ...fetchOptions } = options;
  try {
    const response = await fetchLike(target, {
      ...fetchOptions,
      headers: {
        'X-Appwrite-Project': _projectId,
        ...(fetchOptions.body && !(fetchOptions.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
    });
    const body = safeBody(await response.text());
    return {
      status: response.status,
      body,
      contentType: responseHeader(response, 'content-type'),
      errorType: response.status >= 400 ? 'http-error' : null,
    };
  } catch (error) {
    return {
      status: 0,
      body: error instanceof Error ? error.message : 'transport-error',
      contentType: '',
      errorType: 'transport-error',
    };
  }
}

function rowPayload(tableId) {
  if (tableId === 'dataset-versions')
    return {
      dataset: 'anonymous-guard',
      version: 'guard-0',
      sourceIds: ['guard-source'],
      importedAt: '2026-10-07T09:00:00.000Z',
      checksum: 'sha256:guard',
      schemaVersion: 'medication-catalogue-1',
      minimumClientVersion: '0.0.0',
      recordCounts: '{}',
      coverage: 'Synthetic disposable guard only.',
      rightsApprovalReference: 'guard',
      clinicalReviewReference: 'guard',
      status: 'staging',
    };
  if (tableId === 'dataset-bundles')
    return {
      datasetVersionId: 'guard-version',
      fileId: 'guard-published',
      fileName: 'guard.json',
      contentType: 'application/json',
      byteSize: 2,
      checksum: 'sha256:guard',
    };
  return {
    sourceId: 'guard-source',
    snapshotVersion: 'guard-0',
    importerVersion: 'guard',
    startedAt: '2026-10-07T09:00:00.000Z',
    completenessStatus: 'guard',
    publicationStatus: 'staging',
  };
}

function fileFormData(fileId) {
  const form = new FormData();
  form.append('fileId', fileId);
  form.append('file', new Blob(['synthetic guard'], { type: 'text/plain' }), 'guard.txt');
  return form;
}

export async function runAnonymousProbe(options) {
  const {
    endpoint,
    projectId,
    databaseId = 'intermed-datasets',
    guard,
    fetchLike = globalThis.fetch,
  } = options;
  assertDevelopmentProject(projectId, endpoint);
  if (typeof fetchLike !== 'function') throw new Error('fetchLike is required');
  const checks = [];
  const check = async (name, target, expected, requestOptions = {}) => {
    const observed = await request(fetchLike, target, { ...requestOptions, projectId });
    checks.push({ name, expected, observed, pass: expected.includes(observed.status) });
  };
  const rowPath = (tableId, rowId = '') =>
    `/tablesdb/${databaseId}/tables/${tableId}/rows${rowId ? `/${rowId}` : ''}`;
  const filePath = (bucketId, fileId = '', suffix = '') =>
    `/storage/buckets/${bucketId}/files${fileId ? `/${fileId}` : ''}${suffix}`;
  const publicTables = new Set(['dataset-versions', 'dataset-bundles']);

  for (const row of guard.rows) {
    const isPublic = publicTables.has(row.tableId);
    await check(
      `${isPublic ? 'public' : 'private'}-list-${row.tableId}`,
      url(endpoint, rowPath(row.tableId)),
      isPublic ? [200, 204] : [401, 403],
    );
    await check(
      `${isPublic ? 'public' : 'private'}-get-${row.tableId}`,
      url(endpoint, rowPath(row.tableId, row.rowId)),
      isPublic ? [200, 204] : [401, 403],
    );
    await check(
      `row-POST-${row.tableId}`,
      url(endpoint, rowPath(row.tableId)),
      [401, 403],
      { method: 'POST', body: JSON.stringify(rowPayload(row.tableId)) },
    );
    await check(
      `row-PATCH-${row.tableId}`,
      url(endpoint, rowPath(row.tableId, row.rowId)),
      [401, 403],
      { method: 'PATCH', body: JSON.stringify(rowPayload(row.tableId)) },
    );
    await check(
      `row-DELETE-${row.tableId}`,
      url(endpoint, rowPath(row.tableId, row.rowId)),
      [401, 403],
      { method: 'DELETE' },
    );
  }

  for (const file of guard.files) {
    const isPublic = file.bucketId === 'published-datasets';
    const expectedRead = isPublic ? [200, 204] : [401, 403];
    await check(
      `${isPublic ? 'public' : 'private'}-list-${file.bucketId}`,
      url(endpoint, filePath(file.bucketId)),
      expectedRead,
    );
    await check(
      `${isPublic ? 'public' : 'private'}-get-${file.bucketId}`,
      url(endpoint, filePath(file.bucketId, file.fileId)),
      expectedRead,
    );
    await check(
      isPublic ? 'public-download-published-datasets' : `private-download-${file.bucketId}`,
      url(endpoint, filePath(file.bucketId, file.fileId, '/download')),
      expectedRead,
    );
    await check(
      `file-POST-${file.bucketId}`,
      url(endpoint, filePath(file.bucketId)),
      [401, 403],
      { method: 'POST', body: fileFormData(file.fileId) },
    );
    await check(
      `file-PATCH-${file.bucketId}`,
      url(endpoint, filePath(file.bucketId, file.fileId)),
      [401, 403],
      { method: 'PATCH', body: JSON.stringify({ name: 'guard.txt' }) },
    );
    await check(
      `file-DELETE-${file.bucketId}`,
      url(endpoint, filePath(file.bucketId, file.fileId)),
      [401, 403],
      { method: 'DELETE' },
    );
  }
  return {
    projectId,
    checks,
    failed: checks.filter((item) => !item.pass).length,
    log: JSON.stringify({ projectId, checks }, null, 2),
  };
}
