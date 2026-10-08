import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildImporterFunctionArtifact,
  deriveRuntimeLock,
} from '../../scripts/build-importer-function.mjs';
import {
  integrityDigest,
  matchesIntegrity,
  registryTarballBytes,
} from './registry-tarball';

interface LockEntry {
  version?: string;
  resolved?: string;
  integrity?: string;
  link?: boolean;
  optional?: boolean;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  [key: string]: unknown;
}

interface Lockfile {
  name?: string;
  version?: string;
  lockfileVersion?: number;
  packages: Record<string, LockEntry>;
}

function listFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .map((file) => file.slice(directory.length + 1).replaceAll('\\', '/'))
    .sort();
}

const moduleSpecifierPattern =
  /\bfrom\s+'([^']+)'|\bimport\(\s*'([^']+)'\s*\)|\bimport\s+'([^']+)'/g;

/**
 * Every relative module specifier inside the artifact must resolve to a real
 * file of the artifact and every bare specifier must stay offline-resolvable.
 */
function assertClosedModuleGraph(root: string, files: string[]): void {
  for (const file of files.filter((entry) => entry.endsWith('.js'))) {
    const source = readFileSync(join(root, file), 'utf8');
    for (const match of source.matchAll(moduleSpecifierPattern)) {
      const specifier = match[1] ?? match[2] ?? match[3];
      if (!specifier) continue;
      if (specifier.startsWith('.')) {
        expect(
          existsSync(resolve(dirname(join(root, file)), specifier)),
          `${file} imports missing ${specifier}`,
        ).toBe(true);
      } else {
        expect(
          specifier.startsWith('node:') ||
            specifier.startsWith('@intermed/') ||
            specifier === 'zod',
          `${file} imports unexpected bare specifier ${specifier}`,
        ).toBe(true);
      }
    }
  }
}

function resolveNpmInvocation(): { command: string; args: string[] } {
  const configuredNpm = process.env.npm_execpath;
  const bundledNpm = join(
    dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  );
  const npm = configuredNpm ?? bundledNpm;
  return npm.endsWith('.js')
    ? { command: process.execPath, args: [npm] }
    : { command: npm, args: [] };
}

/**
 * cacache content store path for a digest (npm cache root, `_cacache` inside).
 * The install network boundary itself lives in `registry-tarball.ts`:
 * only the exact https registry.npmjs.org tarball declared by the committed
 * lock may ever be fetched, validated before ANY fetch and SHA512-verified
 * before the bytes are cached (fail closed).
 */
function contentPathFor(cacheRoot: string, integrity: string): string {
  const { algorithm, expected } = integrityDigest(integrity);
  const hex = Buffer.from(expected, 'base64').toString('hex');
  return join(
    cacheRoot,
    '_cacache',
    'content-v2',
    algorithm,
    hex.slice(0, 2),
    hex.slice(2, 4),
    hex.slice(4),
  );
}

/** cacache index bucket path for a key (npm cache root, `_cacache` inside). */
function indexBucketFor(cacheRoot: string, key: string): string {
  const hashed = createHash('sha256').update(key).digest('hex');
  return join(
    cacheRoot,
    '_cacache',
    'index-v5',
    hashed.slice(0, 2),
    hashed.slice(2, 4),
    hashed.slice(4),
  );
}

/**
 * Bounded ambient npm cache roots: the configured npm cache and the platform
 * default only. Never a machine-wide search; the shared cache is read-only.
 */
function ambientNpmCacheRoots(): string[] {
  const roots = new Set<string>();
  if (process.env.npm_config_cache) roots.add(process.env.npm_config_cache);
  if (process.env.LOCALAPPDATA) {
    roots.add(join(process.env.LOCALAPPDATA, 'npm-cache'));
  }
  roots.add(join(homedir(), '.npm'));
  return [...roots];
}

function localTarballBytes(integrity: string): Buffer | null {
  for (const root of ambientNpmCacheRoots()) {
    const path = contentPathFor(root, integrity);
    if (!existsSync(path)) continue;
    const bytes = readFileSync(path);
    if (matchesIntegrity(bytes, integrity)) return bytes;
  }
  return null;
}

/**
 * Install network boundary (disclosed): `npm ci` needs the exact pinned
 * registry tarballs and nothing else — never registry metadata (packuments).
 * Each test installs into a fresh isolated npm cache seeded with only the
 * tarballs named by the artifact lock:
 *   1. exact tarball bytes from the bounded ambient npm cache content store
 *      (integrity-addressed lookup, read-only, no cache warming), else
 *   2. the exact lockfile `resolved` URL is fetched and the bytes are verified
 *      against the committed lock integrity before use (fail closed).
 * The seeded cache is removed after the install; the shared cache is untouched.
 */
