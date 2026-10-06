import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { productionServer } from './production-server';

test('native activation after candidate eviction retains a usable prior offline shell', async ({
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
    const active = (await page.locator('.shell-version').textContent())!.split(
      ': ',
    )[1]!;
    server.revision('b');
    await page.getByRole('button', { name: 'Check for shell update' }).click();
    await expect(
      page.getByRole('button', { name: 'Update shell and reload' }),
    ).toBeVisible();
    const bVersion = JSON.parse(
      (await readFile(resolve('artifacts/pwa-b/sw.js'), 'utf8')).match(
        /const SHELL = (.*);/,
      )![1]!,
    ).version as string;
    await page.evaluate(async (version) => {
      for (const name of await caches.keys())
        if (
          name.startsWith('intermed-public-shell-v1-') &&
          name !== 'intermed-public-shell-v1-' + version
        )
          await caches.delete(name);
    }, active);
    await page.close();
    // Closing all controlled tabs permits native activation without UI consent.
    await new Promise((done) => setTimeout(done, 750));
    server.failure('offline');
    const reopened = await context.newPage();
    await reopened.goto(server.url + '/status');
    await expect(
      reopened.getByRole('heading', { name: 'Development status' }),
    ).toBeVisible();
    await expect(
      reopened.getByText('Shell available offline', { exact: true }),
    ).toBeVisible();
    await expect(
      reopened.locator('meta[name="intermed-shell-revision"]'),
    ).toHaveAttribute('content', 'a');
    await expect(reopened.locator('html')).toHaveAttribute(
      'data-intermed-shell-revision',
      'a',
    );
    const status = await reopened.evaluate(
      async () =>
        new Promise<{ workerVersion: string; version: string }>((done) => {
          const port = new MessageChannel();
          port.port1.onmessage = (event) => {
            port.port1.close();
            done(event.data);
          };
          navigator.serviceWorker.controller!.postMessage(
            { type: 'SHELL_STATUS' },
            [port.port2],
          );
        }),
    );
    expect(status.workerVersion).toBe(bVersion);
    expect(status.version).toBe(active);
  } finally {
    await server.close();
  }
});
