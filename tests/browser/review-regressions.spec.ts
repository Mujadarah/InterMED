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

for (const damaged of ['html', 'javascript'] as const) {
  test(`cached ${damaged} corruption loses readiness and can be explicitly repaired`, async ({
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
      const damagedUrl = await page.evaluate(async (kind) => {
        const name = (await caches.keys()).find((value) =>
          value.startsWith('intermed-public-shell-v1-'),
        )!;
        const cache = await caches.open(name);
        const keys = await cache.keys();
        const url = keys.find((key) =>
          kind === 'html'
            ? key.url.endsWith('/index.html')
            : key.url.endsWith('.js'),
        )!.url;
        const original = (await cache.match(url))!;
        await cache.put(
          url,
          new Response((await original.text()) + '\nSYNTHETIC_DAMAGED_CACHE', {
            status: original.status,
            headers: original.headers,
          }),
        );
        window.dispatchEvent(new Event('focus'));
        return url;
      }, damaged);
      await expect(
        page.getByText('Shell unavailable offline', { exact: true }),
      ).toBeVisible();
      // Online reads fall through instead of returning damaged cached bytes.
      expect(
        await page.evaluate(
          async (url) => (await fetch(url)).text(),
          damagedUrl,
        ),
      ).not.toContain('SYNTHETIC_DAMAGED_CACHE');
      await page.getByRole('button', { name: 'Retry shell caching' }).click();
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
}

test('damaged waiting JavaScript refuses activation and preserves the usable active shell', async ({
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
    const retained = await page.evaluate(() => caches.keys());
    server.revision('b');
    await page.getByRole('button', { name: 'Check for shell update' }).click();
    await expect(
      page.getByRole('button', { name: 'Update shell and reload' }),
    ).toBeVisible();
    await page.evaluate(async (prior) => {
      const name = (await caches.keys()).find(
        (value) => !prior.includes(value),
      )!;
      const cache = await caches.open(name);
      const key = (await cache.keys()).find((value) =>
        value.url.endsWith('.js'),
      )!;
      const original = (await cache.match(key))!;
      await cache.put(
        key,
        new Response('SYNTHETIC_DAMAGED_CACHE', {
          status: original.status,
          headers: original.headers,
        }),
      );
    }, retained);
    await page.getByRole('button', { name: 'Update shell and reload' }).click();
    await expect(page.getByRole('alert')).toContainText('Shell update failed');
    await expect(
      page.locator('meta[name="intermed-shell-revision"]'),
    ).toHaveAttribute('content', 'a');
    server.failure('offline');
    await page.reload();
    await expect(
      page.getByText('Shell available offline', { exact: true }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute(
      'data-intermed-shell-revision',
      'a',
    );
  } finally {
    await server.close();
  }
});

test('an evicted candidate cannot fall back to damaged prior HTML', async ({
  page,
  context,
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
    const retained = await page.evaluate(() => caches.keys());
    server.revision('b');
    await page.getByRole('button', { name: 'Check for shell update' }).click();
    await expect(
      page.getByRole('button', { name: 'Update shell and reload' }),
    ).toBeVisible();
    await page.evaluate(async (prior) => {
      for (const name of await caches.keys()) {
        if (!prior.includes(name)) await caches.delete(name);
        else {
          const cache = await caches.open(name);
          const original = (await cache.match('/index.html'))!;
          await cache.put(
            '/index.html',
            new Response('SYNTHETIC_DAMAGED_CACHE', {
              status: original.status,
              headers: original.headers,
            }),
          );
        }
      }
    }, retained);
    await page.close();
    await new Promise((done) => setTimeout(done, 750));
    const reopened = await context.newPage();
    await reopened.goto(server.url + '/status');
    await expect(
      reopened.getByText('Shell unavailable offline', { exact: true }),
    ).toBeVisible();
    await expect(reopened.locator('html')).toHaveAttribute(
      'data-intermed-shell-revision',
      'b',
    );
    server.failure('offline');
    await expect(reopened.reload({ timeout: 5000 })).rejects.toThrow();
    await expect(
      reopened.getByRole('heading', { name: 'InterMED' }),
    ).toHaveCount(0);
  } finally {
    await server.close();
  }
});

for (const kind of ['javascript', 'html'] as const) {
  test(`cached ${kind} with a misleading MIME substring is not ready`, async ({
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
      await page.evaluate(async (type) => {
        const name = (await caches.keys()).find((value) =>
          value.startsWith('intermed-public-shell-v1-'),
        )!;
        const cache = await caches.open(name);
        const key = (await cache.keys()).find((value) =>
          type === 'html'
            ? value.url.endsWith('/index.html')
            : value.url.endsWith('.js'),
        )!;
        const original = (await cache.match(key))!;
        const headers = new Headers(original.headers);
        headers.set(
          'Content-Type',
          type === 'html' ? 'text/htmljunk' : 'text/plain; fixture=javascript',
        );
        // Keep the actual pinned bytes unchanged: only the serving MIME is bad.
        await cache.put(
          key,
          new Response(await original.arrayBuffer(), {
            status: original.status,
            headers,
          }),
        );
        window.dispatchEvent(new Event('focus'));
      }, kind);
      await expect(
        page.getByText('Shell unavailable offline', { exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Retry shell caching' }).click();
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
}
