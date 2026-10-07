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

it('rejects zod inside the domain package', () => {
  expect(
    inspectBoundary([
      {
        path: 'packages/domain/src/rule.ts',
        source: "import { z } from 'zod';",
      },
    ]),
  ).not.toHaveLength(0);
});

it('allows data-access to import the public domain package and zod', () => {
  expect(
    inspectBoundary([
      {
        path: 'packages/data-access/src/validate.ts',
        source:
          "import type { MedicationCatalogueSnapshot } from '@intermed/domain';\nimport { z } from 'zod';\n",
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

it.each([
  'apps/web/src/presentation/View.ts',
  'apps/web/src/application/services.ts',
  'apps/web/src/infrastructure/browser-shell.ts',
  'packages/data-access/src/reader.ts',
  'packages/local-store-consumer.ts',
])('rejects a local-store import outside the composition root: %s', (path) => {
  expect(
    inspectBoundary([
      {
        path,
        source:
          "import { createLocalDatasetStore } from '@intermed/local-store';",
      },
    ]),
  ).not.toHaveLength(0);
});

it.each([
  'apps/web/src/Bootstrap.tsx',
  'apps/web/src/dev/local-store-harness.ts',
])(
  'allows the composition root and the test-only harness to import local-store: %s',
  (path) => {
    expect(
      inspectBoundary([
        {
          path,
          source:
            "import { createLocalDatasetStore } from '@intermed/local-store';",
        },
      ]),
    ).toEqual([]);
  },
);

it('allows local-store to use browser storage globals', () => {
  expect(
    inspectBoundary([
      {
        path: 'packages/local-store/src/db.ts',
        source:
          "const request = indexedDB.open('intermed-local');\nconst locks = navigator.locks;\nconst channel = new BroadcastChannel('intermed-dataset-events');\n",
      },
    ]),
  ).toEqual([]);
});

it('keeps the domain package free of local-store types', () => {
  expect(
    inspectBoundary([
      {
        path: 'packages/domain/src/rules.ts',
        source:
          "import type { GenerationReader } from '@intermed/local-store';",
      },
    ]),
  ).not.toHaveLength(0);
});
