import { expect, test, type Page } from '@playwright/test';
import { productionServer } from './production-server';

async function storage(
  page: Page,
  target: 'active' | 'waiting',
  block: boolean,
) {
  await page.evaluate(
    async ({ target, block }) => {
      const registration = await navigator.serviceWorker.getRegistration();
      const worker =
        target === 'active'
          ? navigator.serviceWorker.controller
          : registration?.waiting;
      if (!worker) throw new Error('Missing synthetic worker');
      await new Promise<void>((done) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
          channel.port1.close();
          done();
        };
        worker.postMessage({ type: 'SYNTHETIC_STORAGE', block }, [
          channel.port2,
        ]);
      });
    },
    { target, block },
  );
}

test('activation storage rejection reports failure and clears reload consent', async ({
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
    server.failure('storage-after');
    await page.getByRole('button', { name: 'Check for shell update' }).click();
    await expect(
      page.getByRole('button', { name: 'Update shell and reload' }),
    ).toBeVisible();
    await storage(page, 'waiting', true);
    await page.getByRole('button', { name: 'Update shell and reload' }).click();
    await expect(page.getByRole('alert')).toContainText('Shell update failed');
    await storage(page, 'waiting', false);
    await page.evaluate(async () =>
      (await navigator.serviceWorker.getRegistration())!.waiting!.postMessage({
        type: 'ACTIVATE_SHELL',
      }),
    );
    await expect(
      page.getByRole('button', { name: 'Reload shell when ready' }),
    ).toBeVisible();
    await expect(
      page.locator('meta[name="intermed-shell-revision"]'),
    ).toHaveAttribute('content', 'a');
  } finally {
    await server.close();
  }
});

test('active storage rejection permits an online network reload and reports offline unavailable', async ({
  page,
}) => {
  const server = await productionServer();
  server.failure('storage-after');
  try {
    await page.goto(server.url);
    await expect(
      page.getByText('Shell available offline', { exact: true }),
    ).toBeVisible();
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
    );
    const before = await page.evaluate(() => caches.keys());
    await storage(page, 'active', true);
    await page.reload();
    await expect(
      page.getByRole('heading', {
        name: 'A foundation for InterMED',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText('Shell unavailable offline', { exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => caches.keys())).toEqual(before);
  } finally {
    await server.close();
  }
});

test('a replacement cannot remove the prior shell when active storage status is unavailable', async ({
  page,
}) => {
  const server = await productionServer();
  server.failure('storage-after');
  try {
    await page.goto(server.url);
    await expect(
      page.getByText('Shell available offline', { exact: true }),
    ).toBeVisible();
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
    );
    const before = await page.evaluate(() => caches.keys());
    await storage(page, 'active', true);
    server.revision('b');
    server.failure('none');
    await page.getByRole('button', { name: 'Check for shell update' }).click();
    await expect(page.getByRole('alert')).toContainText('Shell update failed');
    await page.waitForFunction(
      async () =>
        !(await navigator.serviceWorker.getRegistration())?.installing,
    );
    expect(await page.evaluate(() => caches.keys())).toEqual(before);
    await storage(page, 'active', false);
    server.failure('offline');
    await page.reload();
    await expect(
      page.getByText('Shell available offline', { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('meta[name="intermed-shell-revision"]'),
    ).toHaveAttribute('content', 'a');
  } finally {
    await server.close();
  }
});
