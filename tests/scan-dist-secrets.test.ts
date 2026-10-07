import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  listFiles,
  readTextFile,
  repositoryRoot,
} from './support/appwrite-config';

const scanScript = resolve(repositoryRoot, 'scripts/scan-dist-secrets.mjs');
const temporaryDirectories: string[] = [];

/** Create a throwaway directory standing in for the built frontend bundle. */
async function fakeBundleDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'intermed-dist-scan-'));
  temporaryDirectories.push(directory);
  return directory;
}

function runScan(target: string) {
  return spawnSync(process.execPath, [scanScript, target], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('post-build bundle secret scan', () => {
  it('fails when the build output is missing instead of skipping', async () => {
    const missing = join(await fakeBundleDirectory(), 'dist');
    const result = runScan(missing);
    expect(result.status, 'a missing build output must fail the scan').toBe(1);
    expect(result.stderr).toContain('missing');
  });

  it('reports credential-shaped build output without echoing the value', async () => {
    const directory = await fakeBundleDirectory();
    const syntheticKey = ['standard', '_', 'f'.repeat(32)].join('');
    await writeFile(
      join(directory, 'app.js'),
      `export const key = '${syntheticKey}';`,
    );
    const result = runScan(directory);
    expect(result.status, 'credential-shaped output must fail the scan').toBe(
      1,
    );
    expect(result.stderr).toContain('app.js');
    expect(result.stderr).toContain('Appwrite standard_ API key');
    expect(result.stderr).not.toContain(syntheticKey);
  });

  it('passes clean build output', async () => {
    const directory = await fakeBundleDirectory();
    await writeFile(
      join(directory, 'app.js'),
      'export const label = "intermed";',
    );
    const result = runScan(directory);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('no credential-shaped strings');
  });
});

describe('post-build scan wiring', () => {
  it('runs the scan after the build and before the browser tests in check', async () => {
    const manifest = JSON.parse(await readTextFile('package.json')) as {
      scripts: Record<string, string>;
    };
    expect(manifest.scripts['scan:dist']).toBe(
      'node scripts/scan-dist-secrets.mjs',
    );
    const check = manifest.scripts.check ?? '';
    const scan = check.indexOf('npm run scan:dist');
    expect(scan, 'check must run npm run scan:dist').toBeGreaterThan(-1);
    expect(check.indexOf('npm run build')).toBeLessThan(scan);
    expect(scan).toBeLessThan(check.indexOf('npm run test:browser'));
  });

  it('keeps CI on the full check script', async () => {
    const workflows = await listFiles('.github/workflows');
    expect(workflows.length).toBeGreaterThan(0);
    const sources = await Promise.all(
      workflows.map((path) => readTextFile(path)),
    );
    expect(
      sources.some((source) => source.includes('npm run check')),
      'CI must run npm run check, so it runs the post-build scan',
    ).toBe(true);
  });
});
