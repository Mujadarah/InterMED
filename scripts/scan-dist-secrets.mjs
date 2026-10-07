#!/usr/bin/env node
/**
 * Required post-build credential-shape scan of the frontend build output.
 *
 * `npm run test` runs before `npm run build`, so on a fresh checkout its
 * opportunistic scan of `apps/web/dist` is skipped. This script closes that gap:
 * `npm run check` runs it right after the build and it fails when the build
 * output is missing instead of silently skipping. It reuses the detector of
 * `tests/support/secret-scan.ts` and reports file names and pattern labels
 * only — never the matched text.
 *
 * Usage: `node scripts/scan-dist-secrets.mjs [directory]`. The optional
 * directory exists for the offline tests and defaults to `apps/web/dist`.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findCredentialShape } from '../tests/support/secret-scan.ts';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const target = resolve(
  process.argv[2] ?? join(repositoryRoot, 'apps/web/dist'),
);

/** Recursively list every file under a directory, as absolute paths. */
async function listFiles(directory) {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

/**
 * Scan every file of a directory and return one `path: pattern label` finding
 * per credential-shaped file. Values are never included.
 */
async function scanDirectory(directory) {
  const files = await listFiles(directory);
  const findings = [];
  for (const file of files) {
    const label = findCredentialShape(await readFile(file, 'utf8'));
    if (label)
      findings.push(
        `${relative(directory, file).replaceAll('\\', '/')}: ${label}`,
      );
  }
  return { count: files.length, findings };
}

let isDirectory = false;
try {
  isDirectory = (await stat(target)).isDirectory();
} catch {
  isDirectory = false;
}
if (!isDirectory) {
  console.error(
    `scan-dist-secrets: required build output is missing: ${target}\n` +
      'This scan runs after `npm run build` and fails instead of skipping.',
  );
  process.exit(1);
}

const { count, findings } = await scanDirectory(target);
if (findings.length) {
  console.error(
    `scan-dist-secrets: ${findings.length} credential-shaped file(s) in ${target} (values not shown):`,
  );
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}
console.log(
  `scan-dist-secrets: ${count} file(s) scanned in ${target}, no credential-shaped strings.`,
);
