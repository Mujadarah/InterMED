import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { prepareSyntheticPublication } from '../infra/appwrite/live-acceptance/publication-preparation.mjs';
import { runAnonymousProbe } from '../infra/appwrite/live-acceptance/anonymous-probe.mjs';
import { readPublishedMetadata } from '../infra/appwrite/live-acceptance/adapter-read.mjs';

const project = {
  projectId: 'intermed-dev',
  endpoint: 'https://fra.cloud.appwrite.io/v1',
} as const;

type ProbeFetchOptions = {
  method?: string;
  body?: string | FormData;
  [key: string]: unknown;
};

type ProbeFetchResponse = {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

describe('Appwrite live acceptance preparation', () => {
  it('writes one canonical synthetic generation and owner-only command plan', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'intermed-live-'));
    const result = await prepareSyntheticPublication({
      ...project,
      outputDirectory,
      now: '2026-10-07T09:00:00.000Z',
    });

    expect(result.generation.dataset).toBe('synthetic-medication-catalogue');
    expect(result.generation.status).toBe('published');
    expect(result.generation.checksum).toBe(result.descriptor.checksum);
    expect(result.generation.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.generation.fileChecksum).toBe(result.generation.checksum);
    expect(result.generation.catalogueFingerprint).toBe(
      result.snapshot.datasetVersions[0]?.checksum,
    );
    expect(result.versionRow.status).toBe('published');
    expect(result.versionRow.publishedAt).toBe('2026-10-07T09:00:00.000Z');
    expect(result.versionRow.checksum).toBe(result.descriptor.checksum);
    expect(result.files).toHaveLength(3);
    expect(result.preparationPath).toContain('preparation.json');
    expect(JSON.parse(await readFile(result.preparationPath, 'utf8'))).toEqual(
      expect.objectContaining({
        rows: expect.any(Object),
        guards: expect.any(Object),
        commandPlan: result.commandPlan,
      }),
    );
    expect(result.commandPlan.map(({ action }) => action)).toEqual([
      ...Array(4).fill('storage-create-guard-file'),
      ...Array(3).fill('table-create-guard-row'),
      'storage-create-bundle-file',
      'table-create-descriptor-row',
      'table-create-manifest-row-last',
    ]);
    expect(
      result.commandPlan.every(({ automatic }) => automatic === false),
    ).toBe(true);
    expect(
      result.commandPlan.every(
        ({ command, argv }) =>
          command.includes('npx') &&
          (argv.includes('tables-db') || argv.includes('storage')) &&
          command.includes('appwrite-cli@28.1.0') &&
          command.includes('--config-file') &&
          command.includes('appwrite.config.development.json') &&
          !command.includes('tablesdb') &&
          !command.includes('--data @'),
      ),
    ).toBe(true);
    expect(
      result.commandPlan
        .filter(({ action }) => action.includes('create-file'))
        .every(
          ({ argv }) =>
            argv.includes(
              resolve(outputDirectory, 'live-acceptance-guard.txt'),
            ) ||
            argv.includes(
              resolve(
                outputDirectory,
                result.generation.dataset + '-synthetic-2026-10-06.json',
              ),
            ),
        ),
    ).toBe(true);
    expect(
      result.commandPlan
        .filter(({ action }) => action.includes('create-row'))
        .every(({ argv }) => {
          const permissions = argv.reduce<string[]>((values, value, index) => {
            if (value === '--permissions') {
              const permission = argv[index + 1];
              if (permission) values.push(permission);
            }
            return values;
          }, []);
          return permissions.every((permission) => !permission.startsWith('['));
        }),
    ).toBe(true);
    expect(result.commandPlan.at(-1)?.action).toBe(
      'table-create-manifest-row-last',
    );

    const bundle = await readFile(result.files[0]!, 'utf8');
    expect(JSON.parse(bundle).dataSources).toBeDefined();
    expect(result.descriptor.byteSize).toBe(Buffer.byteLength(bundle));
    expect(result.descriptor.datasetVersionId).toBe(result.versionRow.$id);
    expect(result.descriptor.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.versionRow.$id).toMatch(/^[A-Za-z0-9._-]{1,36}$/);
    expect(result.descriptor.$id).toMatch(/^[A-Za-z0-9._-]{1,36}$/);
    expect(result.descriptor.fileId).toMatch(/^[A-Za-z0-9._-]{1,36}$/);
    expect(result.versionRow.recordCounts).toBe(
      JSON.stringify(result.snapshot.datasetVersions[0]?.recordCounts),
    );
    expect(result.versionRow.coverage).toBe(
      result.snapshot.datasetVersions[0]?.coverage,
    );
  });

  it('creates guards in a different staging dataset and never targets publication ids', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'intermed-live-'));
    const result = await prepareSyntheticPublication({
      ...project,
      outputDirectory,
      now: '2026-10-07T09:00:00.000Z',
    });

    expect(result.guards.rows).toHaveLength(3);
    expect(result.guards.files).toHaveLength(4);
    expect(result.guards.rows[0]?.data.status).toBe('staging');
    expect(result.guards.rows[1]?.data.status).toBeUndefined();
    expect(result.guards.rows[2]?.data.publicationStatus).toBe('staging');
    expect(
      result.guards.rows.every(
        (row) => row.data.dataset !== result.generation.dataset,
      ),
    ).toBe(true);
    expect(result.guards.targets).not.toContain(result.versionRow.$id);
    expect(result.guards.targets).not.toContain(result.descriptor.$id);
    expect(result.guards.targets).not.toContain(result.descriptor.fileId);
  });

  it('reads the prepared published rows through the actual adapter contract', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'intermed-live-'));
    const prepared = await prepareSyntheticPublication({
      ...project,
      outputDirectory,
      now: '2026-10-07T09:00:00.000Z',
    });
    const result = await readPublishedMetadata({
      ...project,
      outputDirectory,
      fetchLike: async (url: string): Promise<ProbeFetchResponse> => ({
        ok: true,
        status: 200,
        headers: { 'content-type': 'application/json' },
        text: async () => '{}',
        json: async () =>
          url.includes('dataset-versions')
            ? { total: 1, rows: [prepared.versionRow] }
            : { total: 1, rows: [prepared.descriptor] },
      }),
      dataset: prepared.versionRow.dataset,
    });

    expect(result.manifest.status).toBe('available');
    expect(result.descriptor.status).toBe('available');
    if (
      result.manifest.status !== 'available' ||
      result.descriptor.status !== 'available'
    )
      throw new Error('prepared publication was not readable');
    if (!('value' in result.descriptor))
      throw new Error('prepared descriptor had no value');
    expect(result.manifest.value.publishedAt).toBe('2026-10-07T09:00:00.000Z');
    expect(result.manifest.value.checksum).toBe(
      result.descriptor.value.checksum,
    );
    expect(result.manifest.value.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('preserves manifest unavailability in the descriptor result', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'intermed-live-'));
    const result = await readPublishedMetadata({
      ...project,
      outputDirectory,
      fetchLike: async () => {
        throw new TypeError('synthetic network failure');
      },
      dataset: 'synthetic-medication-catalogue',
    });

    expect(result.manifest).toEqual({
      status: 'unavailable',
      reason: 'transport-error',
    });
    expect(result.descriptor).toEqual({
      status: 'unavailable',
      reason: 'transport-error',
    });
  });
});

