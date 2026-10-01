import { expect, test } from '@playwright/test';

test('launches a nonclinical shell without external requests or input forms', async ({
  page,
}) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).hostname !== '127.0.0.1')
      external.push(request.url());
  });
  await page.goto('/');
  await expect(
    page.getByText('Development · Not for clinical use'),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'A foundation for InterMED' }),
  ).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  expect(external).toEqual([]);
});

test('navigates and reloads a deep link', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Development status' }).click();
  await expect(page).toHaveURL(/\/status$/);
  await expect(
    page.getByRole('heading', { name: 'Development status' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(
      /Medication lookup and interaction checking are unavailable/,
    ),
  ).toBeVisible();
});

test('recovers from an unknown route', async ({ page }) => {
  await page.goto('/unavailable');
  await expect(
    page.getByRole('heading', { name: 'Page unavailable' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Return to overview' }).click();
  await expect(
    page.getByRole('heading', { name: 'A foundation for InterMED' }),
  ).toBeVisible();
});

test('supports keyboard skip navigation', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'A foundation for InterMED' }),
  ).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Skip to content' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
});

test('fits the viewport and records a synthetic shell screenshot', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(
    page.getByText('Development · Not for clinical use'),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('shell.png'),
    fullPage: true,
  });
});
