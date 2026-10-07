import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  prepareSyntheticPublication,
} from '../infra/appwrite/live-acceptance/publication-preparation.mjs';
import {
  runAnonymousProbe,
} from '../infra/appwrite/live-acceptance/anonymous-probe.mjs';
import {
  readPublishedMetadata,
} from '../infra/appwrite/live-acceptance/adapter-read.mjs';

const project = {
  projectId: 'intermed-dev',
  endpoint: 'https://fra.cloud.appwrite.io/v1',
} as const;

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
    expect(result.generation.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.files).toHaveLength(3);
    expect(result.commandPlan.map(({ action }) => action)).toEqual([
      'storage-create-file',
      'table-create-row',
      'table-create-row',
      'publish-after-verification',
    ]);
    expect(result.commandPlan.at(-1)?.automatic).toBe(false);

    const bundle = await readFile(result.files[0]!, 'utf8');
    expect(JSON.parse(bundle).dataSources).toBeDefined();
    expect(result.descriptor.byteSize).toBe(Buffer.byteLength(bundle));
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
    expect(result.guards.rows.every((row) => row.data.status === 'staging')).toBe(
      true,
    );
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
    const calls: Array<{ url: string; options?: Record<string, unknown> }> = [];
    const result = await runAnonymousProbe({
      ...project,
      fetchLike: async (url, options) => {
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
    expect(result.checks).toHaveLength(42);
    expect(calls.every(({ options }) => !JSON.stringify(options).match(/key|jwt|cookie|token/i))).toBe(
      true,
    );
    expect(result.checks.some((check) => check.expected.includes('400'))).toBe(false);
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
});

describe('actual Appwrite adapter read recording', () => {
  it('uses the exported adapter and records sanitized payloads', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'intermed-live-'));
    const result = await readPublishedMetadata({
      ...project,
      outputDirectory,
      fetchLike: async (url) => ({
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
