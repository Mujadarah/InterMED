import { expect, test } from '@playwright/test';
import { productionServer } from './production-server';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('failed activation cancels reload consent and a later controller change remains user-controlled', async ({
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
    // Evict only candidate B's cache: A must stay usable and consent must expire.
    const active = (await page.locator('.shell-version').textContent())!.split(
      ': ',
    )[1]!;
    await page.evaluate(async (activeVersion) => {
      for (const name of await caches.keys())
        if (
          name.startsWith('intermed-public-shell-v1-') &&
          name !== 'intermed-public-shell-v1-' + activeVersion
        )
          await caches.delete(name);
    }, active);
    await page.getByRole('button', { name: 'Update shell and reload' }).click();
    await expect(page.getByRole('alert')).toContainText('Shell update failed');
    server.revision('c');
    await page.getByRole('button', { name: 'Check for shell update' }).click();
    await expect(
      page.getByRole('button', { name: 'Update shell and reload' }),
    ).toBeVisible();
    // An external controller change models a concurrent client activation/race.
    // It must not reuse this tab's failed consent for B to reload into C.
    await page.evaluate(async () => {
      (await navigator.serviceWorker.getRegistration())!.waiting!.postMessage({
        type: 'ACTIVATE_SHELL',
      });
    });
    await expect(
      page.getByRole('button', { name: 'Reload shell when ready' }),
    ).toBeVisible();
    await expect(
      page.locator('meta[name="intermed-shell-revision"]'),
    ).toHaveAttribute('content', 'a');
    await page.getByRole('button', { name: 'Reload shell when ready' }).click();
    await expect(
      page.locator('meta[name="intermed-shell-revision"]'),
    ).toHaveAttribute('content', 'c');
  } finally {
    await server.close();
  }
});

test('bounds superseded waiting caches while retaining the active shell', async ({
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
    const active = (await page.locator('.shell-version').textContent())!.split(
      ': ',
    )[1]!;
    server.revision('b');
    await page.getByRole('button', { name: 'Check for shell update' }).click();
    await expect(
      page.getByRole('button', { name: 'Update shell and reload' }),
    ).toBeVisible();
    server.revision('c');
    await page.getByRole('button', { name: 'Check for shell update' }).click();
    const cVersion = JSON.parse(
      (await readFile(resolve('artifacts/pwa-c/sw.js'), 'utf8')).match(
        /const SHELL = (.*);/,
      )![1]!,
    ).version as string;
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const worker = (await navigator.serviceWorker.getRegistration())
            ?.waiting;
          if (!worker) return '';
          return new Promise<string>((done) => {
            const port = new MessageChannel();
            port.port1.onmessage = (event) => {
              port.port1.close();
              done(event.data.version);
            };
            worker.postMessage({ type: 'SHELL_STATUS' }, [port.port2]);
          });
        }),
      )
      .toBe(cVersion);
    expect(
      await page.evaluate(async () =>
        (await caches.keys())
          .filter((name) => name.startsWith('intermed-public-shell-v1-'))
          .sort(),
      ),
    ).toEqual(
      [
        'intermed-public-shell-v1-' + active,
        'intermed-public-shell-v1-' + cVersion,
      ].sort(),
    );
    server.failure('offline');
    await page.reload();
    await expect(
      page.locator('meta[name="intermed-shell-revision"]'),
    ).toHaveAttribute('content', 'a');
  } finally {
    await server.close();
  }
});

test('retains the actual prior active shell across three releases without cache-order assumptions', async ({
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
    await page.getByRole('button', { name: 'Update shell and reload' }).click();
    await expect(
      page.locator('meta[name="intermed-shell-revision"]'),
    ).toHaveAttribute('content', 'b');
    await expect(
      page.getByText('Shell available offline', { exact: true }),
    ).toBeVisible();
    const prior = (await page.locator('.shell-version').textContent())!.split(
      ': ',
    )[1]!;
    // Recreate an older A cache after B. Cache list ordering must not select A.
    await page.evaluate(async (priorVersion) => {
      const priorKey = 'intermed-public-shell-v1-' + priorVersion;
      const old = (await caches.keys()).find(
        (name) =>
          name.startsWith('intermed-public-shell-v1-') && name !== priorKey,
      )!;
      const entries = [];
      const cache = await caches.open(old);
      for (const request of await cache.keys())
        entries.push([request, (await cache.match(request))!] as const);
      await caches.delete(old);
      const recreated = await caches.open(old);
      for (const [request, response] of entries)
        await recreated.put(request, response);
    }, prior);
    server.revision('c');
    await page.getByRole('button', { name: 'Check for shell update' }).click();
    await page.getByRole('button', { name: 'Update shell and reload' }).click();
    await expect(
      page.locator('meta[name="intermed-shell-revision"]'),
    ).toHaveAttribute('content', 'c');
    await expect(
      page.getByText('Shell available offline', { exact: true }),
    ).toBeVisible();
    const current = (await page.locator('.shell-version').textContent())!.split(
      ': ',
    )[1]!;
    expect(
      await page.evaluate(async () =>
        (await caches.keys()).filter((name) =>
          name.startsWith('intermed-public-shell-v1-'),
        ),
      ),
    ).toEqual(
      expect.arrayContaining([
        'intermed-public-shell-v1-' + prior,
        'intermed-public-shell-v1-' + current,
      ]),
    );
    expect(
      await page.evaluate(async () =>
        (await caches.keys()).filter((name) =>
          name.startsWith('intermed-public-shell-v1-'),
        ),
      ),
    ).toHaveLength(2);
  } finally {
    await server.close();
  }
});
