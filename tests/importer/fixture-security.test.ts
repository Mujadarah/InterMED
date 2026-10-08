/**
 * Focused security regression tests for the two Codacy PR13 blocking findings
 * in the importer test fixtures:
 *
 * A. The artifact install helper `registryTarballBytes` fetches the committed
 *    lockfile `resolved` URL. These tests pin the explicit install network
 *    boundary: the exact https registry.npmjs.org origin with a declared
 *    tarball path, no userinfo/query/fragment, `redirect: 'error'` so the
 *    fetch can never cross origins, validation before ANY fetch, and bytes
 *    still SHA512-verified before use. All fetches are injected fakes; no
 *    registry network access ever happens here.
 *
 * B. The fake Appwrite REST path dispatch: valid routes, authorization,
 *    permissions, error and flat-response semantics stay unchanged, while
 *    malformed and long adversarial paths are refused and route matching
 *    stays linear for any input length (ReDoS regression guard).
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createFakeAppwriteRest,
  FAKE_DATABASE_ID,
  utf8Bytes,
} from './fake-appwrite-rest.mjs';
import {
  parseRegistryTarballUrl,
  registryTarballBytes,
} from './registry-tarball';

interface PinnedLockEntry {
  resolved?: string;
}

/** The actual declared pin: read from the committed root lockfile, never hardcoded. */
function readZodPin(): { resolved: string } {
  const lock = JSON.parse(
    readFileSync(resolve(process.cwd(), 'package-lock.json'), 'utf8'),
  ) as { packages: Record<string, PinnedLockEntry | undefined> };
  const zod = lock.packages['node_modules/zod'];
  if (!zod?.resolved) {
    throw new Error('zod pin missing from the committed root lockfile');
  }
  return { resolved: zod.resolved };
}

const ZOD_PIN = readZodPin();
const PINNED_PATH = new URL(ZOD_PIN.resolved).pathname;

const TARBALL_BYTES = Buffer.from('synthetic-registry-tarball-fixture-v1\n');
const TAMPERED_BYTES = Buffer.from('tampered-registry-tarball-fixture-v1\n');
const TARBALL_INTEGRITY = `sha512-${createHash('sha512')
  .update(TARBALL_BYTES)
  .digest('base64')}`;

interface RecordedFetch {
  input: unknown;
  init: RequestInit | undefined;
}

/** Injected fake fetch for the boundary tests: records every call, never hits the network. */
function fakeRegistryFetch(respond: () => Response): {
  calls: RecordedFetch[];
  fetchSpy: typeof fetch;
} {
  const calls: RecordedFetch[] = [];
  const fetchSpy = async (input: unknown, init?: RequestInit) => {
    calls.push({ input, init });
    return respond();
  };
  return { calls, fetchSpy: fetchSpy as unknown as typeof fetch };
}

