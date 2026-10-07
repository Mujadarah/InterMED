import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appwriteConfigPaths,
  listFiles,
  readTextFile,
  repositoryRoot,
} from './support/appwrite-config';
import { findCredentialShape } from './support/secret-scan';

async function directoryExists(relativePath: string): Promise<boolean> {
  try {
    return (await stat(join(repositoryRoot, relativePath))).isDirectory();
  } catch {
    return false;
  }
}

const bundleSourceTargets = [
  'apps/web/pwa',
  'apps/web/src',
  'packages/data-access/src',
  'packages/domain/src',
];

const hasBuiltBundle = await directoryExists('apps/web/dist');

/**
 * Deterministic scan targets: the Appwrite configuration as code (including the
 * importer stub and its documentation), the public environment example and the
 * frontend bundle inputs. The built bundle in apps/web/dist is added whenever it
 * exists, so build output is covered without a nondeterministic build step.
 */
const scanTargets: readonly string[] = [
  'infra/appwrite',
  'apps/web/.env.example',
  ...bundleSourceTargets,
  ...(hasBuiltBundle ? ['apps/web/dist'] : []),
];

const scannedFiles = (
  await Promise.all(
    scanTargets.map(async (target) =>
      target.endsWith('.example') ? [target] : listFiles(target),
    ),
  )
)
  .flat()
  .filter((path) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'))
  .sort();

/**
 * Synthetic credential fixtures, assembled at runtime so no key-shaped literal
 * exists in this file for a secrets scanner to flag. Every value is fake and
 * only carries the shape under test.
 */
const syntheticDigest = 'ab'.repeat(32);
const syntheticRevision = '7b'.repeat(20);
const syntheticStandardKey = ['standard', '_', 'f'.repeat(32)].join('');
const syntheticHexSecret = '01'.repeat(20);
const syntheticKeyValue = ['live', 'value'].join('-');

describe('credential shape detector', () => {
  it('flags credential-shaped material', () => {
    for (const source of [
      syntheticStandardKey,
      `value = ${syntheticHexSecret};`,
      `const token = "${'a1B2'.repeat(15)}";`,
      `APPWRITE_API_KEY=${syntheticKeyValue}`,
      `headers: { "${['X', 'Appwrite', 'Key'].join('-')}": "${syntheticKeyValue}" }`,
    ])
      expect(findCredentialShape(source), source).not.toBeNull();
  });

  it('flags a lowercase quoted key header', () => {
    const source = `headers: { "${['x', 'appwrite', 'key'].join('-')}": "${syntheticKeyValue}" }`;
    expect(findCredentialShape(source), 'lowercase key header').toBe(
      'API key assignment carrying a value',
    );
  });

  it('flags a mixed-case quoted key header', () => {
    const source = `headers: { "${['X', 'ApPwRiTe', 'kEy'].join('-')}": "${syntheticKeyValue}" }`;
    expect(findCredentialShape(source), 'mixed-case key header').toBe(
      'API key assignment carrying a value',
    );
  });

  it('flags a lowercase key variable assignment', () => {
    const source = `${['appwrite', 'api', 'key'].join('_')}=${syntheticKeyValue}`;
    expect(findCredentialShape(source), 'lowercase key assignment').toBe(
      'API key assignment carrying a value',
    );
  });

  it('flags a mixed-case key variable assignment', () => {
    const source = `${['Appwrite', 'API', 'Key'].join('_')}=${syntheticKeyValue}`;
    expect(findCredentialShape(source), 'mixed-case key assignment').toBe(
      'API key assignment carrying a value',
    );
  });

  it('tolerates public integrity and revision values near their marker', () => {
    for (const source of [
      `{"url":"/assets/index.js","hash":"${syntheticDigest}"}`,
      `integrity="sha256-${syntheticDigest}"`,
      `checksum: '${syntheticDigest}'`,
      `<meta name="intermed-shell-revision" content="${syntheticRevision}">`,
    ])
      expect(findCredentialShape(source), source).toBeNull();
  });

  it('still flags the same digest away from any public value marker', () => {
    expect(findCredentialShape(`const leaked = '${syntheticDigest}';`)).toBe(
      'long hexadecimal secret',
    );
  });

  it('flags a secret behind generic words such as version, id or name', () => {
    const secret = syntheticDigest;
    for (const source of [
      `{"version": "1.0", "secret": "${secret}"}`,
      `{"id": "1.0", "secret": "${secret}"}`,
      `{"name": "1.0", "secret": "${secret}"}`,
      `{"revision": "1.0", "secret": "${secret}"}`,
      `{"version": "1.0", "apiKey": "${secret}"}`,
      `{"name": "shell", "token": "${secret}"}`,
      `version: '${secret}'`,
      `revision = '${secret}'`,
    ])
      expect(findCredentialShape(source), source).not.toBeNull();
  });

  it('never tolerates key shapes, even near a public value marker', () => {
    expect(findCredentialShape(`revision: '${syntheticStandardKey}'`)).toBe(
      'Appwrite standard_ API key',
    );
  });

  it('ignores public identifiers and documentation text', () => {
    for (const source of [
      'intermed-dev',
      'published-datasets',
      'https://fra.cloud.appwrite.io/v1',
      'appwrite push tables --config-file infra/appwrite/appwrite.config.development.json',
    ])
      expect(findCredentialShape(source), source).toBeNull();
  });
});

describe('secret scan', () => {
  it('scans a non-empty deterministic target set', () => {
    expect(scannedFiles.length).toBeGreaterThan(3);
    expect(scannedFiles).toContain(appwriteConfigPaths.development);
    expect(scannedFiles).toContain(appwriteConfigPaths.production);
    expect(scannedFiles).toContain('apps/web/.env.example');
  });

  it('scans the built frontend bundle whenever it exists', () => {
    const bundleFiles = scannedFiles.filter((path) =>
      path.startsWith('apps/web/dist/'),
    );
    if (hasBuiltBundle) expect(bundleFiles.length).toBeGreaterThan(0);
    else expect(bundleFiles).toEqual([]);
  });

  it('finds no credential-shaped strings in the scanned files', async () => {
    for (const path of scannedFiles) {
      const source = await readTextFile(path);
      expect(findCredentialShape(source), path).toBeNull();
    }
  });

  it('keeps the public environment example free of key material', async () => {
    const source = await readTextFile('apps/web/.env.example');
    const assignments = source
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => line.split('=')[0] ?? '');
    for (const key of assignments) expect(key.startsWith('VITE_')).toBe(true);
  });
});
