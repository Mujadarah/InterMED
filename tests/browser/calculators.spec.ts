import { expect, test } from '@playwright/test';

test('calculates BMI on the development calculators page', async ({ page }) => {
  await page.goto('/calculators');
  await expect(
    page.getByRole('heading', { name: 'Calculators' }),
  ).toBeVisible();
  await expect(
    page.getByText('Development preview — not for clinical use.'),
  ).toBeVisible();

  await page.getByLabel('Height unit').selectOption('cm');
  await page.getByLabel('Weight', { exact: true }).fill('70');
  await page.getByLabel('Height', { exact: true }).fill('175');
  await page.getByLabel('Age in years').fill('30');
  await page.getByRole('button', { name: 'Calculate' }).click();

  await expect(page.getByText('Result: 22.9 kg/m²')).toBeVisible();
  await expect(page.getByText(/Normal range/)).toBeVisible();
  await expect(
    page.getByText('Review status: CLINICALLY REVIEWED'),
  ).toBeVisible();
});
