import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { productionServer } from './production-server';

const cached = async (page: Page) => {
  await expect(
    page.getByText('Shell available offline', { exact: true }),
  ).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
};
const keys = (page: Page) =>
  page.evaluate(async () => {
    const result: Record<string, string[]> = {};
    for (const name of await caches.keys())
      result[name] = (await (await caches.open(name)).keys()).map(
        (request) => request.url,
      );
    return result;
  });
const revision = (page: Page) =>
  page.locator('meta[name="intermed-shell-revision"]');

test('offline origin outage preserves launch, reload and deep links', async ({
  page,
  context,
}) => {
  const server = await productionServer();
  try {
    await page.goto(server.url);
    await cached(page);
    server.failure('offline');
    const before = server.requests.length;
    await page.goto(server.url + '/status');
    await expect(
      page.getByRole('heading', { name: 'Development status' }),
    ).toBeVisible();
    await page.reload();
    await cached(page);
    const next = await context.newPage();
    await next.goto(server.url);
    await cached(next);
    // A new page can trigger the browser's SW-script update check even offline.
    // Document that attempted check; shell navigations/assets must not hit origin.
    expect(
      server.requests.slice(before).filter((path) => path !== '/sw.js'),
    ).toEqual([]);
  } finally {
    await server.close();
  }
});

test('keeps prohibited responses, query variants and outside origins out of caches', async ({
  page,
}) => {
  const server = await productionServer();
  const external = await productionServer();
  try {
    await page.goto(server.url);
    await cached(page);
    const before = await keys(page);
    const probe = await page.context().newPage();
    await probe.goto(server.url + '/test-probe.html');
    await probe.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
    );
    const values = await probe.evaluate(async (outside) => {
      const results = [];
      for (const path of [
        '/api/reference',
        '/auth/session',
        '/admin/import',
        '/patient/synthetic',
        '/secret/test',
        '/regulatory/test',
        '/api/reference?query=synthetic',
      ])
        results.push(await (await fetch(path)).text());
      results.push(
        await (
          await fetch('/api/reference', { method: 'POST', body: 'synthetic' })
        ).text(),
      );
      results.push(
        await (
          await fetch('/admin/import', {
            headers: { Authorization: 'Synthetic canary' },
          })
        ).text(),
      );
      await fetch(outside + '/regulatory/test', { mode: 'no-cors' });
      await fetch('/manifest.webmanifest?synthetic=1');
      return results;
    }, external.url);
    expect(values.every((value) => value.includes('PROHIBITED_CANARY'))).toBe(
      true,
    );
    expect(await keys(probe)).toEqual(before);
    for (const urls of Object.values(before))
      for (const url of urls)
        expect(new URL(url).pathname).toMatch(
          /^\/(index\.html|manifest\.webmanifest|assets\/[\w-]+\.(js|css)|icons\/(icon-192|icon-512|maskable-512|apple-touch-180)\.png)$/,
        );
    const bodies = await probe.evaluate(async () => {
      const values = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys())
          values.push(await (await cache.match(request))!.text());
      }
      return values;
    });
    expect(bodies.join('')).not.toContain('PROHIBITED_CANARY');
  } finally {
    await server.close();
    await external.close();
  }
});

for (const failure of ['asset', 'corrupt', 'storage'] as const) {
  test(`reports unsuccessful initial caching: ${failure}`, async ({ page }) => {
    const server = await productionServer();
    server.failure(failure);
    try {
      await page.goto(server.url);
      await expect(
        page.getByText('Shell unavailable offline', { exact: true }),
      ).toBeVisible();
      expect(await keys(page)).toEqual({});
    } finally {
      await server.close();
    }
  });
}

test('reports evicted cached assets instead of claiming permanent readiness', async ({
  page,
}) => {
  const server = await productionServer();
  try {
    await page.goto(server.url);
    await cached(page);
    await page.evaluate(async () => {
      for (const name of await caches.keys())
        await (await caches.open(name)).delete('/icons/icon-192.png');
    });
    await page.getByRole('button', { name: 'Check for shell update' }).click();
    await expect(
      page.getByText('Shell unavailable offline', { exact: true }),
    ).toBeVisible();
  } finally {
    await server.close();
  }
});

