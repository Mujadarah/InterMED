import { expect, test } from '@playwright/test';
import { productionServer } from './production-server';

test('a failed network update check preserves an already waiting usable release', async ({
  page,
}) => {
  const server = await productionServer();
  try {
    await page.goto(server.url);
    await expect(
      page.getByText('Shell available offline', { exact: true }),
    ).toBeVisible();
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
    );
    server.revision('b');
    await page.getByRole('button', { name: 'Check for shell update' }).click();
    await expect(
      page.getByRole('button', { name: 'Update shell and reload' }),
    ).toBeVisible();
    await page.evaluate(() => {
      const update = ServiceWorkerRegistration.prototype.update;
      ServiceWorkerRegistration.prototype.update = async function () {
        try {
          return await update.call(this);
        } catch (error) {
          // Instrument completion only; the real worker-script request fails.
          setTimeout(() => {
            document.documentElement.dataset['updateCheckFailed'] = 'true';
          }, 0);
          throw error;
        }
      };
    });
    server.failure('worker');
    await page.getByRole('button', { name: 'Check for shell update' }).click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-update-check-failed',
      'true',
    );
    await expect(
      page.getByRole('button', { name: 'Update shell and reload' }),
    ).toBeVisible();
    expect(
      await page.evaluate(async () =>
        Boolean((await navigator.serviceWorker.getRegistration())?.waiting),
      ),
    ).toBe(true);
    server.failure('none');
    await page.getByRole('button', { name: 'Update shell and reload' }).click();
    await expect(
      page.locator('meta[name="intermed-shell-revision"]'),
    ).toHaveAttribute('content', 'b');
    server.failure('offline');
    await page.reload();
    await expect(
      page.getByText('Shell available offline', { exact: true }),
    ).toBeVisible();
  } finally {
    await server.close();
  }
});
