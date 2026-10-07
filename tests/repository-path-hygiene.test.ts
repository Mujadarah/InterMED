import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, resolve } from 'node:path';
import { TextDecoder } from 'node:util';
import { expect, it } from 'vitest';

const owner = String.fromCharCode(114, 97, 98, 105, 97);
const windowsSlash = String.fromCharCode(92);
const homePrefix = ['C:', 'Users', owner].join(windowsSlash);
const projectPrefix = ['D:', 'Proiecte AI', 'InterMED'].join(windowsSlash);
const projectPrefixForward = ['D:', 'Proiecte AI', 'InterMED'].join('/');
const escapedWindowsSlash = windowsSlash + windowsSlash;

const excludedPaths = [
  // M6 evidence is coordinated separately and retains its approved fixtures.
  'docs/MILESTONE_6_EVIDENCE.md',
  'docs/evidence/milestone-6-',
  // Claude PR10 owns this package until its shared allowlist lands.
  'packages/local-store/',
] as const;

const binaryExtensions = new Set([
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.png',
  '.webp',
]);
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

function isExcluded(path: string): boolean {
  return (
    path === excludedPaths[0] ||
    (path.startsWith(excludedPaths[1]) &&
      path.slice(excludedPaths[1].length).includes('/')) ||
    path.startsWith(excludedPaths[2])
  );
}

function isKnownBinary(path: string, source: Buffer): boolean {
  if (binaryExtensions.has(extname(path).toLowerCase())) return true;
  return (
    source
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    source.subarray(0, 4).equals(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))
  );
}

function decodeTrackedText(path: string, source: Buffer): string | undefined {
  if (source.length >= 2 && source[0] === 0xff && source[1] === 0xfe)
    return source.subarray(2).toString('utf16le');
  if (source.length >= 2 && source[0] === 0xfe && source[1] === 0xff)
    return source.subarray(2).swap16().toString('utf16le');
  if (isKnownBinary(path, source)) return undefined;
  try {
    const text = utf8Decoder.decode(source);
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  } catch {
    throw new Error(`Tracked text is not UTF-8: ${path}`);
  }
}

function findMachinePaths(source: string): string[] {
  const findings: string[] = [];
  if (source.toLowerCase().includes(homePrefix.toLowerCase()))
    findings.push('owner home path');
  if (source.toLowerCase().includes(owner)) findings.push('owner username');
  if (source.toLowerCase().includes(projectPrefix.toLowerCase()))
    findings.push('project worktree path');
  if (source.toLowerCase().includes(projectPrefixForward.toLowerCase()))
    findings.push('project worktree path');
  if (
    /(?:[A-Za-z]:[\\/]{1,2}(?:Users|home)(?:[\\/]{1,2})|\/home(?:[\\/]{1,2}))/i.test(
      source,
    )
  )
    findings.push('absolute user path');
  return findings;
}

function trackedPathFindings(
  repositoryRoot = resolve(import.meta.dirname, '..'),
): Array<{ path: string; findings: string[] }> {
  const paths = execFileSync('git', ['ls-files', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
  return paths
    .filter((path) => !isExcluded(path))
    .flatMap((path) => {
      const source = readFileSync(resolve(repositoryRoot, path));
      const text = decodeTrackedText(path, source);
      const findings = text ? findMachinePaths(text) : [];
      return findings.length ? [{ path, findings }] : [];
    });
}

it('detects UTF-8, escaped and UTF-16 paths without treating images as text', () => {
  const utf8 = `${projectPrefixForward}/docs`;
  const escaped = `"${['C:', 'Users', 'other-user'].join(escapedWindowsSlash)}"`;
  const utf16le = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(`${homePrefix}${windowsSlash}Temp`, 'utf16le'),
  ]);
  const utf16be = Buffer.concat([
    Buffer.from([0xfe, 0xff]),
    Buffer.from(`${homePrefix}${windowsSlash}Temp`, 'utf16le').swap16(),
  ]);

  expect(findMachinePaths(utf8)).not.toEqual([]);
  expect(findMachinePaths(escaped)).not.toEqual([]);
  expect(
    findMachinePaths(decodeTrackedText('fixture.txt', utf16le)!),
  ).not.toEqual([]);
  expect(
    findMachinePaths(decodeTrackedText('fixture.txt', utf16be)!),
  ).not.toEqual([]);
  expect(
    decodeTrackedText('fixture.png', Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  ).toBe(undefined);
  expect(() =>
    decodeTrackedText('fixture.txt', Buffer.from([0xc3, 0x28])),
  ).toThrow('not UTF-8');
});

it('uses exact boundaries for the three coordinated exclusions', () => {
  expect(isExcluded(excludedPaths[0])).toBe(true);
  expect(isExcluded(`${excludedPaths[1]}2026-10-07/README.md`)).toBe(true);
  expect(isExcluded(`${excludedPaths[2]}src/index.ts`)).toBe(true);
  expect(isExcluded('docs/evidence/milestone-6-foo.md')).toBe(false);
  expect(isExcluded('packages/local-storehouse/src/index.ts')).toBe(false);
});

it('scans tracked files in a fixture git repository, not untracked files', async () => {
  const repositoryRoot = await mkdtemp(
    resolve(tmpdir(), 'intermed-path-hygiene-'),
  );
  try {
    execFileSync('git', ['init', '-q'], { cwd: repositoryRoot });
    execFileSync('git', ['config', 'user.email', 'fixture@example.invalid'], {
      cwd: repositoryRoot,
    });
    execFileSync('git', ['config', 'user.name', 'Synthetic Fixture'], {
      cwd: repositoryRoot,
    });
    await writeFile(
      resolve(repositoryRoot, 'tracked.txt'),
      `${homePrefix}/tracked`,
    );
    await writeFile(
      resolve(repositoryRoot, 'untracked.txt'),
      `${homePrefix}/untracked`,
    );
    execFileSync('git', ['add', 'tracked.txt'], { cwd: repositoryRoot });

    expect(trackedPathFindings(repositoryRoot)).toEqual([
      {
        path: 'tracked.txt',
        findings: ['owner home path', 'owner username', 'absolute user path'],
      },
    ]);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});

it('keeps tracked text and logs UTF-8/LF and free of machine paths', () => {
  const root = resolve(import.meta.dirname, '..');
  const paths = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);

  for (const path of paths) {
    if (isExcluded(path)) continue;
    const source = readFileSync(resolve(root, path));
    const text = decodeTrackedText(path, source);
    if (text === undefined) continue;
    expect(findMachinePaths(text), path).toEqual([]);
    if (extname(path).toLowerCase() === '.log') {
      expect(source[0], path).not.toBe(0xff);
      expect(source[1], path).not.toBe(0xfe);
      expect(text, path).not.toContain('\r\n');
    }
  }
});
