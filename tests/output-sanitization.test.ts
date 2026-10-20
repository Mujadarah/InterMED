import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * M12 output-sanitization guard.
 *
 * Production source under apps/web/src and packages must never use HTML
 * sinks, script compilation, or document.write: all dataset text is rendered
 * through React JSX interpolation, which escapes it as inert text. The only
 * dynamic href in production (MedicationDetailPage DocumentRow) is gated by
 * isHttpUrl(), and the calculator reference links use frozen domain
 * constants; both are covered by the manual href/src audit in
 * docs/evidence/m12-supply-chain-2026-10-20/README.md and by the
 * inert-render test in
 * apps/web/src/presentation/MedicationDetailSanitization.test.tsx, not by a
 * string ban (every safe dynamic href would trip one).
 *
 * Allow-list format when a sink is ever truly needed:
 *   { path: 'apps/web/src/...', pattern: 'innerHTML', reason: '...' }
 * Keep it empty: no production sink is approved.
 */
interface SanitizationAllowEntry {
  readonly path: string;
  readonly pattern: string;
  readonly reason: string;
}

const sanitizationAllowList: readonly SanitizationAllowEntry[] = [];

const dangerousSinks: readonly {
  readonly label: string;
  readonly pattern: RegExp;
}[] = [
  { label: 'dangerouslySetInnerHTML', pattern: /dangerouslySetInnerHTML/ },
  { label: 'innerHTML', pattern: /(?<![A-Za-z_$])innerHTML(?![A-Za-z_$])/ },
  { label: 'outerHTML', pattern: /(?<![A-Za-z_$])outerHTML(?![A-Za-z_$])/ },
  { label: 'insertAdjacentHTML', pattern: /insertAdjacentHTML/ },
  { label: 'document.write', pattern: /document\s*\.\s*write\s*\(/ },
  { label: 'eval(', pattern: /(?<![A-Za-z_$.])eval\s*\(/ },
  { label: 'new Function(', pattern: /new\s+Function\s*\(/ },
  { label: 'javascript: URL', pattern: /javascript\s*:/i },
];

function productionSources(): Array<{ path: string; source: string }> {
  const root = resolve(import.meta.dirname, '..');
  const paths = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)
    .filter(
      (path) =>
        (path.startsWith('apps/web/src/') || path.startsWith('packages/')) &&
        /\.(?:[cm]?[jt]s|[jt]sx)$/.test(path) &&
        !/\.test\.[cm]?[jt]sx?$/.test(path) &&
        !/\.spec\.[cm]?[jt]sx?$/.test(path),
    );
  return paths.map((path) => ({
    path,
    source: readFileSync(resolve(root, path), 'utf8'),
  }));
}

function findSinkViolations(
  files: Array<{ path: string; source: string }>,
): string[] {
  return files.flatMap(({ path, source }) =>
    dangerousSinks
      .filter(
        ({ label, pattern }) =>
          pattern.test(source) &&
          !sanitizationAllowList.some(
            (entry) => entry.path === path && entry.pattern === label,
          ),
      )
      .map(({ label }) => `${path}: forbidden sink ${label}`),
  );
}

describe('output-sanitization guard', () => {
  it('finds sink violations in fixture sources, honoring the allow-list', () => {
    const files = [
      { path: 'apps/web/src/a.tsx', source: '<div />' },
      {
        path: 'apps/web/src/b.tsx',
        source: '<div dangerouslySetInnerHTML={{ __html: x }} />',
      },
      {
        path: 'apps/web/src/c.ts',
        source: 'element.innerHTML = value;',
      },
    ];
    expect(findSinkViolations(files)).toEqual([
      'apps/web/src/b.tsx: forbidden sink dangerouslySetInnerHTML',
      'apps/web/src/c.ts: forbidden sink innerHTML',
    ]);
  });

  it('keeps dangerous sinks out of production source', () => {
    expect(findSinkViolations(productionSources())).toEqual([]);
  });
});