describe('registry tarball install boundary (Codacy PR13 blocker A)', () => {
  it('accepts the committed lockfile pin and other well-formed declared tarball paths', () => {
    expect(parseRegistryTarballUrl(ZOD_PIN.resolved).href).toBe(
      ZOD_PIN.resolved,
    );
    const unscoped =
      'https://registry.npmjs.org/fictivol-core/-/fictivol-core-9.9.9.tgz';
    expect(parseRegistryTarballUrl(unscoped).href).toBe(unscoped);
    const scoped =
      'https://registry.npmjs.org/@fictivol/scope/-/scope-2.0.0.tgz';
    expect(parseRegistryTarballUrl(scoped).href).toBe(scoped);
  });

  it('fails closed on URLs outside the exact registry tarball boundary', () => {
    const cases: Array<[string, RegExp]> = [
      ['not a url at all', /not a valid URL/],
      ['', /not a valid URL/],
      [ZOD_PIN.resolved.replace('https://', 'http://'), /must use https/],
      ['file:///etc/passwd', /must use https/],
      ['ftp://registry.npmjs.org/fictivol.tgz', /must use https/],
      [
        `https://evil-registry.example.com${PINNED_PATH}`,
        /outside the npm registry origin/,
      ],
      [
        `https://registry.npmjs.org.evil.example${PINNED_PATH}`,
        /outside the npm registry origin/,
      ],
      [
        `https://registry.npmjs.org:8443${PINNED_PATH}`,
        /outside the npm registry origin/,
      ],
      [`https://user:secret@registry.npmjs.org${PINNED_PATH}`, /userinfo/],
      [`${ZOD_PIN.resolved}?token=1`, /query/],
      [`${ZOD_PIN.resolved}#section`, /fragment/],
      [
        `https://registry.npmjs.org${PINNED_PATH.replace('/-/', '/')}`,
        /declared registry tarball path/,
      ],
      [
        `https://registry.npmjs.org${PINNED_PATH.replace(/\.tgz$/, '.txt')}`,
        /declared registry tarball path/,
      ],
      [
        'https://registry.npmjs.org/-/fictivol-core-9.9.9.tgz',
        /declared registry tarball path/,
      ],
      ['https://registry.npmjs.org/', /declared registry tarball path/],
    ];
    for (const [resolved, pattern] of cases) {
      expect(
        () => parseRegistryTarballUrl(resolved),
        `unexpectedly accepted ${resolved}`,
      ).toThrow(pattern);
    }
  });

  it('fetches the exact declared pin once, forbids redirects and verifies integrity', async () => {
    const { calls, fetchSpy } = fakeRegistryFetch(
      () => new Response(TARBALL_BYTES, { status: 200 }),
    );
    const bytes = await registryTarballBytes(
      ZOD_PIN.resolved,
      TARBALL_INTEGRITY,
      fetchSpy,
    );
    expect(bytes.equals(TARBALL_BYTES)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(String(calls[0]?.input)).toBe(ZOD_PIN.resolved);
    expect(calls[0]?.init?.redirect).toBe('error');
  });

  it('does not hardcode the current pinned version', async () => {
    const otherPin =
      'https://registry.npmjs.org/fictivol-core/-/fictivol-core-9.9.9.tgz';
    const { calls, fetchSpy } = fakeRegistryFetch(
      () => new Response(TARBALL_BYTES, { status: 200 }),
    );
    const bytes = await registryTarballBytes(
      otherPin,
      TARBALL_INTEGRITY,
      fetchSpy,
    );
    expect(bytes.equals(TARBALL_BYTES)).toBe(true);
    expect(String(calls[0]?.input)).toBe(otherPin);
  });

  it('rejects tampered tarball bytes for a valid pin (fail closed)', async () => {
    const { calls, fetchSpy } = fakeRegistryFetch(
      () => new Response(TAMPERED_BYTES, { status: 200 }),
    );
    await expect(
      registryTarballBytes(ZOD_PIN.resolved, TARBALL_INTEGRITY, fetchSpy),
    ).rejects.toThrow(/integrity/);
    expect(calls).toHaveLength(1);
  });

  it('rejects registry error statuses', async () => {
    const { calls, fetchSpy } = fakeRegistryFetch(
      () => new Response(null, { status: 404 }),
    );
    await expect(
      registryTarballBytes(ZOD_PIN.resolved, TARBALL_INTEGRITY, fetchSpy),
    ).rejects.toThrow(/HTTP 404/);
    expect(calls).toHaveLength(1);
  });

  it('rejects a redirect response without following it', async () => {
    const { calls, fetchSpy } = fakeRegistryFetch(
      () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://evil.example.com/payload.tgz' },
        }),
    );
    await expect(
      registryTarballBytes(ZOD_PIN.resolved, TARBALL_INTEGRITY, fetchSpy),
    ).rejects.toThrow(/HTTP 302/);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.redirect).toBe('error');
  });

  it('refuses http, foreign origins, userinfo, query and fragment pins before ANY fetch', async () => {
    const { calls, fetchSpy } = fakeRegistryFetch(
      () => new Response(TARBALL_BYTES, { status: 200 }),
    );
    const malicious = [
      ZOD_PIN.resolved.replace('https://', 'http://'),
      `https://evil-registry.example.com${PINNED_PATH}`,
      `https://registry.npmjs.org.evil.example${PINNED_PATH}`,
      `https://user:secret@registry.npmjs.org${PINNED_PATH}`,
      `https://registry.npmjs.org:8443${PINNED_PATH}`,
      `${ZOD_PIN.resolved}?token=1`,
      `${ZOD_PIN.resolved}#section`,
      'file:///etc/passwd',
    ];
    for (const resolved of malicious) {
      await expect(
        registryTarballBytes(resolved, TARBALL_INTEGRITY, fetchSpy),
        `unexpectedly fetched ${resolved}`,
      ).rejects.toThrow(/Registry tarball URL rejected/);
    }
    expect(calls).toHaveLength(0);
  });
});