test('two real builds wait for user action, block multiple tabs and preserve synthetic storage', async ({
  page,
  context,
}, testInfo) => {
  const server = await productionServer();
  try {
    await page.goto(server.url + '/status');
    await cached(page);
    await page.evaluate(async () => {
      localStorage.setItem('synthetic-preference', 'retain-me');
      await (
        await caches.open('synthetic-unrelated-cache')
      ).put('/synthetic-canary', new Response('retain-me'));
      await new Promise<void>((done, reject) => {
        const request = indexedDB.open('synthetic-persistence-canary', 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore('canary');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('canary', 'readwrite');
          tx.objectStore('canary').put('retain-me', 'synthetic');
          tx.oncomplete = () => {
            db.close();
            done();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    });
    const oldVersion = await page.locator('.shell-version').textContent();
    await expect(page.locator('html')).toHaveAttribute(
      'data-intermed-shell-revision',
      'a',
    );
    const oldScript = await page
      .locator('script[src^="/assets/"]')
      .getAttribute('src');
    const other = await context.newPage();
    await other.goto(server.url);
    await cached(other);
    const navigations: string[] = [];
    other.on('framenavigated', (frame) => {
      if (frame === other.mainFrame()) navigations.push(frame.url());
    });
    server.revision('b');
    await page.getByRole('button', { name: 'Check for shell update' }).click();
    await expect(
      page.getByRole('button', { name: 'Update shell and reload' }),
    ).toBeVisible();
    await expect(revision(page)).toHaveAttribute('content', 'a');
    await expect(page.locator('.shell-version')).toHaveText(oldVersion!);
    await page.getByRole('button', { name: 'Update shell and reload' }).click();
    await expect(page.getByText(/Close other InterMED tabs/)).toBeVisible();
    await expect(revision(other)).toHaveAttribute('content', 'a');
    expect(navigations).toEqual([]);
    // Reset scroll for a full-page capture of fixed-position elements.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath('update-blocked.png'),
      fullPage: true,
    });
    await other.close();
    await page.getByRole('button', { name: 'Update shell and reload' }).click();
    await expect(revision(page)).toHaveAttribute('content', 'b');
    await expect(page.locator('html')).toHaveAttribute(
      'data-intermed-shell-revision',
      'b',
    );
    await expect(page.locator('script[src^="/assets/"]')).not.toHaveAttribute(
      'src',
      oldScript!,
    );
    await cached(page);
    await expect(page).toHaveURL(server.url + '/status');
    expect(await page.locator('.shell-version').textContent()).not.toBe(
      oldVersion,
    );
    expect(
      await page.evaluate(() => localStorage.getItem('synthetic-preference')),
    ).toBe('retain-me');
    expect(
      await page.evaluate(async () =>
        (
          await (
            await caches.open('synthetic-unrelated-cache')
          ).match('/synthetic-canary')
        )?.text(),
      ),
    ).toBe('retain-me');
    expect(
      await page.evaluate(
        () =>
          new Promise((done, reject) => {
            const request = indexedDB.open('synthetic-persistence-canary', 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result;
              const read = db
                .transaction('canary')
                .objectStore('canary')
                .get('synthetic');
              read.onsuccess = () => {
                db.close();
                done(read.result);
              };
              read.onerror = () => reject(read.error);
            };
          }),
      ),
    ).toBe('retain-me');
    expect(
      Object.keys(await keys(page)).filter((name) =>
        name.startsWith('intermed-public-shell-v1-'),
      ),
    ).toHaveLength(2);
    server.failure('offline');
    await page.reload();
    await expect(revision(page)).toHaveAttribute('content', 'b');
  } finally {
    await server.close();
  }
});

for (const failure of ['asset', 'corrupt', 'storage', 'worker'] as const) {
  test(`failed update retains the usable prior shell: ${failure}`, async ({
    page,
  }) => {
    const server = await productionServer();
    try {
      await page.goto(server.url);
      await cached(page);
      const before = await keys(page);
      server.revision('b');
      server.failure(failure);
      await page
        .getByRole('button', { name: 'Check for shell update' })
        .click();
      await expect(page.getByRole('alert')).toContainText(
        'Shell update failed',
      );
      await expect(
        page.getByRole('button', { name: 'Update shell and reload' }),
      ).toHaveCount(0);
      expect(await keys(page)).toEqual(before);
      server.failure('offline');
      await page.goto(server.url + '/status');
      await cached(page);
      await expect(revision(page)).toHaveAttribute('content', 'a');
    } finally {
      await server.close();
    }
  });
}
