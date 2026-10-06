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

const assetDigest =
  '8f4913fed8fde10babda2cc680ce25d18b817e73530e34fc2c1b3dfc5aea758b';
const revisionId = '1a8f09fe351510d3bb796f9e09cfe18d00d2fe48';

describe('credential shape detector', () => {
  it('flags credential-shaped material', () => {
    for (const source of [
      'standard_68a5b4c3d2e1f0a1b2c3d4e5f6071829',
      'value = 0123456789abcdef0123456789abcdef01234567;',
      `const token = "${'a1B2'.repeat(15)}";`,
      'APPWRITE_API_KEY=live-value-here',
      'headers: { "X-Appwrite-Key": "live-value-here" }',
    ])
      expect(findCredentialShape(source), source).not.toBeNull();
  });

  it('tolerates public integrity and revision values near their marker', () => {
    for (const source of [
      `{"url":"/assets/index.js","hash":"${assetDigest}"}`,
      `integrity="sha256-${assetDigest}"`,
      `checksum: '${assetDigest}'`,
      `<meta name="intermed-shell-revision" content="${revisionId}">`,
    ])
      expect(findCredentialShape(source), source).toBeNull();
  });

  it('still flags the same digest away from any public value marker', () => {
    expect(findCredentialShape(`const leaked = '${assetDigest}';`)).toBe(
      'long hexadecimal secret',
    );
  });

  it('flags a secret behind generic words such as version, id or name', () => {
    const secret =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
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
    expect(
      findCredentialShape(
        `revision: 'standard_68a5b4c3d2e1f0a1b2c3d4e5f6071829'`,
      ),
    ).toBe('Appwrite standard_ API key');
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
