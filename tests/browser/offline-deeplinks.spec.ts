import { expect, test, type Page } from '@playwright/test';
import type { LocalStoreHarness } from '../../apps/web/src/dev/local-store-harness';
import { productionServer } from './production-server';

type HarnessWindow = Window & {
  __intermedLocalStoreHarness: LocalStoreHarness;
};

async function harnessReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      Boolean(
        (window as unknown as Partial<HarnessWindow>)
          .__intermedLocalStoreHarness,
      ),
    undefined,
    { timeout: 10_000 },
  );
}

test('renders offline deep links to /search and /medication/:id from the precache', async ({
  page,
  context,
}, testInfo) => {
  const server = await productionServer();
  server.revision('harness');
  try {
    await page.goto(server.url);
    await expect(
      page.getByText('Shell available offline', { exact: true }),
    ).toBeVisible();
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
    );
    await harnessReady(page);
    const productId = await page.evaluate(async () => {
      const harness = (window as unknown as HarnessWindow)
        .__intermedLocalStoreHarness;
      const staged = await harness.stageAndActivate('alpha');
      return staged.productIds['SP-FICTIVOL'] ?? '';
    });
    expect(productId).not.toBe('');

    // Disconnect the origin in every engine; also disable networking in Chromium.
    server.failure('offline');
    if (testInfo.project.name === 'chromium-desktop')
      await context.setOffline(true);
    const requestsAfterOffline = server.requests.length;

    // A deep link to the search route, never visited in this session.
    const searchTab = await context.newPage();
    await searchTab.goto(`${server.url}/search`);
    await expect(
      searchTab.getByRole('heading', { name: 'Local medication search' }),
    ).toBeVisible();
    await expect(searchTab.getByTestId('medication-search-page')).toBeVisible();
    await expect(searchTab.getByRole('searchbox')).toBeEnabled();

    // A deep link to one synthetic product, never visited in this session.
    const detailTab = await context.newPage();
    await detailTab.goto(`${server.url}/medication/${productId}`);
    await expect(
      detailTab.getByRole('heading', { name: 'Fictivol alpha', level: 1 }),
    ).toBeVisible();
    await expect(
      detailTab.getByRole('heading', { name: 'Identification', level: 2 }),
    ).toBeVisible();
    await expect(
      detailTab.getByRole('heading', { name: 'Composition', level: 2 }),
    ).toBeVisible();

    // Neither deep link, nor their scripts or styles, reached the origin.
    expect(
      server.requests
        .slice(requestsAfterOffline)
        .filter((path) => path !== '/sw.js'),
    ).toEqual([]);
    await searchTab.close();
    await detailTab.close();
  } finally {
    await server.close();
  }
});