describe('anonymous Appwrite probe', () => {
  it('uses materially different valid updates and Appwrite Storage PUT semantics', async () => {
    const calls: Array<{
      url: string;
      options: ProbeFetchOptions | undefined;
    }> = [];
    const result = await runAnonymousProbe({
      ...project,
      fetchLike: async (
        url: string,
        options?: ProbeFetchOptions,
      ): Promise<ProbeFetchResponse> => {
        calls.push({ url, options });
        const privateRequest =
          options?.method !== undefined ||
          url.includes('import-runs') ||
          url.includes('raw-sources') ||
          url.includes('quarantine') ||
          url.includes('import-run-logs');
        return {
          ok: !privateRequest,
          status: privateRequest ? 403 : 200,
          headers: {},
          text: async () => '{}',
          json: async () => ({}),
        };
      },
      guard: {
        rows: [
          {
            tableId: 'dataset-versions',
            rowId: 'guard-version',
            data: {
              dataset: 'guard',
              status: 'published',
              coverage: 'original',
            },
          },
          {
            tableId: 'dataset-bundles',
            rowId: 'guard-bundle',
            data: {
              datasetVersionId: 'guard-version',
              fileName: 'live-acceptance-guard.json',
            },
          },
          {
            tableId: 'import-runs',
            rowId: 'guard-run',
            data: {
              sourceId: 'guard-source',
              publicationStatus: 'staging',
              approvalReference: 'guard',
            },
          },
        ],
        files: [{ bucketId: 'published-datasets', fileId: 'guard-file' }],
      },
    });

    expect(result.failed).toBe(0);
    const rowPatches = calls.filter(
      ({ url, options }) =>
        url.includes('/tables/') && options?.method === 'PATCH',
    );
    expect(rowPatches).toHaveLength(3);
    expect(
      rowPatches.map(({ options }) => JSON.parse(String(options?.body)).data),
    ).toEqual([
      { dataset: 'guard', status: 'staging', coverage: expect.any(String) },
      {
        datasetVersionId: 'guard-version',
        fileName: expect.stringContaining('updated'),
      },
      {
        sourceId: 'guard-source',
        publicationStatus: 'staging',
        approvalReference: expect.stringContaining('updated'),
      },
    ]);
    expect(
      calls.some(
        ({ url, options }) =>
          url.includes('/buckets/published-datasets/files/guard-file') &&
          options?.method === 'PUT',
      ),
    ).toBe(true);
    expect(
      calls.some(
        ({ url, options }) =>
          url.includes('/buckets/') && options?.method === 'PATCH',
      ),
    ).toBe(false);
  });

  it('aborts immediately after an unexpected private success', async () => {
    const calls: string[] = [];
    const result = await runAnonymousProbe({
      ...project,
      fetchLike: async (url: string): Promise<ProbeFetchResponse> => {
        calls.push(url);
        return {
          ok: true,
          status: 200,
          headers: {},
          text: async () => '{}',
          json: async () => ({}),
        };
      },
      guard: {
        rows: [{ tableId: 'import-runs', rowId: 'guard-run' }],
        files: [{ bucketId: 'raw-sources', fileId: 'guard-raw' }],
      },
    });

    expect(result.aborted).toBe(true);
    expect(result.failed).toBe(1);
    expect(result.checks).toHaveLength(1);
    expect(result.remainingNotRun.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
  });

  it('only masks a verified private exact-row GET row_not_found as a refusal', async () => {
    const result = await runAnonymousProbe({
      ...project,
      fetchLike: async (
        _url: string,
        options?: ProbeFetchOptions,
      ): Promise<ProbeFetchResponse> =>
        options?.method === undefined
          ? {
              ok: false,
              status: 404,
              headers: { 'content-type': 'application/json' },
              text: async () => JSON.stringify({ type: 'row_not_found' }),
              json: async () => ({ type: 'row_not_found' }),
            }
          : {
              ok: false,
              status: 403,
              headers: {},
              text: async () => '{}',
              json: async () => ({}),
            },
      guard: {
        rows: [{ tableId: 'import-runs', rowId: 'guard-run' }],
        files: [],
      },
      verifiedPrivateRows: [{ tableId: 'import-runs', rowId: 'guard-run' }],
    });

    expect(result.failed).toBe(1);
    expect(result.checks[0]).toMatchObject({
      pass: false,
    });
    expect(result.checks[1]).toMatchObject({
      maskedRefusal: true,
      originalPass: false,
      pass: true,
    });
  });

  it('does not mask an unverified private exact-row GET row_not_found', async () => {
    const result = await runAnonymousProbe({
      ...project,
      fetchLike: async (): Promise<ProbeFetchResponse> => ({
        ok: false,
        status: 404,
        headers: { 'content-type': 'application/json' },
        text: async () => JSON.stringify({ type: 'row_not_found' }),
        json: async () => ({ type: 'row_not_found' }),
      }),
      guard: {
        rows: [{ tableId: 'import-runs', rowId: 'guard-run' }],
        files: [],
      },
    });

    expect(result.failed).toBeGreaterThan(0);
    expect(result.checks[1]).toMatchObject({
      pass: false,
    });
    expect(result.checks[1]).not.toHaveProperty('maskedRefusal');
  });

  it('does not mask a private write row_not_found', async () => {
    const result = await runAnonymousProbe({
      ...project,
      fetchLike: async (): Promise<ProbeFetchResponse> => ({
        ok: false,
        status: 404,
        headers: { 'content-type': 'application/json' },
        text: async () => JSON.stringify({ type: 'row_not_found' }),
        json: async () => ({ type: 'row_not_found' }),
      }),
      guard: {
        rows: [{ tableId: 'import-runs', rowId: 'guard-run' }],
        files: [],
      },
      verifiedPrivateRows: [{ tableId: 'import-runs', rowId: 'guard-run' }],
    });

    expect(result.failed).toBeGreaterThan(0);
    const writes = result.checks.filter(({ name }) => name.startsWith('row-'));
    expect(writes).toHaveLength(3);
    expect(writes.every(({ pass }) => !pass)).toBe(true);
    expect(writes.every((check) => !('maskedRefusal' in check))).toBe(true);
  });

  it('records public success and private 401/403 denial without credentials', async () => {
    const calls: Array<{
      url: string;
      options: ProbeFetchOptions | undefined;
    }> = [];
    const result = await runAnonymousProbe({
      ...project,
      fetchLike: async (
        url: string,
        options?: ProbeFetchOptions,
      ): Promise<ProbeFetchResponse> => {
        calls.push({ url, options });
        const parsedBody =
          typeof options?.body === 'string'
            ? (JSON.parse(options.body) as Record<string, unknown>)
            : undefined;
        const isRowPost =
          options?.method === 'POST' && url.includes('/tables/');
        const isRowPatch =
          options?.method === 'PATCH' && url.includes('/tables/');
        const malformedRowRequest =
          (isRowPost &&
            (!parsedBody?.rowId ||
              typeof parsedBody.data !== 'object' ||
              parsedBody.data === null)) ||
          (isRowPatch &&
            (typeof parsedBody?.data !== 'object' || parsedBody.data === null));
        const isFilePost =
          options?.method === 'POST' && url.includes('/buckets/');
        const submittedFileId =
          options?.body instanceof FormData
            ? options.body.get('fileId')
            : undefined;
        const malformedFileRequest =
          isFilePost &&
          typeof submittedFileId === 'string' &&
          submittedFileId.startsWith('guard-');
        const privateRequest =
          options?.method === 'POST' ||
          options?.method === 'PATCH' ||
          options?.method === 'PUT' ||
          options?.method === 'DELETE' ||
          url.includes('import-runs') ||
          url.includes('raw-sources') ||
          url.includes('quarantine') ||
          url.includes('import-run-logs');
        return {
          ok: !privateRequest,
          status: !privateRequest
            ? 200
            : malformedRowRequest || malformedFileRequest
              ? 400
              : 403,
          headers: { 'content-type': 'application/json' },
          text: async () =>
            malformedRowRequest || malformedFileRequest
              ? JSON.stringify({ type: 'invalid_request' })
              : '{}',
          json: async () =>
            malformedRowRequest || malformedFileRequest
              ? { type: 'invalid_request' }
              : { rows: [] },
        };
      },
      guard: {
        databaseId: 'intermed-datasets',
        rows: [
          { tableId: 'dataset-versions', rowId: 'guard-version' },
          { tableId: 'dataset-bundles', rowId: 'guard-bundle' },
          { tableId: 'import-runs', rowId: 'guard-run' },
        ],
        files: [
          { bucketId: 'raw-sources', fileId: 'guard-raw' },
          { bucketId: 'quarantine', fileId: 'guard-quarantine' },
          { bucketId: 'import-run-logs', fileId: 'guard-log' },
          { bucketId: 'published-datasets', fileId: 'guard-published' },
        ],
      },
    });

    expect(result.failed).toBe(0);
    expect(result.checks).toHaveLength(39);
    expect(
      calls.every(
        ({ options }) =>
          options?.credentials === 'omit' &&
          !JSON.stringify(options).match(/key|jwt|cookie|token/i),
      ),
    ).toBe(true);
    expect(result.checks.some((check) => check.expected.includes('400'))).toBe(
      false,
    );
    expect(
      calls.some(
        ({ url, options }) =>
          url.endsWith('/tables/dataset-versions/rows') &&
          options?.method === 'POST' &&
          typeof options.body === 'string' &&
          options.body.includes('"status":"staging"'),
      ),
    ).toBe(true);
    expect(
      calls.some(
        ({ url, options }) =>
          url.endsWith('/buckets/published-datasets/files') &&
          options?.method === 'POST',
      ),
    ).toBe(true);
    expect(
      calls
        .filter(
          ({ url, options }) =>
            url.includes('/tables/') && options?.method === 'POST',
        )
        .every(({ options }) => {
          const body = JSON.parse(String(options?.body)) as {
            rowId?: string;
            data?: Record<string, unknown>;
          };
          return (
            body.rowId?.startsWith('anon-create-') && body.data !== undefined
          );
        }),
    ).toBe(true);
    expect(
      calls
        .filter(
          ({ url, options }) =>
            url.includes('/buckets/') && options?.method === 'POST',
        )
        .every(
          ({ options }) =>
            options?.body instanceof FormData &&
            String(options.body.get('fileId')).startsWith('anon-create-'),
        ),
    ).toBe(true);
    expect(new Set(result.checks.map((check) => check.name)).size).toBe(39);
    expect(
      result.checks
        .filter((check) => check.name.includes('-POST-'))
        .every((check) => check.expected.join(',') === '401,403'),
    ).toBe(true);
  });

  it('fails a denial reported as 400 or 404', async () => {
    const result = await runAnonymousProbe({
      ...project,
      fetchLike: async () => ({
        ok: false,
        status: 404,
        headers: {},
        text: async () => 'not found',
        json: async () => ({}),
      }),
      guard: {
        databaseId: 'intermed-datasets',
        rows: [{ tableId: 'import-runs', rowId: 'guard-run' }],
        files: [{ bucketId: 'raw-sources', fileId: 'guard-raw' }],
      },
    });

    expect(result.failed).toBeGreaterThan(0);
  });

  it('records Appwrite response type for an HTTP denial', async () => {
    const result = await runAnonymousProbe({
      ...project,
      fetchLike: async () => ({
        ok: false,
        status: 401,
        headers: { 'content-type': 'application/json' },
        text: async () =>
          JSON.stringify({
            type: 'user_unauthorized',
            message: 'This action requires authentication.',
          }),
        json: async () => ({
          type: 'user_unauthorized',
          message: 'This action requires authentication.',
        }),
      }),
      guard: {
        rows: [{ tableId: 'import-runs', rowId: 'guard-run' }],
        files: [],
      },
    });

    expect(result.checks[0]?.observed.errorType).toBe('user_unauthorized');
    expect(result.log).toContain('user_unauthorized');
  });

  it('rejects production project and endpoint targets before fetching', async () => {
    await expect(
      runAnonymousProbe({
        projectId: 'intermed-prod',
        endpoint: 'https://fra.cloud.appwrite.io/v1',
        guard: { rows: [], files: [] },
        fetchLike: async () => {
          throw new Error('must not fetch');
        },
      }),
    ).rejects.toThrow('fixed intermed-dev project');
  });
});

describe('actual Appwrite adapter read recording', () => {
  it('uses the exported adapter and records sanitized payloads', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'intermed-live-'));
    const result = await readPublishedMetadata({
      ...project,
      outputDirectory,
      fetchLike: async (url: string): Promise<ProbeFetchResponse> => ({
        ok: true,
        status: 200,
        headers: { 'content-type': 'application/json' },
        text: async () => '{}',
        json: async () =>
          url.includes('dataset-versions')
            ? { total: 0, rows: [] }
            : { total: 0, rows: [] },
      }),
      dataset: 'synthetic-medication-catalogue',
    });

    expect(result.manifest.status).toBe('absent');
    expect(result.descriptor.status).toBe('absent');
    expect(result.log).not.toMatch(/key|jwt|cookie|token/i);
    expect(await readFile(result.outputPath, 'utf8')).toContain(
      'synthetic-medication-catalogue',
    );
  });
});
