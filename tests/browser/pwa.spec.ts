import { expect, test } from '@playwright/test';
import { productionServer } from './production-server';

test('provides install identity, metadata and decodable normal/maskable icons', async ({
  page,
  request,
}) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.headers()['content-type']).toContain(
    'application/manifest+json',
  );
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    name: 'InterMED Development',
    theme_color: '#075b70',
    background_color: '#f2f7f9',
  });
  await page.goto('/status');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  );
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    'content',
    /viewport-fit=cover/,
  );
  await expect(
    page.locator('meta[name="apple-mobile-web-app-capable"]'),
  ).toHaveAttribute('content', 'yes');
  for (const icon of manifest.icons) {
    const size = Number(icon.sizes.split('x')[0]);
    const dimensions = await page.evaluate(async (src: string) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }, icon.src);
    expect(dimensions).toEqual([size, size]);
  }
  expect(
    manifest.icons.map((icon: { purpose: string }) => icon.purpose),
  ).toContain('maskable');
  const mask = await page.evaluate(async () => {
    const image = new Image();
    image.src = '/icons/maskable-512.png';
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, 512, 512).data;
    let opaque = true;
    let outside = 0;
    let foreground = 0;
    for (let y = 0; y < 512; y++)
      for (let x = 0; x < 512; x++) {
        const i = (y * 512 + x) * 4;
        if (data[i + 3] !== 255) opaque = false;
        if (data[i] === 255) {
          foreground++;
          if (Math.hypot(x + 0.5 - 256, y + 0.5 - 256) > 0.4 * 512) outside++;
        }
      }
    return { opaque, outside, foreground };
  });
  expect(mask.opaque).toBe(true);
  expect(mask.outside).toBe(0);
  expect(mask.foreground).toBeGreaterThan(0);
});

test('caches only the shell and launches/reloads existing deep links offline', async ({
  page,
  context,
}, testInfo) => {
  const server = await productionServer();
  try {
    await page.goto(server.url);
    await expect(
      page.getByText('Shell available offline', { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        async () => (await navigator.serviceWorker.ready).scope,
      ),
    ).toBe(server.url + '/');
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
    );
    // WebKit's Windows offline emulator errors before cached navigation.
    // Disconnect the origin in every engine; also disable networking in Chromium.
    server.failure('offline');
    if (testInfo.project.name === 'chromium-desktop')
      await context.setOffline(true);
    await page.goto(server.url + '/status');
    await expect(
      page.getByRole('heading', { name: 'Development status' }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText('Shell available offline', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /Medication lookup and interaction checking are unavailable/,
      ),
    ).toBeVisible();
    const freshPage = await context.newPage();
    await freshPage.goto(server.url);
    await expect(
      freshPage.getByRole('heading', { name: 'A foundation for InterMED' }),
    ).toBeVisible();
  } finally {
    await server.close();
  }
});

test('explains installation differences and browser storage limits', async ({
  page,
}) => {
  await page.goto('/status');
  await expect(
    page.getByText(/Safari: Share → Add to Home Screen/),
  ).toBeVisible();
  await expect(
    page.getByText(/Private mode, quota limits or browser eviction/),
  ).toBeVisible();
  await expect(page.getByText(/Temporary development artwork/)).toBeVisible();
});

test('reports registration failure without claiming offline readiness', async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.serviceWorker.register = () =>
      Promise.reject(new Error('Synthetic registration denial'));
  });
  await page.goto('/');
  await expect(page.getByText('Shell unavailable offline')).toBeVisible();
  await expect(
    page.getByText('Shell available offline', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'A foundation for InterMED' }),
  ).toBeVisible();
});

test('does not fabricate an app fallback for a brand-new offline visit', async ({
  browser,
}) => {
  const context = await browser.newContext({ offline: true });
  const page = await context.newPage();
  let failed = false;
  try {
    await page.goto('http://127.0.0.1:4173/status');
  } catch {
    failed = true;
  }
  expect(failed).toBe(true);
  expect(
    await page.getByRole('heading', { name: 'Development status' }).count(),
  ).toBe(0);
  await context.close();
});
