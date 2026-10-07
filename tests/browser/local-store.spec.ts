import { resolve } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { LocalStoreHarness } from '../../apps/web/src/dev/local-store-harness';
import { productionServer } from './production-server';

/**
 * Real-IndexedDB behaviour of the local dataset store, driven through a
 * test-only harness that is never part of the production bundle. Every page in
 * these tests is a real production build; the harness build only adds the
 * window hook used to stage synthetic generations.
 */

type HarnessWindow = Window & {
  __intermedLocalStoreHarness: LocalStoreHarness;
};

const HARNESS_TIMEOUT = { timeout: 5_000 };

async function harnessReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      Boolean(
        (window as unknown as Partial<HarnessWindow>)
          .__intermedLocalStoreHarness,
      ),
    undefined,
    HARNESS_TIMEOUT,
  );
}

async function directoryText(root: string): Promise<string> {
  const entries = await readdir(root, { withFileTypes: true, recursive: true });
  const chunks: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    chunks.push(await readFile(resolve(entry.parentPath, entry.name), 'utf8'));
  }
  return chunks.join('\n');
}

test('shows never-downloaded in default mode and downloads nothing', async ({
  page,
}) => {
  await page.goto('/status');
  const section = page.getByTestId('dataset-section');
  await expect(section).toHaveAttribute(
    'data-dataset-state',
    'never-downloaded',
  );
  await expect(section).toContainText(
    'No medication dataset has been downloaded',
  );
  await expect(
    page.getByText('Synthetic development data — not for clinical use.'),
  ).toHaveCount(0);
  await expect(
    page.getByTestId('dataset-section').getByRole('button'),
  ).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  const stored = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase | null>((resolveOpen) => {
      const request = indexedDB.open('intermed-local');
      request.onupgradeneeded = (event) => {
        (event.target as IDBOpenDBRequest | null)?.transaction?.abort();
      };
      request.onsuccess = () => resolveOpen(request.result);
      request.onerror = () => resolveOpen(null);
    });
    if (!database) return { active: null, generations: 0 };
    const state = await new Promise<Record<string, unknown> | null>(
      (resolveRead) => {
        const transaction = database.transaction('meta', 'readonly');
        const read = transaction.objectStore('meta').get('dataset-state');
        read.onsuccess = () =>
          resolveRead((read.result as Record<string, unknown>) ?? null);
        read.onerror = () => resolveRead(null);
      },
    );
    const generations = await new Promise<number>((resolveCount) => {
      const transaction = database.transaction('generations', 'readonly');
      const count = transaction.objectStore('generations').count();
      count.onsuccess = () => resolveCount(count.result);
      count.onerror = () => resolveCount(-1);
    });
    database.close();
    return {
      active: state?.['activeGenerationId'] ?? null,
      generations,
    };
  });
  expect(stored).toEqual({ active: null, generations: 0 });
  await expect(section).toHaveAttribute(
    'data-dataset-state',
    'never-downloaded',
  );
});

test('reads a staged generation after a restart and while offline', async ({
  page,
}) => {
  const server = await productionServer();
  server.revision('harness');
  try {
    await page.goto(`${server.url}/status`);
    // Scoped to the shell status region and exact text: the dataset note on
    // the same page quotes this status sentence and matches a loose lookup.
    await expect(
      page
        .getByRole('complementary', { name: 'Application shell' })
        .getByText('Shell available offline', { exact: true }),
    ).toBeVisible();
    await harnessReady(page);
    const staged = await page.evaluate(async () => {
      const harness = (window as unknown as HarnessWindow)
        .__intermedLocalStoreHarness;
      return harness.stageAndActivate('alpha');
    });
    const section = page.getByTestId('dataset-section');
    await expect(section).toHaveAttribute('data-dataset-state', 'ready');
    await expect(
      page.getByText('Synthetic development data — not for clinical use.'),
    ).toBeVisible();

    await page.reload();
    await expect(section).toHaveAttribute('data-dataset-state', 'ready');
    await harnessReady(page);

    server.failure('offline');
    await page.reload();
    await expect(section).toHaveAttribute('data-dataset-state', 'ready');
    await harnessReady(page);
    const offlineRead = await page.evaluate(async () => {
      const harness = (window as unknown as HarnessWindow)
        .__intermedLocalStoreHarness;
      return harness.readProducts();
    });
    expect(offlineRead).toEqual(['Fictivol alpha', 'Placebex alpha']);
    const offlineState = await page.evaluate(async () => {
      const harness = (window as unknown as HarnessWindow)
        .__intermedLocalStoreHarness;
      return harness.state();
    });
    expect(offlineState).toMatchObject({
      status: 'ready',
      generation: { generationId: staged.generationId, synthetic: true },
    });
  } finally {
    await server.close();
  }
});

