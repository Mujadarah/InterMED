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
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

async function request(fetchLike, target, options = {}) {
  try {
    const response = await fetchLike(target, {
      ...options,
      headers: {
        'X-Appwrite-Project': options.projectId,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    const body = safeBody(await response.text());
    return { status: response.status, body, contentType: response.headers?.['content-type'] ?? '' };
  } catch (error) {
    return { status: 0, body: error instanceof Error ? error.message : 'transport-error', contentType: '' };
  }
}

export async function runAnonymousProbe(options) {
  const { endpoint, projectId, databaseId, guard, fetchLike } = options;
  assertDevelopmentProject(projectId, endpoint);
  const checks = [];
  const check = async (name, target, expected, requestOptions = {}) => {
    const observed = await request(fetchLike, target, { ...requestOptions, projectId });
    const pass = expected.includes(observed.status);
    checks.push({ name, expected, observed, pass });
  };
  const rowPath = (tableId, rowId = '') =>
    `/tablesdb/${databaseId}/tables/${tableId}/rows${rowId ? `/${rowId}` : ''}`;
  const filePath = (bucketId, fileId = '', suffix = '') =>
    `/storage/buckets/${bucketId}/files${fileId ? `/${fileId}` : ''}${suffix}`;
  const publicTables = new Set(['dataset-versions', 'dataset-bundles']);
  const publicFile = guard.files.find((file) => file.bucketId === 'published-datasets');
  for (const tableId of publicTables) {
    await check(`public-list-${tableId}`, url(endpoint, rowPath(tableId)), [200, 204]);
    await check(
      `public-get-${tableId}`,
      url(endpoint, rowPath(tableId, 'synthetic-publication-metadata')),
      [200, 204],
    );
  }
  if (publicFile) {
    await check(
      'public-file-list',
      url(endpoint, filePath(publicFile.bucketId)),
      [200, 204],
    );
    for (const suffix of ['', '/download'])
      await check(`public-file${suffix || '-view'}`, url(endpoint, filePath(publicFile.bucketId, publicFile.fileId, suffix)), [200, 204]);
  }
  for (const row of guard.rows) {
    const expectedRead = publicTables.has(row.tableId) ? [200, 204] : [401, 403];
    for (const [verb, suffix] of [
      ['list', ''],
      ['get', `/${row.rowId}`],
    ]) {
      await check(
        `${publicTables.has(row.tableId) ? 'public' : 'private'}-${verb}-${row.tableId}`,
        url(endpoint, rowPath(row.tableId, suffix.slice(1))),
        expectedRead,
      );
    }
    for (const method of ['POST', 'PATCH', 'DELETE'])
      await check(`row-${method}-${row.tableId}`, url(endpoint, rowPath(row.tableId, row.rowId)), [401, 403], {
        method,
        body: method === 'DELETE' ? undefined : '{}',
      });
  }
  for (const file of guard.files) {
    await check(
      `private-file-list-${file.bucketId}`,
      url(endpoint, filePath(file.bucketId)),
      [401, 403],
    );
    for (const suffix of ['', '/download'])
      await check(`private-file-${file.bucketId}${suffix}`, url(endpoint, filePath(file.bucketId, file.fileId, suffix)), [401, 403]);
    for (const method of ['POST', 'PATCH', 'DELETE'])
      await check(`file-${method}-${file.bucketId}`, url(endpoint, filePath(file.bucketId, file.fileId)), [401, 403], {
        method,
        body: method === 'DELETE' ? undefined : '{}',
      });
  }
  return {
    projectId,
    checks,
    failed: checks.filter((item) => !item.pass).length,
    log: JSON.stringify({ projectId, checks }, null, 2),
  };
}
