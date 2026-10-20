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

test('renders offline deep links that carry a search query from the precache', async ({
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

    // A cold deep link to a query the search page itself writes into the URL.
    const searchTab = await context.newPage();
    await searchTab.goto(`${server.url}/search?q=fictivol`);
    await expect(
      searchTab.getByRole('heading', { name: 'Local medication search' }),
    ).toBeVisible();
    await expect(searchTab.getByTestId('medication-search-page')).toBeVisible();
    await expect(searchTab.getByRole('searchbox')).toHaveValue('fictivol');

    // A cold deep link to the query a detail link preserves from a result.
    const detailTab = await context.newPage();
    await detailTab.goto(`${server.url}/medication/${productId}?q=fictivol`);
    await expect(
      detailTab.getByRole('heading', { name: 'Fictivol alpha', level: 1 }),
    ).toBeVisible();
    await expect(
      detailTab.getByRole('link', { name: 'Back to results for fictivol' }),
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

test('renders an offline deep link to /favorites from the precache', async ({
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
    // Favorite one synthetic product through the local-store harness, so the
    // deep link is the first time this session opens the favorites route.
    const favoriteId = await page.evaluate(async () => {
      const harness = (window as unknown as HarnessWindow)
        .__intermedLocalStoreHarness;
      const staged = await harness.stageAndActivate('alpha');
      const productId = staged.productIds['SP-FICTIVOL'] ?? '';
      await harness.addFavorite(productId);
      return productId;
    });
    expect(favoriteId).not.toBe('');

    // Disconnect the origin in every engine; also disable networking in Chromium.
    server.failure('offline');
    if (testInfo.project.name === 'chromium-desktop')
      await context.setOffline(true);
    const requestsAfterOffline = server.requests.length;

    // A cold deep link to the favorites route, never visited in this session.
    const favoritesTab = await context.newPage();
    await favoritesTab.goto(`${server.url}/favorites`);
    await expect(
      favoritesTab.getByRole('heading', { name: 'Favorites', level: 1 }),
    ).toBeVisible();
    // Reconciliation against the active dataset refreshed the favorite's
    // display name to the product's current commercial name.
    const favoriteLink = favoritesTab.getByRole('link', {
      name: 'Fictivol alpha',
    });
    await expect(favoriteLink).toBeVisible();
    await expect(favoriteLink).toHaveAttribute(
      'href',
      `/medication/${encodeURIComponent(favoriteId)}`,
    );

    // Neither the deep link, nor its scripts or styles, reached the origin.
    expect(
      server.requests
        .slice(requestsAfterOffline)
        .filter((path) => path !== '/sw.js'),
    ).toEqual([]);
    await favoritesTab.close();
  } finally {
    await server.close();
  }
});

test('renders an offline deep link to /interactions from the precache', async ({
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

    server.failure('offline');
    if (testInfo.project.name === 'chromium-desktop')
      await context.setOffline(true);
    const requestsAfterOffline = server.requests.length;

    const interactionsTab = await context.newPage();
    await interactionsTab.goto(`${server.url}/interactions`);
    await expect(
      interactionsTab.getByRole('heading', { name: 'Check interactions' }),
    ).toBeVisible();
    await expect(
      interactionsTab.getByText(
        'Interaction checking is unavailable. No approved interaction source is configured.',
      ),
    ).toBeVisible();
    expect(
      server.requests
        .slice(requestsAfterOffline)
        .filter((path) => path !== '/sw.js'),
    ).toEqual([]);
    await interactionsTab.close();
  } finally {
    await server.close();
  }
});

test('renders an offline deep link to /calculators from the precache', async ({
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

    // Disconnect the origin in every engine; also disable networking in Chromium.
    server.failure('offline');
    if (testInfo.project.name === 'chromium-desktop')
      await context.setOffline(true);
    const requestsAfterOffline = server.requests.length;

    // A cold deep link to the calculators route, never visited in this
    // session. The page renders from its precached lazy chunk and needs no
    // staged dataset, so no local-store preparation is required.
    const calculatorsTab = await context.newPage();
    await calculatorsTab.goto(`${server.url}/calculators`);
    await expect(
      calculatorsTab.getByRole('heading', { name: 'Calculators', level: 1 }),
    ).toBeVisible();
    await expect(
      calculatorsTab.getByText('Development preview — not for clinical use.'),
    ).toBeVisible();

    // Neither the deep link, nor its scripts or styles, reached the origin.
    expect(
      server.requests
        .slice(requestsAfterOffline)
        .filter((path) => path !== '/sw.js'),
    ).toEqual([]);
    await calculatorsTab.close();
  } finally {
    await server.close();
  }
});