async function seedInstallCache(cacheRoot: string, lock: Lockfile) {
  const provenance: string[] = [];
  for (const entry of Object.values(lock.packages)) {
    if (!entry.resolved || !/^https?:/.test(entry.resolved)) continue;
    if (!entry.integrity) {
      throw new Error(`Registry entry without integrity: ${entry.resolved}`);
    }
    const local = localTarballBytes(entry.integrity);
    const bytes =
      local ?? (await registryTarballBytes(entry.resolved, entry.integrity));
    provenance.push(
      `${entry.resolved} <- ${local ? 'bounded local cache' : 'registry tarball (verified)'}`,
    );
    const target = contentPathFor(cacheRoot, entry.integrity);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    const key = `make-fetch-happen:request-cache:${entry.resolved}`;
    const bucket = indexBucketFor(cacheRoot, key);
    const record = {
      key,
      integrity: entry.integrity,
      time: Date.now(),
      size: bytes.length,
      metadata: {
        time: Date.now(),
        url: entry.resolved,
        reqHeaders: {},
        resHeaders: {
          'cache-control': 'public, immutable, max-age=31557600',
          'content-type': 'application/octet-stream',
          date: new Date().toUTCString(),
        },
        options: { compress: true },
      },
    };
    const stringified = JSON.stringify(record);
    const entryHash = createHash('sha1').update(stringified).digest('hex');
    mkdirSync(dirname(bucket), { recursive: true });
    writeFileSync(bucket, `\n${entryHash}\t${stringified}`, { flag: 'a' });
  }
  return provenance;
}

async function installArtifactOffline(artifact: string): Promise<string[]> {
  const lock = JSON.parse(
    readFileSync(join(artifact, 'package-lock.json'), 'utf8'),
  ) as Lockfile;
  const cacheRoot = mkdtempSync(join(tmpdir(), 'intermed-artifact-npm-cache-'));
  try {
    const provenance = await seedInstallCache(cacheRoot, lock);
    const npm = resolveNpmInvocation();
    execFileSync(
      npm.command,
      [
        ...npm.args,
        'ci',
        '--ignore-scripts',
        '--offline',
        '--no-audit',
        '--no-fund',
        '--cache',
        cacheRoot,
      ],
      { cwd: artifact, stdio: 'pipe' },
    );
    return provenance;
  } finally {
    rmSync(cacheRoot, { recursive: true, force: true });
  }
}

function readRootLock(): Lockfile {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), 'package-lock.json'), 'utf8'),
  ) as Lockfile;
}

