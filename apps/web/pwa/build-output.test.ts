import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { ShellRelease } from './shell-build';
import { maxPrecacheAssets, maxPrecacheBytes } from './shell-budget';
import {
  buildSecurityHeaders,
  buildSwSecurityHeaders,
  headerContentSecurityPolicy,
  metaContentSecurityPolicy,
} from '../security-headers';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const webRoot = resolve(repositoryRoot, 'apps/web');
const viteBinary = resolve(repositoryRoot, 'node_modules/vite/bin/vite.js');
const buildDirectory = await mkdtemp(join(tmpdir(), 'intermed-build-output-'));

/** Vite reports kilobytes as 1 kB = 1,000 bytes, so the 500 kB advisory is 500,000 bytes. */
const maxChunkBytes = 500_000;

/**
 * Effective headers for a request path under Netlify / Cloudflare Pages
 * `_headers` semantics: every matching rule applies, and a header set by
 * more than one rule has its values joined with ", ".
 */
function effectiveHeaders(
  headersFile: string,
  requestPath: string,
): Record<string, string> {
  const effective: Record<string, string[]> = {};
  let matches = false;
  for (const line of headersFile.split('\n')) {
    if (line.trim() === '') continue;
    if (!line.startsWith(' ')) {
      const rule = line.trim();
      matches = rule.endsWith('*')
        ? requestPath.startsWith(rule.slice(0, -1))
        : requestPath === rule;
      continue;
    }
    if (!matches) continue;
    const separator = line.indexOf(':');
    const name = line.slice(0, separator).trim();
    (effective[name] ??= []).push(line.slice(separator + 1).trim());
  }
  return Object.fromEntries(
    Object.entries(effective).map(([name, values]) => [
      name,
      [...new Set(values)].join(', '),
    ]),
  );
}

/** Gzip budgets are baseline measurements plus roughly 15%, rounded up to 100 bytes. */
const gzipBudgets = {
  'CalculatorsPage-[hash].js': 3_600,
  'MedicationDetailPage-[hash].js': 4_800,
  'MedicationSearchPage-[hash].js': 4_000,
  'dexie-vendor-[hash].js': 35_700,
  'framework-vendor-[hash].js': 93_500,
  'index-[hash].css': 3_200,
  'index-[hash].js': 45_500,
  'rolldown-runtime-[hash].js': 500,
  'search-status-[hash].js': 1_200,
  'sw.js': 6_000,
  'zod-vendor-[hash].js': 29_300,
} as const;
const totalGzipBudgetBytes = 226_900;

function stableAssetName(name: string): string {
  return name.replace(/-[\w-]{8}(?=\.(?:js|css)$)/u, '-[hash]');
}

afterAll(async () => {
  await rm(buildDirectory, { recursive: true, force: true });
});

interface BuildOutput {
  readonly assets: readonly {
    name: string;
    bytes: number;
    gzipBytes: number;
  }[];
  readonly release: ShellRelease;
  readonly workerGzipBytes: number;
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
    const emitted = (await readdir(join(buildDirectory, 'assets')))
      .filter((name) => /\.(?:js|css)$/.test(name))
      .sort();
    const assets = await Promise.all(
      emitted.map(async (name) => {
        const bytes = await readFile(join(buildDirectory, 'assets', name));
        return {
          name,
          bytes: (await stat(join(buildDirectory, 'assets', name))).size,
          gzipBytes: gzipSync(bytes).byteLength,
        };
      }),
    );
    // Evaluate the emitted classic worker to read its public release
    // descriptor, following the pattern used by the worker tests.
    const workerBytes = await readFile(join(buildDirectory, 'sw.js'));
    const worker = workerBytes.toString('utf8');
    return {
      assets,
      release: runInNewContext(`${worker}\nSHELL;`, {
        self: { addEventListener: () => {} },
      }) as ShellRelease,
      workerGzipBytes: gzipSync(workerBytes).byteLength,
    };
  })();
  return cached;
}

beforeAll(async () => {
  await buildShell();
}, 180_000);

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

