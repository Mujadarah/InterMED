import { execFileSync } from 'node:child_process';
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
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildImporterFunctionArtifact } from '../../scripts/build-importer-function.mjs';

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

describe('importer function artifact', () => {
  it('builds a disjoint isolated runtime artifact and rejects safely', () => {
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
      expect(packageJson.dependencies).toEqual({
        '@intermed/importer': 'file:vendor/@intermed/importer',
        zod: '4.6.5',
      });
      expect(packageJson.dependencies).not.toHaveProperty('typescript');

      const npm = resolveNpmInvocation();
      execFileSync(
        npm.command,
        [...npm.args, 'ci', '--ignore-scripts', '--offline'],
        {
          cwd: artifact,
          stdio: 'pipe',
        },
      );
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
      expect(artifactFiles).toHaveLength(23);
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

  it('pins function-direct external imports and runs positive offline', () => {
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

      const npm = resolveNpmInvocation();
      execFileSync(
        npm.command,
        [...npm.args, 'ci', '--ignore-scripts', '--offline'],
        { cwd: artifact, stdio: 'pipe' },
      );

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

  it('pins literal dynamic imports and fails closed on computed ones', () => {
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

      const npm = resolveNpmInvocation();
      execFileSync(
        npm.command,
        [...npm.args, 'ci', '--ignore-scripts', '--offline'],
        { cwd: artifact, stdio: 'pipe' },
      );
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
});
