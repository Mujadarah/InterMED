import { expect, test } from '@playwright/test';

test.describe('production interaction checker', () => {
  test('explains that checking is unavailable without an approved provider', async ({
    page,
  }) => {
    await page.goto('/interactions');

    await expect(
      page.getByRole('heading', { name: 'Check interactions' }),
    ).toBeVisible();
    await expect(page.getByRole('note')).toHaveText(
      'Development preview — not for clinical use. No interaction source has been approved.',
    );
    await expect(
      page.getByText(
        'Interaction checking is unavailable. No approved interaction source is configured.',
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Check selected products' }),
    ).toHaveCount(0);
  });
});
