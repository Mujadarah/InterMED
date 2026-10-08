import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterAll, expect, it } from 'vitest';
import type { ShellRelease } from './shell-build';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const webRoot = resolve(repositoryRoot, 'apps/web');
const viteBinary = resolve(repositoryRoot, 'node_modules/vite/bin/vite.js');
const buildDirectory = await mkdtemp(join(tmpdir(), 'intermed-build-output-'));

/** One kilobyte is 1024 bytes; the advisory limit applies above 500 kB. */
const maxChunkBytes = 512_000;
const maxPrecacheAssets = 16;

afterAll(async () => {
  await rm(buildDirectory, { recursive: true, force: true });
});

interface BuildOutput {
  readonly assets: readonly { name: string; bytes: number }[];
  readonly release: ShellRelease;
}

let cached: Promise<BuildOutput> | undefined;

/** Build the public shell into a temporary directory outside the repository. */
async function buildShell(): Promise<BuildOutput> {
  cached ??= (async () => {
    const result = spawnSync(
      process.execPath,
      [viteBinary, 'build', '--outDir', buildDirectory],
      {
        cwd: webRoot,
        encoding: 'utf8',
        // The test runner sets NODE_ENV=test; a public build is a production
        // build, so pin the production build environment explicitly.
        env: { ...process.env, NODE_ENV: 'production' },
      },
    );
    expect(result.status, result.stderr).toBe(0);
    const emitted = await readdir(join(buildDirectory, 'assets'));
    const assets = await Promise.all(
      emitted.map(async (name) => ({
        name,
        bytes: (await stat(join(buildDirectory, 'assets', name))).size,
      })),
    );
    // Evaluate the emitted classic worker to read its public release
    // descriptor, following the pattern used by the worker tests.
    const worker = await readFile(join(buildDirectory, 'sw.js'), 'utf8');
    return {
      assets,
      release: runInNewContext(`${worker}\nSHELL;`, {
        self: { addEventListener: () => {} },
      }) as ShellRelease,
    };
  })();
  return cached;
}

it('emits every JavaScript chunk below the 500 kB advisory limit', async () => {
  const { assets } = await buildShell();
  const chunks = assets.filter((asset) => asset.name.endsWith('.js'));
  expect(chunks.length).toBeGreaterThan(0);
  for (const chunk of chunks)
    expect(
      chunk.bytes,
      `${chunk.name} is ${chunk.bytes} bytes, above the 500 kB limit`,
    ).toBeLessThan(maxChunkBytes);
});

it('precaches every emitted JavaScript and CSS asset', async () => {
  const { assets, release } = await buildShell();
  const precached = new Set(release.assets.map((asset) => asset.url));
  const stylesAndScripts = assets.filter((asset) =>
    /\.(js|css)$/.test(asset.name),
  );
  expect(stylesAndScripts.length).toBeGreaterThan(0);
  for (const asset of stylesAndScripts)
    expect(precached, `/assets/${asset.name} must be precached`).toContain(
      `/assets/${asset.name}`,
    );
});

it('keeps the precached public shell within the sixteen-asset cap', async () => {
  const { release } = await buildShell();
  expect(release.assets.length).toBeLessThanOrEqual(maxPrecacheAssets);
});