it('enforces per-asset and total gzip budgets for chunks, CSS and the worker', async () => {
  const { assets, workerGzipBytes } = await buildShell();
  const measurements = [
    ...assets.map((asset) => ({
      name: stableAssetName(asset.name),
      actualName: asset.name,
      gzipBytes: asset.gzipBytes,
    })),
    { name: 'sw.js', actualName: 'sw.js', gzipBytes: workerGzipBytes },
  ];
  const labels = new Set(measurements.map((asset) => asset.name));

  for (const asset of measurements) {
    const budgetBytes = gzipBudgets[asset.name as keyof typeof gzipBudgets];
    if (budgetBytes === undefined)
      throw new Error(
        `Missing gzip budget for emitted asset ${asset.actualName}`,
      );
    const overageBytes = Math.max(0, asset.gzipBytes - budgetBytes);
    expect(
      asset.gzipBytes,
      `${asset.actualName} gzip is ${asset.gzipBytes} bytes, exceeding its ${budgetBytes}-byte budget by ${overageBytes} bytes`,
    ).toBeLessThanOrEqual(budgetBytes);
  }
  for (const expectedName of Object.keys(gzipBudgets))
    if (!labels.has(expectedName))
      throw new Error(
        `Expected gzip-budgeted asset ${expectedName} was not emitted`,
      );

  const totalGzipBytes = measurements.reduce(
    (total, asset) => total + asset.gzipBytes,
    0,
  );
  const totalOverageBytes = Math.max(0, totalGzipBytes - totalGzipBudgetBytes);
  console.info(
    `M12_BUNDLE_GZIP ${JSON.stringify({
      assets: measurements.map(({ name, gzipBytes }) => ({
        name,
        measuredGzipBytes: gzipBytes,
        budgetBytes: gzipBudgets[name as keyof typeof gzipBudgets],
      })),
      totalMeasuredGzipBytes: totalGzipBytes,
      totalBudgetBytes: totalGzipBudgetBytes,
      totalOverageBytes,
    })}`,
  );
  expect(
    totalGzipBytes,
    `Total gzip for emitted JavaScript/CSS and sw.js is ${totalGzipBytes} bytes, exceeding its ${totalGzipBudgetBytes}-byte budget by ${totalOverageBytes} bytes`,
  ).toBeLessThanOrEqual(totalGzipBudgetBytes);
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

it('keeps the built index.html meta CSP byte-identical to the source policy', async () => {
  await buildShell();
  const html = await readFile(join(buildDirectory, 'index.html'), 'utf8');
  const match = html.match(
    /<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]*)"[^>]*>/,
  );
  // Vite HTML-escapes the attribute value; decode it before comparing.
  const raw = match?.[1];
  expect(raw).toBeDefined();
  const emitted = (raw ?? '')
    .replaceAll('&#39;', "'")
    .replaceAll('&quot;', '"');
  expect(emitted).toBe(metaContentSecurityPolicy);
});

it('emits _headers and security-headers.json agreeing with buildSecurityHeaders()', async () => {
  await buildShell();
  const headersFile = await readFile(join(buildDirectory, '_headers'), 'utf8');
  const manifest = JSON.parse(
    await readFile(join(buildDirectory, 'security-headers.json'), 'utf8'),
  );
  const headers = buildSecurityHeaders();
  const swHeaders = buildSwSecurityHeaders();
  expect(manifest).toEqual({
    routes: [
      { path: '/*', headers },
      { path: '/sw.js', headers: swHeaders },
    ],
  });
  expect(headersFile).toContain('/*\n');
  expect(headersFile).toContain('/sw.js\n');
  for (const [name, value] of Object.entries(headers))
    expect(headersFile).toContain(`  ${name}: ${value}`);
  expect(headersFile).toContain(
    `  Content-Security-Policy: ${headerContentSecurityPolicy}`,
  );
  expect(headersFile).toContain('  Cache-Control: no-cache');
  // Overlapping rules must resolve to exactly the intended set per route:
  // `/sw.js` also matches `/*`, so every shared header must be identical.
  expect(effectiveHeaders(headersFile, '/')).toEqual(headers);
  expect(effectiveHeaders(headersFile, '/medications/SP-1')).toEqual(headers);
  expect(effectiveHeaders(headersFile, '/sw.js')).toEqual(swHeaders);
  const rawSwValues = headersFile
    .split('\n')
    .filter((line) => line.startsWith('  Content-Security-Policy:'));
  expect(new Set(rawSwValues).size).toBe(1);
});

it('excludes the generated host files from the precache list', async () => {
  const { release } = await buildShell();
  const urls = release.assets.map((asset) => asset.url);
  expect(urls).not.toContain('/_headers');
  expect(urls).not.toContain('/security-headers.json');
  expect(urls).toContain('/index.html');
});

it('reports headroom within the 24-asset / 2 MiB public-shell precache budget', async () => {
  const { release } = await buildShell();
  const sizes = await Promise.all(
    release.assets.map(
      async (asset) =>
        (await stat(join(buildDirectory, asset.url.slice(1)))).size,
    ),
  );
  const bytes = sizes.reduce((total, size) => total + size, 0);
  const report = `Public shell precache budget: ${release.assets.length}/${maxPrecacheAssets} assets, ${bytes}/${maxPrecacheBytes} bytes; headroom: ${maxPrecacheAssets - release.assets.length} assets, ${maxPrecacheBytes - bytes} bytes`;
  console.info(report);
  expect(release.assets.length, report).toBeLessThanOrEqual(maxPrecacheAssets);
  expect(bytes, report).toBeLessThanOrEqual(maxPrecacheBytes);
});