describe('importer function artifact', () => {
  it('builds a disjoint isolated runtime artifact and rejects safely', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'intermed-artifact-test-'));
    const canary = join(parent, 'unrelated-canary.txt');
    const secretCanary = join(parent, '.env');
    writeFileSync(canary, 'preserve me');
    writeFileSync(
      secretCanary,
      'INTERMED_SERVER_KEY=fake-secret-canary-not-a-real-key\n',
    );

    try {
      const artifact = buildImporterFunctionArtifact({ outputParent: parent });
      expect(artifact).not.toBe(parent);
      expect(readFileSync(canary, 'utf8')).toBe('preserve me');

      const packageJson = JSON.parse(
        readFileSync(join(artifact, 'package.json'), 'utf8'),
      ) as { main: string; dependencies: Record<string, string> };
      expect(packageJson.main).toBe('./src/main.js');
      const defaultMainSource = readFileSync(
        resolve(
          process.cwd(),
          'infra/appwrite/functions/import-anmdmr/src/main.js',
        ),
        'utf8',
      );
      expect(packageJson.dependencies).toEqual(
        defaultMainSource.includes('@intermed/domain')
          ? {
              '@intermed/domain': 'file:vendor/@intermed/domain',
              '@intermed/importer': 'file:vendor/@intermed/importer',
              zod: '4.6.5',
            }
          : {
              '@intermed/importer': 'file:vendor/@intermed/importer',
              zod: '4.6.5',
            },
      );
      expect(packageJson.dependencies).not.toHaveProperty('typescript');

      await installArtifactOffline(artifact);
      const files = listFiles(artifact);
      expect(files).toContain('src/main.js');
      expect(files).toContain('vendor/@intermed/domain/package.json');
      expect(files).toContain('vendor/@intermed/data-access/package.json');
      expect(files).toContain('vendor/@intermed/importer/package.json');
      expect(files).toContain('package-lock.json');
      const artifactFiles = files.filter(
        (file) => !file.startsWith('node_modules/'),
      );
      // Bounded closure contract: the payload stays the small derived
      // closure (23 files for the current entry), never a whole-source copy.
      if (defaultMainSource.includes('@intermed/domain')) {
        expect(artifactFiles.length).toBeGreaterThanOrEqual(23);
      } else {
        expect(artifactFiles).toHaveLength(23);
      }
      expect(artifactFiles.some((file) => /\.(ts|map|d\.ts)$/.test(file))).toBe(
        false,
      );
      expect(
        artifactFiles.some((file) =>
          /(^|\/)(test|tests|\.env|\.claude|\.worktrees)(\/|$)/.test(file),
        ),
      ).toBe(false);
      expect(files).not.toContain(
        'vendor/@intermed/data-access/src/published-dataset-mock.js',
      );
      expect(files).not.toContain(
        'vendor/@intermed/data-access/src/synthetic-fixture.js',
      );
      expect(files).not.toContain(
        'vendor/@intermed/data-access/src/in-memory-catalogue-source.js',
      );
      expect(
        artifactFiles.some((file) =>
          /(^|\/)(mock|fixture|in-memory)/i.test(file),
        ),
      ).toBe(false);
      expect(files).toContain(
        'vendor/@intermed/data-access/src/validate-synthetic-source.js',
      );
      // Barrel surfaces must be derived from the closure, never hand-copied.
      const dataAccessIndex = readFileSync(
        join(artifact, 'vendor/@intermed/data-access/src/index.js'),
        'utf8',
      );
      expect(dataAccessIndex).not.toContain('synthetic-fixture');
      expect(dataAccessIndex).not.toContain('published-dataset-mock');
      expect(dataAccessIndex).not.toContain('in-memory-catalogue-source');
      expect(dataAccessIndex).not.toContain('mockBootstrapProvider');
      assertClosedModuleGraph(artifact, artifactFiles);
      expect(artifactFiles.join('\n')).not.toContain('fake-secret-canary');

      const machinePath = /([A-Za-z]:\\|\/(?:Users|home|tmp)\/)/;
      const mainSource = readFileSync(join(artifact, 'src/main.js'), 'utf8');
      expect(mainSource).not.toMatch(machinePath);
      for (const relative of artifactFiles.filter((file) =>
        file.endsWith('.js'),
      )) {
        expect(readFileSync(join(artifact, relative), 'utf8')).not.toMatch(
          machinePath,
        );
      }

      const lock = JSON.parse(
        readFileSync(join(artifact, 'package-lock.json'), 'utf8'),
      ) as {
        packages: Record<string, { dependencies?: Record<string, string> }>;
      };
      expect(lock.packages['']?.dependencies).not.toHaveProperty('typescript');

      // Runner lives inside the artifact so package resolution uses its node_modules,
      // not the parent temp dir or the repository workspace.
      const runnerContent = `
        const { default: handler } = await import('./src/main.js');
        const { serializeCatalogue, deserializeCatalogue } = await import('@intermed/domain');
        const { validateSyntheticSource } = await import('@intermed/data-access');
        const { generateCandidate } = await import('@intermed/importer');
        if (typeof serializeCatalogue !== 'function' ||
            typeof deserializeCatalogue !== 'function' ||
            typeof validateSyntheticSource !== 'function' ||
            typeof generateCandidate !== 'function') throw new Error('public package import failed');
        const rejected = deserializeCatalogue('{"not":"a-catalogue"}');
        if (rejected.ok) throw new Error('expected fail-closed deserialize');
        const fictionalSnapshot = {
          dataSources: [],
          datasetVersions: [],
          products: [],
          activeIngredients: [],
          medicationIngredients: [],
          atcCodes: [],
          dosageForms: [],
          manufacturers: [],
          marketingAuthorizationHolders: [],
          regulatoryDocuments: [],
        };
        const serialized = serializeCatalogue(fictionalSnapshot);
        const roundtrip = deserializeCatalogue(serialized);
        if (!roundtrip.ok) throw new Error('expected valid roundtrip deserialize');
        let networkCalls = 0;
        globalThis.fetch = async () => { networkCalls += 1; throw new Error('network'); };
        const calls = [];
        await handler({
          req: { method: 'GET' },
          res: { json: (body, status) => calls.push({ body, status }) },
          log: (message) => calls.push({ message }),
        });
        if (calls.at(-1)?.status !== 405) throw new Error('safe rejection failed');
        if (networkCalls !== 0) throw new Error('unexpected network call');
        console.log(JSON.stringify({ status: calls.at(-1).status, deserializeOk: rejected.ok, roundtripOk: roundtrip.ok }));
      `;

      const runner = join(artifact, '.isolated-smoke-runner.mjs');
      writeFileSync(runner, runnerContent);
      try {
        execFileSync(process.execPath, [runner], {
          cwd: artifact,
          env: { ...process.env, APPWRITE_FUNCTION_PROJECT_ID: undefined },
          encoding: 'utf8',
        });
      } finally {
        rmSync(runner, { force: true });
      }

      // Verify copied artifact executes in an independent detached location
      const copied = join(parent, 'copied-artifact');
      cpSync(artifact, copied, { recursive: true });
      const copiedRunner = join(copied, '.isolated-smoke-runner.mjs');
      writeFileSync(copiedRunner, runnerContent);
      try {
        execFileSync(process.execPath, [copiedRunner], {
          cwd: copied,
          env: { ...process.env, APPWRITE_FUNCTION_PROJECT_ID: undefined },
          encoding: 'utf8',
        });
      } finally {
        rmSync(copiedRunner, { force: true });
      }

      const second = buildImporterFunctionArtifact({ outputParent: parent });
      expect(second).not.toBe(artifact);
      expect(readFileSync(canary, 'utf8')).toBe('preserve me');
      expect(readFileSync(secretCanary, 'utf8')).toContain(
        'fake-secret-canary',
      );
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  }, 60_000);

  it('builds under the OS temp directory when no output parent is supplied', () => {
    // TEMP/TMP are unset (and restored afterwards) so the default parent must
    // come from the OS itself, never from an inherited override, and the
    // generated child must never land inside the repository.
    const priorTemp = process.env.TEMP;
    const priorTmp = process.env.TMP;
    delete process.env.TEMP;
    delete process.env.TMP;
    let artifact = '';
    try {
      artifact = buildImporterFunctionArtifact();
      // The generated child sits directly under the OS temp directory...
      expect(resolve(dirname(artifact)).toLowerCase()).toBe(
        resolve(tmpdir()).toLowerCase(),
      );
      expect(basename(artifact).startsWith('intermed-importer-function-')).toBe(
        true,
      );
      // ...and never inside this repository.
      expect(
        resolve(artifact)
          .toLowerCase()
          .startsWith(`${resolve(process.cwd()).toLowerCase()}${sep}`),
      ).toBe(false);
      expect(existsSync(join(artifact, 'src/main.js'))).toBe(true);
    } finally {
      // Cleanup removes only the verified generated child, never its parent.
      if (basename(artifact).startsWith('intermed-importer-function-'))
        rmSync(artifact, { recursive: true, force: true });
      if (priorTemp === undefined) delete process.env.TEMP;
      else process.env.TEMP = priorTemp;
      if (priorTmp === undefined) delete process.env.TMP;
      else process.env.TMP = priorTmp;
    }
  }, 60_000);

  it('copies function relative JS helpers transitively into src/', () => {
    const parent = mkdtempSync(join(tmpdir(), 'intermed-artifact-helpers-'));
    const functionSourceDir = join(parent, 'function-src');
    mkdirSync(join(functionSourceDir, 'helpers'), { recursive: true });
    writeFileSync(
      join(functionSourceDir, 'main.js'),
      [
        "import { generateCandidate } from '@intermed/importer';",
        "import { readStoreDocument } from './appwrite-store.js';",
        '',
        'export default async ({ req, res }) => {',
        "  if (req.method !== 'POST') {",
        "    return res.json({ error: 'Method not allowed' }, 405);",
        '  }',
        '  const stored = readStoreDocument();',
        '  return res.json({ stored, staged: generateCandidate() }, 200);',
        '};',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(functionSourceDir, 'appwrite-store.js'),
      [
        "import { createStoreClient } from './helpers/store-client.js';",
        '',
        'export function readStoreDocument() {',
        "  return createStoreClient().read('synthetic-doc');",
        '}',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(functionSourceDir, 'helpers', 'store-client.js'),
      [
        'export function createStoreClient() {',
        '  return { read: (id) => `synthetic:${id}` };',
        '}',
        '',
      ].join('\n'),
    );

    try {
      const artifact = buildImporterFunctionArtifact({
        outputParent: parent,
        functionSourceDir,
      });
      const files = listFiles(artifact);
      expect(files).toContain('src/main.js');
      expect(files).toContain('src/appwrite-store.js');
      expect(files).toContain('src/helpers/store-client.js');

      const artifactFiles = files.filter(
        (file) => !file.startsWith('node_modules/'),
      );
      assertClosedModuleGraph(artifact, artifactFiles);
      const machinePath = /([A-Za-z]:\\|\/(?:Users|home|tmp)\/)/;
      for (const relative of artifactFiles.filter((file) =>
        file.endsWith('.js'),
      )) {
        expect(readFileSync(join(artifact, relative), 'utf8')).not.toMatch(
          machinePath,
        );
      }
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  }, 60_000);

  it.each([
    [
      "export { presentField as field } from '@intermed/domain';",
      'module.field',
    ],
    [
      "export * as domain from '@intermed/domain';",
      'module.domain.presentField',
    ],
    ["export * from '@intermed/domain';", 'module.presentField'],
  ])(
    'includes function re-exports in the runtime closure: %s',
    async (source, access) => {
      const parent = mkdtempSync(join(tmpdir(), 'intermed-artifact-reexport-'));
      const functionSourceDir = join(parent, 'function-src');
      mkdirSync(functionSourceDir);
      writeFileSync(
        join(functionSourceDir, 'main.js'),
        "export * from './exports.js';",
      );
      writeFileSync(join(functionSourceDir, 'exports.js'), source);
      try {
        const artifact = buildImporterFunctionArtifact({
          outputParent: parent,
          functionSourceDir,
        });
        await installArtifactOffline(artifact);
        const runner = join(artifact, '.reexport-smoke.mjs');
        writeFileSync(
          runner,
          `
        import assert from 'node:assert/strict';
        const module = await import('./src/main.js');
        assert.deepEqual(${access}('synthetic'), { status: 'present', value: 'synthetic' });
      `,
        );
        execFileSync(process.execPath, [runner], {
          cwd: artifact,
          stdio: 'pipe',
        });
      } finally {
        rmSync(parent, { recursive: true, force: true });
      }
    },
    60_000,
  );

  it('pins function-direct external imports and runs positive offline', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'intermed-artifact-external-'));
    const functionSourceDir = join(parent, 'function-src');
    mkdirSync(functionSourceDir, { recursive: true });
    writeFileSync(
      join(functionSourceDir, 'main.js'),
      [
        "import { z } from 'zod';",
        '',
        'const payloadSchema = z.object({ sourceKey: z.string() });',
        '',
        'export default async ({ req, res, log }) => {',
        "  if (req.method !== 'POST') {",
        "    return res.json({ error: 'Method not allowed' }, 405);",
        '  }',
        '  const parsed = payloadSchema.parse(req.body);',
        '  log(`validated ${parsed.sourceKey}`);',
        '  return res.json({ ok: true, sourceKey: parsed.sourceKey }, 200);',
        '};',
        '',
      ].join('\n'),
    );

    try {
      const artifact = buildImporterFunctionArtifact({
        outputParent: parent,
        functionSourceDir,
      });
      const packageJson = JSON.parse(
        readFileSync(join(artifact, 'package.json'), 'utf8'),
      ) as { main: string; dependencies: Record<string, string> };
      expect(packageJson.main).toBe('./src/main.js');
      expect(packageJson.dependencies).toEqual({ zod: '4.6.5' });

      await installArtifactOffline(artifact);

      const runner = join(artifact, '.external-smoke-runner.mjs');
      writeFileSync(
        runner,
        `
          const { default: handler } = await import('./src/main.js');
          const calls = [];
          await handler({
            req: { method: 'POST', body: { sourceKey: 'Synthetica' } },
            res: { json: (body, status) => calls.push({ body, status }) },
            log: () => {},
          });
          const last = calls.at(-1);
          if (last?.status !== 200) throw new Error('positive import path failed');
          if (last.body.sourceKey !== 'Synthetica') throw new Error('zod parse failed');
          console.log(JSON.stringify(last));
        `,
      );
      try {
        const output = execFileSync(process.execPath, [runner], {
          cwd: artifact,
          encoding: 'utf8',
          env: { ...process.env, APPWRITE_FUNCTION_PROJECT_ID: undefined },
        });
        expect(output).toContain('"status":200');
      } finally {
        rmSync(runner, { force: true });
      }

      expect(
        listFiles(artifact).filter((file) => !file.startsWith('node_modules/')),
      ).toEqual(['package-lock.json', 'package.json', 'src/main.js']);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  }, 60_000);

  it('fails closed on unpinned function dependencies', () => {
    const parent = mkdtempSync(join(tmpdir(), 'intermed-artifact-unpinned-'));
    const functionSourceDir = join(parent, 'function-src');
    mkdirSync(functionSourceDir, { recursive: true });
    writeFileSync(
      join(functionSourceDir, 'main.js'),
      [
        "import 'unlisted-dependency-canary';",
        '',
        'export default async ({ res }) => res.json({ ok: true }, 200);',
        '',
      ].join('\n'),
    );

    try {
      expect(() =>
        buildImporterFunctionArtifact({
          outputParent: parent,
          functionSourceDir,
        }),
      ).toThrow(/pin/i);
      expect(listFiles(parent)).toEqual(['function-src/main.js']);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  }, 60_000);

  it('pins literal dynamic imports and fails closed on computed ones', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'intermed-artifact-dynamic-'));
    const functionSourceDir = join(parent, 'function-src');
    mkdirSync(functionSourceDir, { recursive: true });
    writeFileSync(
      join(functionSourceDir, 'main.js'),
      [
        'export default async ({ req, res }) => {',
        "  if (req.method !== 'POST') {",
        "    return res.json({ error: 'Method not allowed' }, 405);",
        '  }',
        "  const { z } = await import('zod');",
        "  return res.json({ ok: z.string().parse('Synthetica') }, 200);",
        '};',
        '',
      ].join('\n'),
    );

    try {
      const artifact = buildImporterFunctionArtifact({
        outputParent: parent,
        functionSourceDir,
      });
      const packageJson = JSON.parse(
        readFileSync(join(artifact, 'package.json'), 'utf8'),
      ) as { dependencies: Record<string, string> };
      expect(packageJson.dependencies).toEqual({ zod: '4.6.5' });

      await installArtifactOffline(artifact);
      const runner = join(artifact, '.dynamic-smoke-runner.mjs');
      writeFileSync(
        runner,
        `
          const { default: handler } = await import('./src/main.js');
          const calls = [];
          await handler({
            req: { method: 'POST', body: {} },
            res: { json: (body, status) => calls.push({ body, status }) },
          });
          const last = calls.at(-1);
          if (last?.status !== 200 || last.body.ok !== 'Synthetica') {
            throw new Error('dynamic literal import path failed');
          }
          console.log(JSON.stringify(last));
        `,
      );
      try {
        const output = execFileSync(process.execPath, [runner], {
          cwd: artifact,
          encoding: 'utf8',
        });
        expect(output).toContain('"status":200');
      } finally {
        rmSync(runner, { force: true });
      }
      rmSync(artifact, { recursive: true, force: true });

      writeFileSync(
        join(functionSourceDir, 'main.js'),
        [
          "const specifier = 'zod';",
          'const loaded = await import(specifier);',
          'export default async ({ res }) => res.json({ ok: !!loaded }, 200);',
          '',
        ].join('\n'),
      );
      expect(() =>
        buildImporterFunctionArtifact({
          outputParent: parent,
          functionSourceDir,
        }),
      ).toThrow(/[Cc]omputed dynamic import/);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  }, 60_000);

  it('pins the exact handler runtime root dependencies without registry metadata', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'intermed-artifact-handler-'));
    const functionSourceDir = join(parent, 'function-src');
    mkdirSync(functionSourceDir, { recursive: true });
    // The deployed handler surface: @intermed/domain + @intermed/importer
    // directly (zod enters transitively through the derived runtime closure).
    writeFileSync(
      join(functionSourceDir, 'main.js'),
      [
        "import { deserializeCatalogue, serializeCatalogue } from '@intermed/domain';",
        "import { publish, stage } from '@intermed/importer';",
        "import { readTrustedRuntime } from './runtime-config.js';",
        '',
        'export default async ({ req, res, log }) => {',
        '  if (req.method !== "POST") {',
        '    return res.json({ error: "Method not allowed" }, 405);',
        '  }',
        '  const parsed = deserializeCatalogue(req.body);',
        '  if (!parsed.ok) {',
        '    return res.json({ error: "Rejected" }, 400);',
        '  }',
        '  const runtime = readTrustedRuntime(process.env);',
        '  log(`handler ${typeof stage}/${typeof publish}`);',
        '  return res.json(',
        '    {',
        '      runtime,',
        '      coreReady: typeof stage === "function" && typeof publish === "function",',
        '      roundtripOk: !!deserializeCatalogue(serializeCatalogue(parsed.snapshot)).ok,',
        '    },',
        '    200,',
        '  );',
        '};',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(functionSourceDir, 'runtime-config.js'),
      [
        "import crypto from 'node:crypto';",
        '',
        'export function readTrustedRuntime(env) {',
        '  return {',
        '    project: env.APPWRITE_FUNCTION_PROJECT_ID || "intermed-dev",',
        '    digest: crypto',
        '      .createHash("sha256")',
        '      .update("synthetic-runtime")',
        '      .digest("hex")',
        '      .slice(0, 8),',
        '  };',
        '}',
        '',
      ].join('\n'),
    );

    const emptyCache = join(parent, 'empty-npm-cache');
    mkdirSync(emptyCache, { recursive: true });
    const previousCache = process.env.npm_config_cache;
    const previousOffline = process.env.npm_config_offline;
    const previousRegistry = process.env.npm_config_registry;
    // Lock generation reads the committed root lockfile only. An empty npm
    // cache plus offline mode leaves no registry metadata to resolve against.
    process.env.npm_config_cache = emptyCache;
    process.env.npm_config_offline = 'true';
    process.env.npm_config_registry = 'http://127.0.0.1:9/unreachable';

    let artifact = '';
    let secondArtifact = '';
    try {
      artifact = buildImporterFunctionArtifact({
        outputParent: parent,
        functionSourceDir,
      });
      secondArtifact = buildImporterFunctionArtifact({
        outputParent: parent,
        functionSourceDir,
      });
    } finally {
      const restore = (key: string, value: string | undefined) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      };
      restore('npm_config_cache', previousCache);
      restore('npm_config_offline', previousOffline);
      restore('npm_config_registry', previousRegistry);
    }

    try {
      const packageJson = JSON.parse(
        readFileSync(join(artifact, 'package.json'), 'utf8'),
      ) as { main: string; dependencies: Record<string, string> };
      expect(packageJson.main).toBe('./src/main.js');
      expect(packageJson.dependencies).toEqual({
        '@intermed/domain': 'file:vendor/@intermed/domain',
        '@intermed/importer': 'file:vendor/@intermed/importer',
        zod: '4.6.5',
      });

      const lockText = readFileSync(
        join(artifact, 'package-lock.json'),
        'utf8',
      );
      expect(
        readFileSync(join(secondArtifact, 'package-lock.json'), 'utf8'),
      ).toBe(lockText);
      const lock = JSON.parse(lockText) as Lockfile;
      expect(lock.lockfileVersion).toBe(3);
      expect(lock.packages['']?.dependencies).toEqual(packageJson.dependencies);
      const rootLock = readRootLock();
      const rootZod = rootLock.packages['node_modules/zod'];
      expect(rootZod?.integrity).toBeTruthy();
      expect(lock.packages['node_modules/zod']).toEqual({
        version: rootZod?.version,
        resolved: rootZod?.resolved,
        integrity: rootZod?.integrity,
      });
      for (const name of ['domain', 'data-access', 'importer']) {
        expect(lock.packages[`node_modules/@intermed/${name}`]).toEqual({
          resolved: `vendor/@intermed/${name}`,
          link: true,
        });
        expect(lock.packages[`vendor/@intermed/${name}`]?.name).toBe(
          `@intermed/${name}`,
        );
      }
      expect(lockText).not.toContain('typescript');

      // Install network boundary: exactly one pinned tarball, nothing else.
      const provenance = await installArtifactOffline(artifact);
      expect(provenance).toHaveLength(1);
      expect(provenance.join('\n')).toContain(String(rootZod?.resolved));

      const artifactFiles = listFiles(artifact).filter(
        (file) => !file.startsWith('node_modules/'),
      );
      expect(artifactFiles).toContain('src/main.js');
      expect(artifactFiles).toContain('src/runtime-config.js');
      assertClosedModuleGraph(artifact, artifactFiles);

      const runner = join(artifact, '.handler-surface-runner.mjs');
      writeFileSync(
        runner,
        `
          const { default: handler } = await import('./src/main.js');
          const { serializeCatalogue } = await import('@intermed/domain');
          const { z } = await import('zod');
          if (typeof serializeCatalogue !== 'function' || !z) {
            throw new Error('root dependency closure import failed');
          }
          let networkCalls = 0;
          globalThis.fetch = async () => { networkCalls += 1; throw new Error('network'); };
          const calls = [];
          const invoke = (method, body) => handler({
            req: { method, body },
            res: { json: (payload, status) => calls.push({ body: payload, status }) },
            log: () => {},
          });
          await invoke('GET', undefined);
          if (calls.at(-1)?.status !== 405) throw new Error('safe rejection failed');
          await invoke('POST', '{"not":"a-catalogue"}');
          if (calls.at(-1)?.status !== 400) throw new Error('fail-closed deserialize failed');
          const fictionalSnapshot = {
            dataSources: [],
            datasetVersions: [],
            products: [],
            activeIngredients: [],
            medicationIngredients: [],
            atcCodes: [],
            dosageForms: [],
            manufacturers: [],
            marketingAuthorizationHolders: [],
            regulatoryDocuments: [],
          };
          await invoke('POST', serializeCatalogue(fictionalSnapshot));
          const last = calls.at(-1);
          if (last?.status !== 200 || last.body.coreReady !== true || last.body.roundtripOk !== true) {
            throw new Error('handler surface failed: ' + JSON.stringify(last));
          }
          if (networkCalls !== 0) throw new Error('unexpected network call');
          console.log(JSON.stringify(last));
        `,
      );
      try {
        const output = execFileSync(process.execPath, [runner], {
          cwd: artifact,
          encoding: 'utf8',
          env: { ...process.env, APPWRITE_FUNCTION_PROJECT_ID: 'intermed-dev' },
        });
        expect(output).toContain('"coreReady":true');
      } finally {
        rmSync(runner, { force: true });
      }
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  }, 60_000);
});

