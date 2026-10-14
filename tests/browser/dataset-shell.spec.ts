import { expect, test, type Page } from '@playwright/test';
import type { LocalStoreHarness } from '../../apps/web/src/dev/local-store-harness';
import { productionServer } from './production-server';

/**
 * Shell/dataset independence for the M12 regression checklist.
 *
 * The PWA shell (CacheStorage plus service worker) and the medication dataset
 * (IndexedDB) are disjoint storage: a waiting shell update must neither block
 * nor wipe a dataset update, and a shell activation must preserve the active
 * dataset. Every page here is a real production build; the harness build only
 * adds the window hook used to stage synthetic generations.
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

async function cachedShell(page: Page, serverUrl: string): Promise<void> {
  await page.goto(`${serverUrl}/status`);
  await expect(
    page
      .getByRole('complementary', { name: 'Application shell' })
      .getByText('Shell available offline', { exact: true }),
  ).toBeVisible();
  await harnessReady(page);
}

test('offline startup with a cached shell and no dataset stays honest', async ({
  page,
}) => {
  const server = await productionServer();
  server.revision('harness');
  try {
    await cachedShell(page, server.url);
    // No dataset has ever been staged in this profile.
    expect(
      await page.evaluate(async () => {
        const harness = (window as unknown as HarnessWindow)
          .__intermedLocalStoreHarness;
        return harness.state();
      }),
    ).toMatchObject({ status: 'never-downloaded' });

    server.failure('offline');
    await page.reload();
    // The cached shell still launches, and the dataset section honestly
    // reports that nothing was ever downloaded instead of looking empty.
    await expect(
      page
        .getByRole('complementary', { name: 'Application shell' })
        .getByText('Shell available offline', { exact: true }),
    ).toBeVisible();
    const section = page.getByTestId('dataset-section');
    await expect(section).toHaveAttribute(
      'data-dataset-state',
      'never-downloaded',
    );
    await expect(section).toContainText(
      'No medication dataset has been downloaded',
    );
    expect(
      await page.evaluate(async () => {
        const harness = (window as unknown as HarnessWindow)
          .__intermedLocalStoreHarness;
        return harness.state();
      }),
    ).toMatchObject({ status: 'never-downloaded' });
  } finally {
    await server.close();
  }
});

test('a dataset update succeeds while a shell update waits and survives its activation', async ({
  page,
}) => {
  const server = await productionServer();
  server.revision('harness');
  try {
    await cachedShell(page, server.url);
    await page.evaluate(async () => {
      const harness = (window as unknown as HarnessWindow)
        .__intermedLocalStoreHarness;
      await harness.stageAndActivate('alpha');
    });
    await expect(page.getByTestId('dataset-section')).toHaveAttribute(
      'data-dataset-state',
      'ready',
    );
    const datasetVersion = page
      .getByTestId('dataset-section')
      .locator('dt:text-is("Dataset version") + dd');
    const alphaVersion = (await datasetVersion.textContent())?.trim();
    expect(alphaVersion).toBeTruthy();

    // A newer shell build appears and waits for explicit activation.
    server.revision('b');
    await page.getByRole('button', { name: 'Check for shell update' }).click();
    await expect(
      page.getByRole('button', { name: 'Update shell and reload' }),
    ).toBeVisible();

    // While the shell update waits, a dataset update still stages, activates
    // and reads coherently; the waiting shell is untouched.
    const staged = await page.evaluate(async () => {
      const harness = (window as unknown as HarnessWindow)
        .__intermedLocalStoreHarness;
      const beta = await harness.stageAndActivate('beta');
      return { beta, products: await harness.readProducts() };
    });
    expect(staged.products).toEqual(['Fictivol beta', 'Placebex beta']);
    expect(
      await page.evaluate(async () => {
        const harness = (window as unknown as HarnessWindow)
          .__intermedLocalStoreHarness;
        return harness.state();
      }),
    ).toMatchObject({
      status: 'ready',
      generation: { generationId: staged.beta.generationId },
    });
    await expect(page.getByTestId('dataset-section')).toHaveAttribute(
      'data-dataset-state',
      'ready',
    );
    await expect(
      page.getByRole('button', { name: 'Update shell and reload' }),
    ).toBeVisible();
    await expect(
      page.locator('meta[name="intermed-shell-revision"]'),
    ).toHaveAttribute('content', 'harness');
    await expect(datasetVersion).not.toHaveText(alphaVersion ?? '');
    const betaVersion = (await datasetVersion.textContent())?.trim();
    expect(betaVersion).toBeTruthy();

    // Activating the waiting shell preserves the active dataset generation.
    await page.getByRole('button', { name: 'Update shell and reload' }).click();
    await expect(
      page.locator('meta[name="intermed-shell-revision"]'),
    ).toHaveAttribute('content', 'b');
    await expect(
      page
        .getByRole('complementary', { name: 'Application shell' })
        .getByText('Shell available offline', { exact: true }),
    ).toBeVisible();
    const section = page.getByTestId('dataset-section');
    await expect(section).toHaveAttribute('data-dataset-state', 'ready');
    // The beta generation, not alpha, must still be the active dataset.
    await expect(datasetVersion).toHaveText(betaVersion ?? '');
    await expect(datasetVersion).not.toHaveText(alphaVersion ?? '');
    await expect(
      page.getByText('Synthetic development data — not for clinical use.'),
    ).toBeVisible();
  } finally {
    await server.close();
  }
});
