import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { LocalStoreHarness } from '../../apps/web/src/dev/local-store-harness';
import { productionServer } from './production-server';

type HarnessWindow = Window & {
  __intermedLocalStoreHarness: LocalStoreHarness;
};

const firstLoadResponseBodyBudgetBytes = 1_500_000;
const firstInteractiveInputBudgetMilliseconds = 10_000;

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

test('cold production load reaches an interactive search input within budget', async ({
  browser,
  page,
}, testInfo: TestInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop');
  test.setTimeout(30_000);

  const server = await productionServer();
  let fixturePage: Page | null = null;
  try {
    server.revision('harness');
    fixturePage = await page.context().newPage();
    await fixturePage.goto(`${server.url}/status`);
    await harnessReady(fixturePage);
    await fixturePage.evaluate(async () => {
      const harness = (window as unknown as HarnessWindow)
        .__intermedLocalStoreHarness;
      await harness.stageAndActivate('m12-first-load');
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map((registration) => registration.unregister()),
      );
      await Promise.all(
        (await caches.keys()).map((cacheName) => caches.delete(cacheName)),
      );
    });
    await fixturePage.close();
    fixturePage = null;

    // The synthetic dataset stays in IndexedDB. The measured page uses the
    // ordinary production build with an empty HTTP/Cache Storage cache.
    server.revision('a');
    server.requests.splice(0);
    server.transfers.splice(0);

    const startedAt = performance.now();
    // Every wait gets the time left until the shared first-interactive
    // deadline, so a valid but slow load is judged by the budget assertion
    // below instead of failing early on Playwright's default 5 s timeout.
    const remaining = () =>
      Math.max(
        1,
        firstInteractiveInputBudgetMilliseconds -
          (performance.now() - startedAt),
      );
    await page.goto(server.url, { waitUntil: 'commit', timeout: remaining() });
    await expect(
      page.getByRole('heading', { name: 'A foundation for InterMED' }),
    ).toBeVisible({ timeout: remaining() });
    await page
      .getByRole('link', { name: 'Medication search' })
      .click({ timeout: remaining() });
    const searchbox = page.getByRole('searchbox');
    await expect(searchbox).toBeVisible({ timeout: remaining() });
    await expect(searchbox).toBeEnabled({ timeout: remaining() });
    const firstInteractiveInputMilliseconds = performance.now() - startedAt;

    // The byte window ends only after the service worker has finished
    // installing (its shell precache is fetched one file at a time), so the
    // first-load total includes every precached asset, not just the page.
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const worker = registration.active;
      if (worker && worker.state !== 'activated')
        await new Promise<void>((resolve) => {
          worker.addEventListener('statechange', () => {
            if (worker.state === 'activated') resolve();
          });
        });
    });
    await page.waitForLoadState('networkidle');
    const responseBodyBytes = server.transfers.reduce(
      (total, transfer) => total + transfer.responseBodyBytes,
      0,
    );
    const measurement = {
      browser: browser.version(),
      project: testInfo.project.name,
      measuredPath: 'cold / load followed by Medication search navigation',
      dataset:
        'two-product synthetic IndexedDB seed prepared before measurement',
      responseCount: server.transfers.length,
      responseBodyBytes,
      responseBodyBudgetBytes: firstLoadResponseBodyBudgetBytes,
      firstInteractiveSearchInputMilliseconds: Number(
        firstInteractiveInputMilliseconds.toFixed(2),
      ),
      firstInteractiveInputBudgetMilliseconds:
        firstInteractiveInputBudgetMilliseconds,
    };
    console.info(`M12_FIRST_LOAD ${JSON.stringify(measurement)}`);

    expect(server.requests).toContain('/');
    expect(responseBodyBytes).toBeGreaterThan(0);
    expect(
      responseBodyBytes,
      `Cold-load response bodies total ${responseBodyBytes} bytes, exceeding the ${firstLoadResponseBodyBudgetBytes}-byte budget by ${Math.max(0, responseBodyBytes - firstLoadResponseBodyBudgetBytes)} bytes`,
    ).toBeLessThanOrEqual(firstLoadResponseBodyBudgetBytes);
    expect(
      firstInteractiveInputMilliseconds,
      `Interactive search input took ${firstInteractiveInputMilliseconds.toFixed(2)} ms, exceeding the ${firstInteractiveInputBudgetMilliseconds}-ms budget by ${Math.max(0, firstInteractiveInputMilliseconds - firstInteractiveInputBudgetMilliseconds).toFixed(2)} ms`,
    ).toBeLessThanOrEqual(firstInteractiveInputBudgetMilliseconds);
  } finally {
    if (fixturePage && !fixturePage.isClosed()) await fixturePage.close();
    await server.close();
  }
});