test('two tabs evaluating during an activation each see one coherent generation', async ({
  browser,
}) => {
  const server = await productionServer();
  server.revision('harness');
  const context = await browser.newContext();
  try {
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    await tabA.goto(`${server.url}/status`);
    await tabB.goto(`${server.url}/status`);
    await harnessReady(tabA);
    await harnessReady(tabB);
    const alpha = await tabA.evaluate(async () => {
      const harness = (window as unknown as HarnessWindow)
        .__intermedLocalStoreHarness;
      return harness.stageAndActivate('alpha');
    });
    await tabA.evaluate(async () => {
      const harness = (window as unknown as HarnessWindow)
        .__intermedLocalStoreHarness;
      await harness.beginEvaluation();
    });
    await tabB.evaluate(async () => {
      const harness = (window as unknown as HarnessWindow)
        .__intermedLocalStoreHarness;
      await harness.beginEvaluation();
    });
    await tabA.evaluate(async () => {
      const harness = (window as unknown as HarnessWindow)
        .__intermedLocalStoreHarness;
      await harness.readNext();
    });

    // A second tab activates a new generation in the middle of both evaluations.
    const beta = await tabB.evaluate(async () => {
      const harness = (window as unknown as HarnessWindow)
        .__intermedLocalStoreHarness;
      return harness.stageAndActivate('beta');
    });

    await tabA.evaluate(async () => {
      const harness = (window as unknown as HarnessWindow)
        .__intermedLocalStoreHarness;
      await harness.readNext();
      await harness.readNext();
    });
    await tabB.evaluate(async () => {
      const harness = (window as unknown as HarnessWindow)
        .__intermedLocalStoreHarness;
      await harness.readNext();
      await harness.readNext();
    });
    const evaluationA = await tabA.evaluate(async () => {
      const harness = (window as unknown as HarnessWindow)
        .__intermedLocalStoreHarness;
      return harness.endEvaluation();
    });
    const evaluationB = await tabB.evaluate(async () => {
      const harness = (window as unknown as HarnessWindow)
        .__intermedLocalStoreHarness;
      return harness.endEvaluation();
    });

    for (const evaluation of [evaluationA, evaluationB]) {
      expect(evaluation.generationId).toBe(alpha.generationId);
      expect(evaluation.rows.length).toBeGreaterThan(1);
      for (const row of evaluation.rows) {
        expect(row.pinnedGenerationId).toBe(alpha.generationId);
        expect(row.datasetVersionId).toBe(alpha.generationId);
        expect(row.name).toContain('alpha');
      }
    }

    // After the activation, the next evaluation starts on the new generation.
    await tabA.evaluate(async () => {
      const harness = (window as unknown as HarnessWindow)
        .__intermedLocalStoreHarness;
      await harness.beginEvaluation();
    });
    const fresh = await tabA.evaluate(async () => {
      const harness = (window as unknown as HarnessWindow)
        .__intermedLocalStoreHarness;
      return harness.readNext();
    });
    expect(fresh?.datasetVersionId).toBe(beta.generationId);
  } finally {
    await context.close();
    await server.close();
  }
});

test('an old tab reports reload-required instead of losing data on an upgrade', async ({
  browser,
}) => {
  const server = await productionServer();
  server.revision('harness');
  const context = await browser.newContext();
  try {
    const oldTab = await context.newPage();
    const upgradingTab = await context.newPage();
    await oldTab.goto(`${server.url}/status`);
    await upgradingTab.goto(`${server.url}/status`);
    await harnessReady(oldTab);
    await harnessReady(upgradingTab);
    const alpha = await oldTab.evaluate(async () => {
      const harness = (window as unknown as HarnessWindow)
        .__intermedLocalStoreHarness;
      const staged = await harness.stageAndActivate('alpha');
      await harness.addFavorite(staged.productIds['SP-FICTIVOL'] ?? '');
      return staged;
    });

    const upgrade = await upgradingTab.evaluate(async () => {
      const harness = (window as unknown as HarnessWindow)
        .__intermedLocalStoreHarness;
      return harness.upgradeSchema();
    });
    expect(upgrade.status).toBe('upgraded');
    expect(upgrade.favorites).toBe(1);
    expect(upgrade.activeGenerationId).toBe(alpha.generationId);

    await expect(oldTab.getByTestId('dataset-section')).toHaveAttribute(
      'data-dataset-state',
      'reload-required',
      HARNESS_TIMEOUT,
    );
    await expect(
      oldTab.getByText(/changed by another tab or a newer app version/),
    ).toBeVisible();
  } finally {
    await context.close();
    await server.close();
  }
});

test('the production bundle contains no test-only harness code', async () => {
  const production = await directoryText(resolve('apps/web/dist'));
  expect(production).toContain('intermed-local');
  expect(production).not.toContain('__intermedLocalStoreHarness');
  expect(production).not.toContain('Synthetic development catalogue');
  const harnessBuild = await directoryText(resolve('artifacts/pwa-harness'));
  expect(harnessBuild).toContain('__intermedLocalStoreHarness');
});
