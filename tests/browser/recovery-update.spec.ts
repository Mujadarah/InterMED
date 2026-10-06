import { expect, test, type Page } from '@playwright/test';
import { productionServer } from './production-server';

async function ready(page: Page, url: string) {
  await page.goto(url);
  await expect(
    page.getByText('Shell available offline', { exact: true }),
  ).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}
async function waiting(page: Page) {
  await page.getByRole('button', { name: 'Check for shell update' }).click();
  await expect(
    page.getByRole('button', { name: 'Update shell and reload' }),
  ).toBeVisible();
}
async function activate(page: Page, revision: string) {
  await page.getByRole('button', { name: 'Update shell and reload' }).click();
  await expect(
    page.locator('meta[name="intermed-shell-revision"]'),
  ).toHaveAttribute('content', revision);
  await expect(
    page.getByText('Shell available offline', { exact: true }),
  ).toBeVisible();
}
async function evictWaiting(page: Page, retain: string[]) {
  await page.evaluate(async (versions) => {
    for (const name of await caches.keys())
      if (
        name.startsWith('intermed-public-shell-v1-') &&
        !versions.includes(name)
      )
        await caches.delete(name);
  }, retain);
  await page.close();
  await new Promise((done) => setTimeout(done, 750));
}

test('rollback A to B to A then evicted C retains the actual last activated shell offline', async ({
  page,
  context,
}) => {
  const server = await productionServer();
  try {
    await ready(page, server.url);
    server.revision('b');
    await waiting(page);
    await activate(page, 'b');
    server.revision('a');
    await waiting(page);
    await activate(page, 'a');
    const retained = await page.evaluate(() => caches.keys());
    server.revision('c');
    await waiting(page);
    await evictWaiting(page, retained);
    server.failure('offline');
    const reopened = await context.newPage();
    await ready(reopened, server.url + '/status');
    await expect(
      reopened.locator('meta[name="intermed-shell-revision"]'),
    ).toHaveAttribute('content', 'a');
  } finally {
    await server.close();
  }
});

test('a usable waiting recovery update survives fallback probes and page reload until explicit activation', async ({
  page,
  context,
}) => {
  const server = await productionServer();
  try {
    await ready(page, server.url);
    const retained = await page.evaluate(() => caches.keys());
    server.revision('b');
    await waiting(page);
    await evictWaiting(page, retained);
    const recovered = await context.newPage();
    await ready(recovered, server.url);
    await expect(recovered.getByRole('alert')).toContainText(
      'Shell update failed',
    );
    server.revision('c');
    await waiting(recovered);
    // Observe the adapter's actual focus-probe reply. Separate worker messages
    // can complete concurrently, so a second round trip is not a barrier.
    await recovered.evaluate(
      () =>
        new Promise<void>((done) => {
          const OriginalChannel = window.MessageChannel;
          window.MessageChannel = class extends OriginalChannel {
            constructor() {
              super();
              this.port1.addEventListener(
                'message',
                () => {
                  // Let the adapter's handler, promise continuation and render run.
                  queueMicrotask(() => requestAnimationFrame(() => done()));
                },
                { once: true },
              );
            }
          };
          window.dispatchEvent(new Event('focus'));
          window.MessageChannel = OriginalChannel;
        }),
    );
    await expect(
      recovered.getByRole('button', { name: 'Update shell and reload' }),
    ).toBeVisible();
    // Model a repair already requested while a newer waiting release appeared.
    await expect(
      recovered.getByRole('button', { name: 'Retry shell caching' }),
    ).toHaveCount(0);
    await recovered.evaluate(() =>
      navigator.serviceWorker.controller!.postMessage({ type: 'REPAIR_SHELL' }),
    );
    await expect(
      recovered.getByText(/Shell caching retry failed/),
    ).toBeVisible();
    await expect(
      recovered.getByRole('button', { name: 'Update shell and reload' }),
    ).toBeVisible();
    await recovered.reload();
    await expect(
      recovered.getByRole('button', { name: 'Update shell and reload' }),
    ).toBeVisible();
    await expect(
      recovered.locator('meta[name="intermed-shell-revision"]'),
    ).toHaveAttribute('content', 'a');
    await activate(recovered, 'c');
  } finally {
    await server.close();
  }
});
