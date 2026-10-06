import { expect, test } from '@playwright/test';
import { productionServer } from './production-server';

test('explicit caching retry recovers a transient registration failure', async ({
  page,
}) => {
  const server = await productionServer();
  try {
    await page.addInitScript(() => {
      const register = navigator.serviceWorker.register.bind(
        navigator.serviceWorker,
      );
      let attempts = 0;
      navigator.serviceWorker.register = (...args) =>
        ++attempts === 1
          ? Promise.reject(
              new Error('Synthetic transient registration failure'),
            )
          : register(...args);
    });
    await page.goto(server.url);
    await expect(
      page.getByText('Shell unavailable offline', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Retry shell caching' }).click();
    await expect(
      page.getByText('Shell available offline', { exact: true }),
    ).toBeVisible();
  } finally {
    await server.close();
  }
});

test('confirmed complete cache eviction permits a real replacement build', async ({
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
    await page.evaluate(async () => {
      for (const name of await caches.keys()) await caches.delete(name);
    });
    server.revision('b');
    await page.getByRole('button', { name: 'Check for shell update' }).click();
    await expect(
      page.getByRole('button', { name: 'Update shell and reload' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Update shell and reload' }).click();
    await expect(
      page.locator('meta[name="intermed-shell-revision"]'),
    ).toHaveAttribute('content', 'b');
    await expect(
      page.getByText('Shell available offline', { exact: true }),
    ).toBeVisible();
    server.failure('offline');
    await page.reload();
    await expect(
      page.getByText('Shell available offline', { exact: true }),
    ).toBeVisible();
  } finally {
    await server.close();
  }
});

test('user-controlled same-build repair restores an evicted shell without clearing other storage', async ({
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
    await page.evaluate(async () => {
      localStorage.setItem('synthetic-repair-preference', 'retained');
      const canary = await caches.open('synthetic-repair-unrelated');
      await canary.put('/synthetic-repair-canary', new Response('retained'));
      for (const name of await caches.keys())
        if (name.startsWith('intermed-public-shell-v1-'))
          await caches.delete(name);
      window.dispatchEvent(new Event('focus'));
    });
    await expect(
      page.getByText('Shell unavailable offline', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Retry shell caching' }).click();
    await expect(
      page.getByText('Shell available offline', { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('meta[name="intermed-shell-revision"]'),
    ).toHaveAttribute('content', 'a');
    expect(
      await page.evaluate(() =>
        localStorage.getItem('synthetic-repair-preference'),
      ),
    ).toBe('retained');
    expect(
      await page.evaluate(async () =>
        (
          await (
            await caches.open('synthetic-repair-unrelated')
          ).match('/synthetic-repair-canary')
        )?.text(),
      ),
    ).toBe('retained');
    server.failure('offline');
    await page.reload();
    await expect(
      page.getByText('Shell available offline', { exact: true }),
    ).toBeVisible();
  } finally {
    await server.close();
  }
});
