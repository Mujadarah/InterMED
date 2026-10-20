import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * M12 secret-hygiene guard.
 *
 * Scans every tracked file (git ls-files) for common secret shapes and fails
 * with file and line number only. Matched values are never printed: the
 * failure message carries only `path:line (label)` entries.
 *
 * Each pattern splits its prefix with a one-character class so this file
 * itself carries no matchable secret shape. The allow-list below names synthetic-fixture files
 * explicitly; each entry documents why the file may carry key-shaped text.
 * Prefer shrinking the allow-list over growing it.
 */
const allowListedPaths: readonly string[] = [
  // Synthetic credential-shape fixtures for the dedicated detector tests;
  // values are assembled at runtime and carry no real key material.
  'tests/appwrite-config-secrets.test.ts',
  'tests/scan-dist-secrets.test.ts',
  'tests/support/secret-scan.ts',
];

interface SecretRule {
  readonly label: string;
  readonly pattern: RegExp;
}

function secretRules(): readonly SecretRule[] {
  // Literal patterns with a one-character class inside each prefix (AK[I]A,
  // gh[p]_ ...) so this file never contains a contiguous secret shape that
  // this guard or DeepSource would match. No rule uses the g or y flag.
  return [
    {
      label: 'AWS access key',
      pattern: /(?:AK[I]A|AS[I]A)[0-9A-Z]{16}/,
    },
    {
      // Covers PKCS#8 and the typed RSA, EC, DSA, OpenSSH and encrypted headers.
      label: 'PEM private key block',
      pattern: /-----BEGI[N] (?:[A-Z]+ )*PRIVATE KEY-----/,
    },
    {
      label: 'Appwrite key prefix carrying a value',
      pattern: /standar[d]_[A-Za-z0-9._-]{16,}/,
    },
    {
      label: 'GitHub token prefix carrying a value',
      pattern: /(?:gh[p]_|githu[b]_pat_)[A-Za-z0-9]{10,}/,
    },
    {
      // An optional closing quote covers JSON and YAML keys ("api_key": ...).
      label: 'generic key assignment carrying a quoted value',
      pattern: /ap[i][_-]?key['"]?\s*[:=]\s*['"][A-Za-z0-9]{24,}/i,
    },
  ];
}

function isBinary(source: Buffer): boolean {
  return source.includes(0);
}

function scanTrackedFiles(
  repositoryRoot: string,
): Array<{ path: string; line: number; label: string }> {
  const rules = secretRules();
  const allowListed = new Set(allowListedPaths);
  const paths = execFileSync('git', ['ls-files', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)
    .filter((path) => !allowListed.has(path));
  const findings: Array<{ path: string; line: number; label: string }> = [];
  for (const path of paths) {
    const source = readFileSync(resolve(repositoryRoot, path));
    if (isBinary(source)) continue;
    const lines = source.toString('utf8').split('\n');
    lines.forEach((line, index) => {
      for (const rule of rules) {
        // No rule carries the global or sticky flag, so test() is stateless.
        if (rule.pattern.test(line)) {
          // File and line only: never echo the matched value.
          findings.push({ path, line: index + 1, label: rule.label });
          break;
        }
      }
    });
  }
  return findings;
}

describe('secret hygiene', () => {
  it('detects secret shapes in fixture text without echoing values', () => {
    const rules = secretRules();
    const assembledAws = `${['AK', 'IA'].join('')}ABCDEFGHIJKLMNOP`;
    const assembledClassic = `${['gh', 'p_'].join('')}abcdefghij1234`;
    const assembledFineGrained = `${['github', '_pat_'].join('')}abcdefghij1234`;
    const assembledAppwrite = `${['standard', '_'].join('')}${'f'.repeat(32)}`;
    const pemLine = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
    const typedPemLines = ['RSA', 'EC', 'OPENSSH', 'ENCRYPTED'].map((kind) =>
      ['-----BEGIN ', kind, ' PRIVATE KEY-----'].join(''),
    );
    const jsonKeyLine = `"${['ap', 'i'].join('')}_key": "${'a1B2'.repeat(8)}"`;
    const genericLine = `const ${['ap', 'i'].join('')}_${'key'} = "${'a1B2'.repeat(8)}";`;
    const matched = [
      assembledAws,
      assembledClassic,
      assembledFineGrained,
      assembledAppwrite,
      pemLine,
      ...typedPemLines,
      genericLine,
      jsonKeyLine,
    ];
    for (const line of matched) {
      expect(
        rules.some((rule) => rule.pattern.test(line)),
        'a synthetic secret shape must be detected',
      ).toBe(true);
    }
    expect(
      rules.some((rule) =>
        rule.pattern.test(
          'intermed-dev synthetic placeholder without key material',
        ),
      ),
    ).toBe(false);
  });

  it('finds no secret shapes in tracked files outside the fixture allow-list', () => {
    const root = resolve(import.meta.dirname, '..');
    const findings = scanTrackedFiles(root);
    // File and line only: values must never reach the failure message.
    expect(
      findings.map(({ path, line, label }) => `${path}:${line} (${label})`),
    ).toEqual([]);
  });

  it('keeps the fixture allow-list itself tracked and minimal', () => {
    const root = resolve(import.meta.dirname, '..');
    const tracked = new Set(
      execFileSync('git', ['ls-files', '-z'], {
        cwd: root,
        encoding: 'utf8',
      })
        .split('\0')
        .filter(Boolean),
    );
    for (const path of allowListedPaths) {
      expect(tracked.has(path), `${path} must stay tracked`).toBe(true);
    }
    expect(allowListedPaths.length).toBeLessThanOrEqual(8);
  });
});
