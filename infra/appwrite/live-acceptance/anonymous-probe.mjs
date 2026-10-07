const DEV_PROJECT = 'intermed-dev';
const DEV_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';

function assertDevelopmentProject(projectId, endpoint) {
  if (
    projectId !== DEV_PROJECT ||
    endpoint.replace(/\/+$/, '') !== DEV_ENDPOINT
  )
    throw new Error(
      'live acceptance is restricted to the fixed intermed-dev project',
    );
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
  delete fetchOptions.privateTableId;
  delete fetchOptions.privateRowId;
  try {
    const response = await fetchLike(target, {
      ...fetchOptions,
      credentials: 'omit',
      headers: {
        'X-Appwrite-Project': _projectId,
        ...(fetchOptions.body && !(fetchOptions.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
    });
    const rawBody = await response.text();
    let parsedBody;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = null;
    }
    return {
      status: response.status,
      body: safeBody(rawBody),
      contentType: responseHeader(response, 'content-type'),
      errorType:
        response.status >= 400
          ? typeof parsedBody?.type === 'string'
            ? parsedBody.type
            : 'http-error'
          : null,
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

function rowPayload(tableId, preparedRow) {
  if (preparedRow?.data) return preparedRow.data;
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

function rowPatchPayload(tableId, preparedRow) {
  const data = { ...rowPayload(tableId, preparedRow) };
  if (tableId === 'dataset-versions')
    return {
      ...data,
      status: 'staging',
      coverage: `${data.coverage ?? 'Synthetic disposable guard only.'} updated`,
    };
  if (tableId === 'dataset-bundles')
    return {
      ...data,
      fileName: 'live-acceptance-guard-updated.json',
    };
  return {
    ...data,
    publicationStatus: 'staging',
    approvalReference: 'anonymous-probe-updated',
  };
}

function fileFormData(fileId) {
  const form = new FormData();
  form.append('fileId', fileId);
  form.append(
    'file',
    new Blob(['synthetic guard'], { type: 'text/plain' }),
    'guard.txt',
  );
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
  const verifiedPrivateRows = new Set(
    (options.verifiedPrivateRows ?? []).map((row) =>
      typeof row === 'string' ? row : `${row.tableId}/${row.rowId}`,
    ),
  );
  let aborted = false;
  const pendingNames = [];
  const check = async (name, target, expected, requestOptions = {}) => {
    const observed = await request(fetchLike, target, {
      ...requestOptions,
      projectId,
    });
    const isDenialExpectation =
      expected.includes(401) && expected.includes(403);
    const isVerifiedMissingPrivateRow =
      observed.status === 404 &&
      observed.errorType === 'row_not_found' &&
      verifiedPrivateRows.has(
        `${requestOptions.privateTableId ?? ''}/${requestOptions.privateRowId ?? ''}`,
      );
    const originalPass = expected.includes(observed.status);
    const maskedRefusal = !originalPass && isVerifiedMissingPrivateRow;
    const pass = originalPass || maskedRefusal;
    checks.push({
      name,
      expected,
      observed,
      pass,
      ...(maskedRefusal ? { maskedRefusal: true, originalPass } : {}),
    });
    if (
      !pass &&
      isDenialExpectation &&
      observed.status >= 200 &&
      observed.status < 300
    )
      aborted = true;
    return pass;
  };
  const rowPath = (tableId, rowId = '') =>
    `/tablesdb/${databaseId}/tables/${tableId}/rows${rowId ? `/${rowId}` : ''}`;
  const filePath = (bucketId, fileId = '', suffix = '') =>
    `/storage/buckets/${bucketId}/files${fileId ? `/${fileId}` : ''}${suffix}`;
  const publicTables = new Set(['dataset-versions', 'dataset-bundles']);

  const operations = [];
  for (const row of guard.rows) {
    const isPublic = publicTables.has(row.tableId);
    operations.push(
      {
        name: `${isPublic ? 'public' : 'private'}-list-${row.tableId}`,
        target: url(endpoint, rowPath(row.tableId)),
        expected: isPublic ? [200, 204] : [401, 403],
        requestOptions: isPublic
          ? {}
          : { privateTableId: row.tableId, privateRowId: row.rowId },
      },
      {
        name: `${isPublic ? 'public' : 'private'}-get-${row.tableId}`,
        target: url(endpoint, rowPath(row.tableId, row.rowId)),
        expected: isPublic ? [200, 204] : [401, 403],
        requestOptions: isPublic
          ? {}
          : { privateTableId: row.tableId, privateRowId: row.rowId },
      },
      {
        name: `row-POST-${row.tableId}`,
        target: url(endpoint, rowPath(row.tableId)),
        expected: [401, 403],
        requestOptions: {
          method: 'POST',
          body: JSON.stringify({
            rowId: `anon-create-${row.tableId}`,
            data: rowPayload(row.tableId, row),
          }),
        },
      },
      {
        name: `row-PATCH-${row.tableId}`,
        target: url(endpoint, rowPath(row.tableId, row.rowId)),
        expected: [401, 403],
        requestOptions: {
          method: 'PATCH',
          body: JSON.stringify({ data: rowPatchPayload(row.tableId, row) }),
        },
      },
      {
        name: `row-DELETE-${row.tableId}`,
        target: url(endpoint, rowPath(row.tableId, row.rowId)),
        expected: [401, 403],
        requestOptions: { method: 'DELETE' },
      },
    );
  }

  for (const file of guard.files) {
    const isPublic = file.bucketId === 'published-datasets';
    const expectedRead = isPublic ? [200, 204] : [401, 403];
    operations.push(
      {
        name: `${isPublic ? 'public' : 'private'}-list-${file.bucketId}`,
        target: url(endpoint, filePath(file.bucketId)),
        expected: expectedRead,
      },
      {
        name: `${isPublic ? 'public' : 'private'}-get-${file.bucketId}`,
        target: url(endpoint, filePath(file.bucketId, file.fileId)),
        expected: expectedRead,
      },
      {
        name: isPublic
          ? 'public-download-published-datasets'
          : `private-download-${file.bucketId}`,
        target: url(
          endpoint,
          filePath(file.bucketId, file.fileId, '/download'),
        ),
        expected: expectedRead,
      },
      {
        name: `file-POST-${file.bucketId}`,
        target: url(endpoint, filePath(file.bucketId)),
        expected: [401, 403],
        requestOptions: {
          method: 'POST',
          body: fileFormData(
            `anon-create-${file.bucketId.replaceAll('-', '').slice(0, 20)}`,
          ),
        },
      },
      {
        name: `file-PUT-${file.bucketId}`,
        target: url(endpoint, filePath(file.bucketId, file.fileId)),
        expected: [401, 403],
        requestOptions: {
          method: 'PUT',
          body: JSON.stringify({ name: 'live-acceptance-guard-updated.txt' }),
        },
      },
      {
        name: `file-DELETE-${file.bucketId}`,
        target: url(endpoint, filePath(file.bucketId, file.fileId)),
        expected: [401, 403],
        requestOptions: { method: 'DELETE' },
      },
    );
  }
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];
    pendingNames.push(...operations.slice(index + 1).map(({ name }) => name));
    const pass = await check(
      operation.name,
      operation.target,
      operation.expected,
      operation.requestOptions,
    );
    if (!pass && aborted) break;
    pendingNames.length = 0;
  }
  return {
    projectId,
    checks,
    failed: checks.filter((item) => !item.pass).length,
    aborted,
    remainingNotRun: pendingNames,
    log: JSON.stringify(
      { projectId, checks, aborted, remainingNotRun: pendingNames },
      null,
      2,
    ),
  };
}