const REST_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const REST_PROJECT = 'intermed-dev';
/**
 * Runtime-generated fake credential: the fake REST server key is created per
 * run, so no credential-shaped literal ever exists in committed source. It is
 * never printed; it only authenticates the in-process fake REST surface.
 */
const REST_SERVER_KEY = randomBytes(24).toString('hex');

const ROW_DATA = {
  dataset: 'synthetic-medication-catalogue',
  version: 'synthetic-2026-10-06',
  sourceIds: ['source.synthetic'],
  importedAt: '2026-10-06T00:00:00.000Z',
  checksum: 'sha256-fixture',
  schemaVersion: 'medication-catalogue-1',
  minimumClientVersion: '0.0.0',
  recordCounts: '{"products":1}',
  coverage: 'Fictional coverage only. Not for clinical use.',
  rightsApprovalReference: 'FICT-APPROVAL-0000',
  clinicalReviewReference: 'FICT-REVIEW-0000',
  status: 'staging',
};

type FakeRest = ReturnType<typeof createFakeAppwriteRest>;

function createSecuredRest() {
  const rest = createFakeAppwriteRest({ serverKey: REST_SERVER_KEY });
  const authedHeaders = {
    'x-appwrite-project': REST_PROJECT,
    'x-appwrite-key': REST_SERVER_KEY,
  };
  const call = (
    method: string,
    path: string,
    headers: Record<string, string> = authedHeaders,
    init: RequestInit = {},
  ) =>
    rest.fetch(`${REST_ENDPOINT}${path}`, {
      method,
      headers,
      ...init,
    });
  return { rest, authedHeaders, call };
}

async function createRow(
  rest: FakeRest,
  rowId: string,
  options: { dataset?: string; permissions?: string[] } = {},
): Promise<Response> {
  return rest.fetch(
    `${REST_ENDPOINT}/tablesdb/${FAKE_DATABASE_ID}/tables/dataset-versions/rows`,
    {
      method: 'POST',
      headers: {
        'x-appwrite-project': REST_PROJECT,
        'x-appwrite-key': REST_SERVER_KEY,
      },
      body: JSON.stringify({
        rowId,
        data: { ...ROW_DATA, dataset: options.dataset ?? ROW_DATA.dataset },
        permissions: options.permissions,
      }),
    },
  );
}

