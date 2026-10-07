import { expect, test } from '@playwright/test';
import { productionServer } from './production-server';

for (const operation of ['status', 'javascript'] as const) {
  test(`slow synthetic storage keeps ${operation} within the readiness deadline`, async ({
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
      const result = await page.evaluate(async (kind) => {
        const worker = navigator.serviceWorker.controller!;
        const message = (data: unknown) =>
          new Promise<{ ready?: boolean }>((resolve) => {
            const channel = new MessageChannel();
            channel.port1.onmessage = (event) => {
              channel.port1.close();
              resolve(event.data);
            };
            worker.postMessage(data, [channel.port2]);
          });
        await message({ type: 'SYNTHETIC_READ_LATENCY', delay: 400 });
        const timeout = Symbol('timeout');
        let timer: ReturnType<typeof setTimeout>;
        const work =
          kind === 'status'
            ? message({ type: 'SHELL_STATUS' }).then(
                (value) => value.ready === true,
              )
            : fetch(
                document.querySelector<HTMLScriptElement>(
                  'script[type="module"]',
                )!.src,
              ).then(
                async (response) =>
                  response.ok && (await response.text()).length > 100,
              );
        const result = await Promise.race([
          work,
          new Promise<typeof timeout>((resolve) => {
            timer = setTimeout(() => resolve(timeout), 3000);
          }),
        ]);
        clearTimeout(timer!);
        await message({ type: 'SYNTHETIC_READ_LATENCY', delay: 0 });
        return result === true;
      }, operation);
      expect(result).toBe(true);
    } finally {
      await server.close();
    }
  });
}
