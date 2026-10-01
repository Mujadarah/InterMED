import { expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
// The production checker is plain JS so CI can run it independently of the app.
import { inspectBoundary, sourceFiles } from '../scripts/check-boundaries.mjs';

it('collects JavaScript and TypeScript files for boundary inspection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'intermed-boundaries-'));
  const extensions = ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts'];
  try {
    for (const extension of [...extensions, 'md']) {
      await writeFile(
        join(directory, `adapter.${extension}`),
        "import { x } from '@intermed/domain/src/private';",
      );
    }
    const files = await sourceFiles(directory);
    expect(files.map(({ path }) => basename(path)).sort()).toEqual(
      extensions.map((extension) => `adapter.${extension}`).sort(),
    );
    expect(inspectBoundary(files)).toHaveLength(extensions.length);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it.each([
  "import type { ReactNode } from 'react';",
  "export { Client } from 'appwrite';",
  "const load = () => import('dexie');",
  "const x = localStorage.getItem('x');",
  'type Store = IDBDatabase;',
  "import { x } from '../../data-access/src/index';",
  "import { x } from '@intermed/data-access';",
])('rejects a domain violation: %s', (source) => {
  expect(
    inspectBoundary([{ path: 'packages/domain/src/rule.ts', source }]),
  ).not.toHaveLength(0);
});

it('allows pure domain code and ignores comments mentioning browser libraries', () => {
  expect(
    inspectBoundary([
      {
        path: 'packages/domain/src/index.ts',
        source: '// No React or localStorage here\nexport type Id = string;',
      },
    ]),
  ).toEqual([]);
});

it('rejects private workspace imports from presentation', () => {
  expect(
    inspectBoundary([
      {
        path: 'apps/web/src/presentation/View.ts',
        source: "import { x } from '@intermed/domain/src/private';",
      },
    ]),
  ).not.toHaveLength(0);
});