describe('fake Appwrite REST path dispatch (Codacy PR13 blocker B)', () => {
  it('serves the tablesdb rows routes unchanged', async () => {
    const { rest, call } = createSecuredRest();
    const rowsPath = `/tablesdb/${FAKE_DATABASE_ID}/tables/dataset-versions/rows`;

    const created = await createRow(rest, 'row-1');
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      $id: 'row-1',
      $databaseId: FAKE_DATABASE_ID,
      $tableId: 'dataset-versions',
      dataset: 'synthetic-medication-catalogue',
    });

    await createRow(rest, 'row-2', { dataset: 'other-fictivol-dataset' });

    const equalQueries = new URLSearchParams();
    equalQueries.append(
      'queries[]',
      JSON.stringify({
        method: 'equal',
        attribute: 'dataset',
        values: ['synthetic-medication-catalogue'],
      }),
    );
    const listed = await call('GET', `${rowsPath}?${equalQueries}`);
    expect(listed.status).toBe(200);
    const listBody = (await listed.json()) as {
      total: number;
      rows: Array<{ $id: string }>;
    };
    expect(listBody.total).toBe(1);
    expect(listBody.rows).toHaveLength(1);
    expect(listBody.rows[0]?.$id).toBe('row-1');

    const limitQueries = new URLSearchParams();
    limitQueries.append(
      'queries[]',
      JSON.stringify({ method: 'limit', values: [1] }),
    );
    const limited = await call('GET', `${rowsPath}?${limitQueries}`);
    expect(limited.status).toBe(200);
    const limitBody = (await limited.json()) as {
      total: number;
      rows: unknown[];
    };
    expect(limitBody.total).toBe(1);
    expect(limitBody.rows).toHaveLength(1);

    const badQuery = await call(
      'GET',
      `${rowsPath}?queries%5B%5D=${encodeURIComponent('not-json')}`,
    );
    expect(badQuery.status).toBe(400);
    expect(((await badQuery.json()) as { type: string }).type).toBe(
      'general_query_invalid',
    );

    const got = await call('GET', `${rowsPath}/row-1`);
    expect(got.status).toBe(200);
    expect(((await got.json()) as { $id: string }).$id).toBe('row-1');

    const duplicate = await createRow(rest, 'row-1');
    expect(duplicate.status).toBe(409);
    expect(((await duplicate.json()) as { type: string }).type).toBe(
      'general_argument_conflict',
    );

    const invalidRowId = await rest.fetch(`${REST_ENDPOINT}${rowsPath}`, {
      method: 'POST',
      headers: {
        'x-appwrite-project': REST_PROJECT,
        'x-appwrite-key': REST_SERVER_KEY,
      },
      body: JSON.stringify({ rowId: '../escape', data: ROW_DATA }),
    });
    expect(invalidRowId.status).toBe(400);
    expect(((await invalidRowId.json()) as { type: string }).type).toBe(
      'general_argument_invalid',
    );

    const invalidData = await rest.fetch(`${REST_ENDPOINT}${rowsPath}`, {
      method: 'POST',
      headers: {
        'x-appwrite-project': REST_PROJECT,
        'x-appwrite-key': REST_SERVER_KEY,
      },
      body: JSON.stringify({ rowId: 'row-bad', data: { dataset: 'x' } }),
    });
    expect(invalidData.status).toBe(400);

    const unknownTable = await call(
      'GET',
      `/tablesdb/${FAKE_DATABASE_ID}/tables/unknown-fictivol-table/rows`,
    );
    expect(unknownTable.status).toBe(404);
    expect(((await unknownTable.json()) as { type: string }).type).toBe(
      'table_not_found',
    );

    const deleted = await call('DELETE', `${rowsPath}/row-1`);
    expect(deleted.status).toBe(204);
    const gone = await call('GET', `${rowsPath}/row-1`);
    expect(gone.status).toBe(404);
    expect(((await gone.json()) as { type: string }).type).toBe(
      'row_not_found',
    );
  });

  it('serves the storage bucket file routes unchanged', async () => {
    const { rest, authedHeaders, call } = createSecuredRest();
    const filesPath = '/storage/buckets/raw-sources/files';
    const bytes = utf8Bytes('{"fictivol":"synthetic-snapshot"}');

    const form = new FormData();
    form.set('fileId', 'file-1');
    form.set(
      'file',
      new File([bytes], 'snapshot.json', { type: 'application/json' }),
    );
    form.append('permissions[]', 'read("any")');
    const created = await rest.fetch(`${REST_ENDPOINT}${filesPath}`, {
      method: 'POST',
      headers: authedHeaders,
      body: form,
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      $id: 'file-1',
      bucketId: 'raw-sources',
      name: 'snapshot.json',
      sizeOriginal: bytes.byteLength,
      chunksTotal: 1,
    });

    const metadata = await call('GET', `${filesPath}/file-1`);
    expect(metadata.status).toBe(200);
    expect(((await metadata.json()) as { $id: string }).$id).toBe('file-1');

    const download = await call('GET', `${filesPath}/file-1/download`);
    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(
      Buffer.from(bytes),
    );

    const view = await call('GET', `${filesPath}/file-1/view`);
    expect(view.status).toBe(200);
    expect(Buffer.from(await view.arrayBuffer())).toEqual(Buffer.from(bytes));

    const missing = await call('GET', `${filesPath}/no-such-fictivol-file`);
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { type: string }).type).toBe(
      'file_not_found',
    );

    const badBucket = await call(
      'POST',
      '/storage/buckets/no-such-fictivol-bucket/files',
      authedHeaders,
      { body: new FormData() },
    );
    expect(badBucket.status).toBe(404);
    expect(((await badBucket.json()) as { type: string }).type).toBe(
      'bucket_not_found',
    );

    const nonForm = await call('POST', filesPath, authedHeaders, {
      body: 'not-a-form',
    });
    expect(nonForm.status).toBe(400);
    expect(((await nonForm.json()) as { type: string }).type).toBe(
      'general_argument_invalid',
    );

    const evilForm = new FormData();
    evilForm.set('fileId', '../escape');
    evilForm.set('file', new File([bytes], 'evil.bin'));
    const evil = await call('POST', filesPath, authedHeaders, {
      body: evilForm,
    });
    expect(evil.status).toBe(400);
    expect(((await evil.json()) as { type: string }).type).toBe(
      'general_argument_invalid',
    );
  });

  it('keeps the REST authorization surface intact', async () => {
    const { rest, authedHeaders, call } = createSecuredRest();
    const rowsPath = `/tablesdb/${FAKE_DATABASE_ID}/tables/dataset-versions/rows`;
    const anonymous = { 'x-appwrite-project': REST_PROJECT };
    await createRow(rest, 'public-row', {
      dataset: 'public-fictivol-dataset',
      permissions: ['read("any")'],
    });
    await createRow(rest, 'private-row', {
      dataset: 'private-fictivol-dataset',
    });

    const wrongKey = await call('GET', rowsPath, {
      ...authedHeaders,
      'x-appwrite-key': 'wrong-fictivol-key',
    });
    expect(wrongKey.status).toBe(401);
    expect(((await wrongKey.json()) as { type: string }).type).toBe(
      'general_unauthorized_scope',
    );

    const wrongProject = await call('GET', rowsPath, {
      'x-appwrite-project': 'other-fictivol-project',
      'x-appwrite-key': REST_SERVER_KEY,
    });
    expect(wrongProject.status).toBe(401);

    const anonymousPost = await rest.fetch(`${REST_ENDPOINT}${rowsPath}`, {
      method: 'POST',
      headers: anonymous,
      body: JSON.stringify({ rowId: 'anon-row', data: ROW_DATA }),
    });
    expect(anonymousPost.status).toBe(401);

    const anonymousList = await call('GET', rowsPath, anonymous);
    expect(anonymousList.status).toBe(200);
    const listBody = (await anonymousList.json()) as {
      total: number;
      rows: Array<{ $id: string }>;
    };
    expect(listBody.total).toBe(1);
    expect(listBody.rows[0]?.$id).toBe('public-row');

    const anonymousPrivate = await call(
      'GET',
      `${rowsPath}/private-row`,
      anonymous,
    );
    expect(anonymousPrivate.status).toBe(404);
    expect(((await anonymousPrivate.json()) as { type: string }).type).toBe(
      'row_not_found',
    );

    const anonymousPublic = await call(
      'GET',
      `${rowsPath}/public-row`,
      anonymous,
    );
    expect(anonymousPublic.status).toBe(200);

    const bytes = utf8Bytes('synthetic-file-fixture');
    const uploadForm = (fileId: string, permissions: boolean) => {
      const form = new FormData();
      form.set('fileId', fileId);
      form.set('file', new File([bytes], `${fileId}.json`));
      if (permissions) form.append('permissions[]', 'read("any")');
      return form;
    };
    const upload = (form: FormData) =>
      rest.fetch(`${REST_ENDPOINT}/storage/buckets/raw-sources/files`, {
        method: 'POST',
        headers: authedHeaders,
        body: form,
      });
    expect((await upload(uploadForm('public-file', true))).status).toBe(201);
    expect((await upload(uploadForm('private-file', false))).status).toBe(201);

    const anonymousDownload = await call(
      'GET',
      '/storage/buckets/raw-sources/files/public-file/download',
      anonymous,
    );
    expect(anonymousDownload.status).toBe(200);
    const anonymousPrivateDownload = await call(
      'GET',
      '/storage/buckets/raw-sources/files/private-file/download',
      anonymous,
    );
    expect(anonymousPrivateDownload.status).toBe(404);
    expect(
      ((await anonymousPrivateDownload.json()) as { type: string }).type,
    ).toBe('file_not_found');

    const authedList = await call('GET', rowsPath);
    expect(((await authedList.json()) as { total: number }).total).toBe(2);
  });

  it('refuses malformed paths with the same not_found mapping', async () => {
    const { call } = createSecuredRest();
    const malformed = [
      `//tablesdb/${FAKE_DATABASE_ID}/tables/dataset-versions/rows`,
      `/tablesdb//${FAKE_DATABASE_ID}/tables/dataset-versions/rows`,
      `/tablesdb/${FAKE_DATABASE_ID}/tables/dataset-versions/rows/`,
      `/tablesdb/${FAKE_DATABASE_ID}/tables/dataset-versions/rows/a/b`,
      `/tablesdbx/${FAKE_DATABASE_ID}/tables/dataset-versions/rows`,
      `/tablesdb/${FAKE_DATABASE_ID}/tablesx/dataset-versions/rows`,
      '/storage/buckets/raw-sources/files/',
      '/storage/buckets//files',
      '/storage/bucketsx/raw-sources/files',
      '/storage/buckets/raw-sources/filesx/file-1',
      '/storage/buckets/raw-sources/files/file-1/download/extra',
      '/storage/buckets/raw-sources/files/file-1/viewx',
      '/',
      '',
    ];
    for (const path of malformed) {
      const res = await call('GET', path);
      expect(res.status, `path ${path}`).toBe(404);
      expect(
        ((await res.json()) as { type: string }).type,
        `path ${path}`,
      ).toBe('not_found');
    }
    const put = await call(
      'PUT',
      `/tablesdb/${FAKE_DATABASE_ID}/tables/dataset-versions/rows`,
    );
    expect(put.status).toBe(404);
    expect(((await put.json()) as { type: string }).type).toBe('not_found');
  });

  it('refuses long adversarial paths in linear time (ReDoS regression guard)', async () => {
    const { call } = createSecuredRest();
    const adversarial = [
      `/${'a'.repeat(100_000)}`,
      `/tablesdb/${'a'.repeat(50_000)}/tables/${'b'.repeat(50_000)}/rows`,
      `/tablesdb/${'a'.repeat(50_000)}/tables/${'b'.repeat(50_000)}/rows/${'c'.repeat(50_000)}`,
      `/storage/buckets/${'a'.repeat(50_000)}/files`,
      `/storage/buckets/${'a'.repeat(50_000)}/files/${'b'.repeat(50_000)}`,
      `/storage/buckets/${'a'.repeat(50_000)}/files/${'b'.repeat(50_000)}/download`,
      `/storage/buckets/a/files/${'a/'.repeat(25_000)}a`,
      `/storage/buckets/a/files/b/${'download/'.repeat(25_000)}x`,
      `/tablesdb/${'a/'.repeat(25_000)}tables/x/tables/y/rows`,
    ];
    const started = Date.now();
    for (const path of adversarial) {
      const res = await call('GET', path);
      expect(res.status, `path length ${path.length}`).toBe(404);
    }
    const elapsed = Date.now() - started;
    expect(
      elapsed,
      `route matching must stay linear: ${elapsed}ms for ${adversarial.length} long paths`,
    ).toBeLessThan(2_000);
  });
});