describe('derived runtime lock', () => {
  const rootManifest = {
    name: 'intermed-import-anmdmr',
    version: '1.0.0',
    dependencies: {
      '@intermed/domain': 'file:vendor/@intermed/domain',
      '@intermed/importer': 'file:vendor/@intermed/importer',
      zod: '4.6.5',
    },
  };
  const vendorManifests = [
    {
      path: 'vendor/@intermed/domain',
      manifest: { name: '@intermed/domain', dependencies: {} },
    },
    {
      path: 'vendor/@intermed/importer',
      manifest: {
        name: '@intermed/importer',
        dependencies: { '@intermed/domain': 'file:../domain' },
      },
    },
  ];
  const [domainVendor, importerVendor] = vendorManifests;
  if (!domainVendor || !importerVendor) {
    throw new Error('Test fixtures missing');
  }
  const zodRegistryEntry = {
    version: '4.6.5',
    resolved: 'https://registry.npmjs.org/zod/-/zod-4.6.5.tgz',
    integrity: 'sha512-synthetic-zod-digest',
    dependencies: { 'synthetica-core': '1.2.3' },
    optionalDependencies: { 'fictivol-optional': '2.0.0' },
  };
  const rootLock = {
    name: 'intermed',
    version: '0.0.0',
    lockfileVersion: 3,
    packages: {
      'node_modules/zod': zodRegistryEntry,
      'node_modules/synthetica-core': {
        version: '1.2.3',
        resolved:
          'https://registry.npmjs.org/synthetica-core/-/synthetica-core-1.2.3.tgz',
        integrity: 'sha512-synthetic-synthetica-digest',
      },
      'node_modules/fictivol-optional': {
        version: '2.0.0',
        resolved:
          'https://registry.npmjs.org/fictivol-optional/-/fictivol-optional-2.0.0.tgz',
        integrity: 'sha512-synthetic-fictivol-digest',
      },
    },
  };
  const derive = (overrides: {
    rootLock?: Lockfile;
    rootManifest?: {
      name: string;
      version: string;
      dependencies?: Record<string, string>;
    };
    vendorManifests?: Array<{
      path: string;
      manifest: {
        name: string;
        version?: string;
        dependencies?: Record<string, string>;
      };
    }>;
  }) =>
    deriveRuntimeLock({
      rootLock: overrides.rootLock ?? rootLock,
      rootManifest: overrides.rootManifest ?? rootManifest,
      vendorManifests: overrides.vendorManifests ?? vendorManifests,
    }) as Lockfile;

  it('keeps the exact transitive closure with root registry integrity', () => {
    const lock = derive({});
    expect(lock.lockfileVersion).toBe(3);
    expect(Object.keys(lock.packages).sort()).toEqual([
      '',
      'node_modules/@intermed/domain',
      'node_modules/@intermed/importer',
      'node_modules/fictivol-optional',
      'node_modules/synthetica-core',
      'node_modules/zod',
      'vendor/@intermed/domain',
      'vendor/@intermed/importer',
    ]);
    expect(lock.packages['node_modules/zod']).toEqual({
      version: '4.6.5',
      resolved: 'https://registry.npmjs.org/zod/-/zod-4.6.5.tgz',
      integrity: 'sha512-synthetic-zod-digest',
    });
    expect(lock.packages['node_modules/synthetica-core']).toEqual({
      version: '1.2.3',
      resolved:
        'https://registry.npmjs.org/synthetica-core/-/synthetica-core-1.2.3.tgz',
      integrity: 'sha512-synthetic-synthetica-digest',
    });
    expect(lock.packages['node_modules/fictivol-optional']).toEqual({
      version: '2.0.0',
      resolved:
        'https://registry.npmjs.org/fictivol-optional/-/fictivol-optional-2.0.0.tgz',
      integrity: 'sha512-synthetic-fictivol-digest',
      optional: true,
    });
    expect(lock.packages['node_modules/@intermed/domain']).toEqual({
      resolved: 'vendor/@intermed/domain',
      link: true,
    });
    expect(JSON.stringify(lock, null, 2)).toBe(
      JSON.stringify(derive({}), null, 2),
    );
  });

  it('fails closed on unpinned and mismatched external dependencies', () => {
    expect(() =>
      derive({
        rootManifest: {
          ...rootManifest,
          dependencies: {
            ...rootManifest.dependencies,
            'unlisted-dependency-canary': '1.0.0',
          },
        },
      }),
    ).toThrow(/pin/i);
    expect(() =>
      derive({
        rootManifest: {
          ...rootManifest,
          dependencies: { ...rootManifest.dependencies, zod: '4.0.0' },
        },
      }),
    ).toThrow(/pin/i);
    expect(() =>
      derive({
        vendorManifests: [
          {
            path: 'vendor/@intermed/domain',
            manifest: {
              name: '@intermed/domain',
              dependencies: { 'unlisted-dependency-canary': '1.0.0' },
            },
          },
          importerVendor,
        ],
      }),
    ).toThrow(/pin/i);
  });

  it('fails closed on incomplete, conflicting or unsupported registry pins', () => {
    expect(() =>
      derive({
        rootLock: {
          ...rootLock,
          packages: {
            ...rootLock.packages,
            'node_modules/zod': {
              version: '4.6.5',
              resolved: 'https://registry.npmjs.org/zod/-/zod-4.6.5.tgz',
            },
          },
        },
      }),
    ).toThrow(/integrity/i);
    expect(() =>
      derive({
        rootLock: {
          ...rootLock,
          packages: {
            ...rootLock.packages,
            'node_modules/zod': {
              ...zodRegistryEntry,
              dependencies: {
                'synthetica-core': '1.2.3',
                'fictivol-parent': '1.0.0',
              },
            },
            'node_modules/fictivol-parent': {
              version: '1.0.0',
              resolved:
                'https://registry.npmjs.org/fictivol-parent/-/fictivol-parent-1.0.0.tgz',
              integrity: 'sha512-synthetic-parent-digest',
              dependencies: { 'synthetica-core': '3.0.0' },
            },
            'node_modules/fictivol-parent/node_modules/synthetica-core': {
              version: '3.0.0',
              resolved:
                'https://registry.npmjs.org/synthetica-core/-/synthetica-core-3.0.0.tgz',
              integrity: 'sha512-synthetic-nested-digest',
            },
          },
        },
      }),
    ).toThrow(/[Cc]onflicting/);
    expect(() =>
      derive({
        rootLock: {
          ...rootLock,
          packages: {
            ...rootLock.packages,
            'node_modules/zod': {
              ...zodRegistryEntry,
              peerDependencies: { 'placebex-peer': '1.0.0' },
            },
          },
        },
      }),
    ).toThrow(/peer/i);
    expect(() =>
      derive({
        rootLock: {
          ...rootLock,
          packages: {
            'node_modules/zod': zodRegistryEntry,
            'node_modules/fictivol-optional':
              rootLock.packages['node_modules/fictivol-optional'],
          },
        },
      }),
    ).toThrow(/synthetica-core/);
  });

  it('fails closed when a workspace dependency leaves the vendored closure', () => {
    expect(() =>
      derive({
        vendorManifests: [
          domainVendor,
          {
            path: 'vendor/@intermed/importer',
            manifest: {
              name: '@intermed/importer',
              dependencies: { '@intermed/domain': 'file:../not-vendored' },
            },
          },
        ],
      }),
    ).toThrow(/vendored/);
    expect(() =>
      derive({
        vendorManifests: [
          domainVendor,
          {
            path: 'vendor/@intermed/importer',
            manifest: {
              name: '@intermed/importer',
              dependencies: { '@intermed/data-access': 'file:../data-access' },
            },
          },
        ],
      }),
    ).toThrow(/missing vendored package/);
  });
});
