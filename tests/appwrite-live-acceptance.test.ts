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
    expect(result.generation.status).toBe('staging');
    expect(result.generation.checksum).toBe(
      result.snapshot.datasetVersions[0]?.checksum,
    );
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
});

describe('anonymous Appwrite probe', () => {
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
        const privateRequest =
          options?.method === 'POST' ||
          options?.method === 'PATCH' ||
          options?.method === 'DELETE' ||
          url.includes('import-runs') ||
          url.includes('raw-sources') ||
          url.includes('quarantine') ||
          url.includes('import-run-logs');
        return {
          ok: privateRequest ? false : true,
          status: privateRequest ? 403 : 200,
          headers: { 'content-type': 'application/json' },
          text: async () => '{}',
          json: async () => ({ rows: [] }),
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
