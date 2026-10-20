import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import {
  buildSecurityHeaders,
  buildSwSecurityHeaders,
  headerContentSecurityPolicy,
} from '../../apps/web/security-headers';
import { productionServer } from './production-server';

function chromiumOnly(testInfo: { project: { name: string } }): void {
  // Header enforcement (framing in particular) is asserted in Chromium only.
  test.skip(
    testInfo.project.name !== 'chromium-desktop',
    'Security-header framing is Chromium-only',
  );
}

function lowered(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
}

test('serves the reviewed security headers on / and /sw.js', async ({
  request,
}) => {
  const server = await productionServer(undefined, { securityHeaders: true });
  try {
    const expected = buildSecurityHeaders();
    for (const path of ['/', '/sw.js']) {
      const response = await request.get(`${server.url}${path}`);
      expect(response.ok()).toBe(true);
      const headers = lowered(response.headers());
      const actual = path === '/sw.js' ? buildSwSecurityHeaders() : expected;
      for (const [name, value] of Object.entries(actual))
        expect(headers[name.toLowerCase()], `${path} ${name}`).toBe(value);
    }
    expect(expected['Content-Security-Policy']).toBe(
      headerContentSecurityPolicy,
    );
    const sw = lowered((await request.get(`${server.url}/sw.js`)).headers());
    expect(sw['cache-control']).toBe('no-cache');
  } finally {
    await server.close();
  }
});

test('loads and works with the security headers on', async ({
  page,
}, testInfo) => {
  chromiumOnly(testInfo);
  const server = await productionServer(undefined, { securityHeaders: true });
  try {
    await page.goto(`${server.url}/`);
    await expect(
      page.getByRole('heading', { name: 'A foundation for InterMED' }),
    ).toBeVisible();

    await page.goto(`${server.url}/search`);
    await expect(
      page.getByRole('heading', { name: 'Local medication search' }),
    ).toBeVisible();
    await expect(page.getByRole('searchbox')).toBeVisible();

    await page.goto(`${server.url}/calculators`);
    await expect(
      page.getByRole('heading', { name: 'Calculators' }),
    ).toBeVisible();
    await page.getByLabel('Height unit').selectOption('cm');
    await page.getByLabel('Weight', { exact: true }).fill('70');
    await page.getByLabel('Height', { exact: true }).fill('175');
    await page.getByLabel('Age in years').fill('30');
    await page.getByRole('button', { name: 'Calculate' }).click();
    await expect(page.getByText('Result: 22.9 kg/m²')).toBeVisible();

    await page.goto(`${server.url}/status`);
    await expect(
      page.getByRole('heading', { name: 'Development status' }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Diagnostics', exact: true }),
    ).toBeVisible();
  } finally {
    await server.close();
  }
});

/**
 * Render a static iframe, then assign its URL through the DOM so no URL is
 * ever interpolated into HTML markup.
 */
async function loadIntoStaticFrame(
  page: Page,
  url: string,
  title: string,
): Promise<void> {
  await page.setContent("<iframe width='800' height='600'></iframe>");
  await page.locator('iframe').evaluate(
    (frame, input) => {
      frame.setAttribute('title', input.title);
      frame.setAttribute('src', input.url);
    },
    { url, title },
  );
}

test('refuses to frame the origin', async ({ page }, testInfo) => {
  chromiumOnly(testInfo);
  // The vessel carries no CSP of its own, so only the framed response's
  // `frame-ancestors` decides whether the iframe loads.
  const parent = await productionServer();
  const server = await productionServer(undefined, { securityHeaders: true });
  const plain = await productionServer();
  try {
    await page.goto(`${parent.url}/test-framing-parent.html`);
    await expect(
      page.getByRole('heading', { name: 'Page unavailable' }),
    ).toBeVisible();

    // Control: without the response headers the same origin frames fine.
    await loadIntoStaticFrame(page, `${plain.url}/`, 'framing control');
    await expect(
      page
        .frameLocator('iframe')
        .getByRole('heading', { name: 'A foundation for InterMED' }),
    ).toBeVisible({ timeout: 10_000 });

    const refused = page.waitForEvent('console', {
      predicate: (message: ConsoleMessage) =>
        message.type() === 'error' && /frame-ancestors/i.test(message.text()),
      timeout: 10_000,
    });
    await loadIntoStaticFrame(page, `${server.url}/`, 'framing probe');
    await refused;
    // The framed shell must never render inside the probing page.
    const framed = page.frameLocator('iframe');
    await expect(
      framed.getByRole('heading', { name: 'A foundation for InterMED' }),
    ).toHaveCount(0);
  } finally {
    await parent.close();
    await server.close();
    await plain.close();
  }
});
