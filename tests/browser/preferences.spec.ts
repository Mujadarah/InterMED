import { expect, test, type Page } from '@playwright/test';
import type { LocalStoreHarness } from '../../apps/web/src/dev/local-store-harness';
import { productionServer } from './production-server';

type HarnessWindow = Window & {
  __intermedLocalStoreHarness: LocalStoreHarness;
};

const HARNESS_TIMEOUT = { timeout: 5_000 };

async function harnessReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      Boolean(
        (window as unknown as Partial<HarnessWindow>)
          .__intermedLocalStoreHarness,
      ),
    undefined,
    HARNESS_TIMEOUT,
  );
}

async function startWithAlpha(page: Page, serverUrl: string) {
  await page.goto(`${serverUrl}/status`);
  await expect(
    page
      .getByRole('complementary', { name: 'Application shell' })
      .getByText('Shell available offline', { exact: true }),
  ).toBeVisible();
  await harnessReady(page);
  const alpha = await page.evaluate(async () => {
    const harness = (window as unknown as HarnessWindow)
      .__intermedLocalStoreHarness;
    return harness.stageAndActivate('alpha');
  });
  await expect(page.getByTestId('dataset-section')).toHaveAttribute(
    'data-dataset-state',
    'ready',
  );
  return alpha;
}

async function addFavoriteFromSearch(
  page: Page,
  serverUrl: string,
  query: string,
  resultName: string,
) {
  await page.goto(`${serverUrl}/search`);
  const input = page.getByRole('searchbox');
  await expect(input).toBeEnabled();
  await input.fill(query);
  const result = page.getByRole('link', {
    name: `Open ${resultName}`,
    exact: false,
  });
  await expect(result).toBeVisible();
  await result.click();
  await expect(
    page.getByRole('heading', { name: resultName, level: 1 }),
  ).toBeVisible();
  const toggle = page.getByRole('button', { name: 'Add to favorites' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(
    page.getByRole('button', { name: 'Remove from favorites' }),
  ).toHaveAttribute('aria-pressed', 'true');
}

test.describe.serial('local favorites and recent searches', () => {
  test('keeps a favorite across reload and opens it while offline', async ({
    page,
  }) => {
    const server = await productionServer();
    server.revision('harness');
    const dataRequests: string[] = [];
    page.on('request', (request) => {
      if (
        request.resourceType() === 'fetch' ||
        request.resourceType() === 'xhr'
      )
        if (new URL(request.url()).pathname !== '/sw.js')
          dataRequests.push(request.url());
    });
    try {
      const alpha = await startWithAlpha(page, server.url);
      await addFavoriteFromSearch(
        page,
        server.url,
        'fictivol',
        'Fictivol alpha',
      );
      await addFavoriteFromSearch(
        page,
        server.url,
        'placebex',
        'Placebex alpha',
      );

      await page.reload();
      await expect(
        page.getByRole('button', { name: 'Remove from favorites' }),
      ).toHaveAttribute('aria-pressed', 'true');

      await page.context().setOffline(true);
      await page.getByRole('link', { name: 'Favorites' }).click();
      const fictivolFavorite = page.getByRole('link', {
        name: 'Fictivol alpha',
      });
      const placebexFavorite = page.getByRole('link', {
        name: 'Placebex alpha',
      });
      await expect(fictivolFavorite).toBeVisible();
      await expect(placebexFavorite).toBeVisible();
      expect(
        (await fictivolFavorite.boundingBox())?.height ?? 0,
      ).toBeGreaterThanOrEqual(44);
      await fictivolFavorite.click();
      await expect(
        page.getByRole('heading', { name: 'Fictivol alpha', level: 1 }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Remove from favorites' }),
      ).toHaveAttribute('aria-pressed', 'true');

      const beta = await page.evaluate(async () => {
        const harness = (window as unknown as HarnessWindow)
          .__intermedLocalStoreHarness;
        return harness.stageAndActivate('beta', {
          omitProductKeys: ['SP-FICTIVOL'],
        });
      });
      expect(beta.productIds['SP-PLACEBEX']).toBe(
        alpha.productIds['SP-PLACEBEX'],
      );
      await page.getByRole('link', { name: 'Favorites' }).click();
      await expect(
        page.getByText('No longer in the active dataset.'),
      ).toBeVisible();
      await expect(
        page.getByText(/Removed on \d{4}-\d{2}-\d{2}\./),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Fictivol alpha' }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('link', { name: 'Placebex beta' }),
      ).toHaveAttribute(
        'href',
        `/medication/${encodeURIComponent(beta.productIds['SP-PLACEBEX'] ?? '')}`,
      );
      await expect(page.getByText(/similar product/i)).toHaveCount(0);
      expect(dataRequests).toEqual([]);
    } finally {
      await server.close();
    }
  });

  test('reconciles a removed synthetic product without remapping a present favorite', async ({
    page,
  }) => {
    const server = await productionServer();
    server.revision('harness');
    try {
      const alpha = await startWithAlpha(page, server.url);
      await addFavoriteFromSearch(
        page,
        server.url,
        'fictivol',
        'Fictivol alpha',
      );
      await addFavoriteFromSearch(
        page,
        server.url,
        'placebex',
        'Placebex alpha',
      );

      const beta = await page.evaluate(async () => {
        const harness = (window as unknown as HarnessWindow)
          .__intermedLocalStoreHarness;
        return harness.stageAndActivate('beta', {
          omitProductKeys: ['SP-FICTIVOL'],
        });
      });
      expect(beta.productIds['SP-PLACEBEX']).toBe(
        alpha.productIds['SP-PLACEBEX'],
      );
      await page.goto(`${server.url}/favorites`);

      await expect(
        page.getByText('Fictivol alpha', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText('No longer in the active dataset.', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(/Removed on \d{4}-\d{2}-\d{2}\./),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Fictivol alpha' }),
      ).toHaveCount(0);

      const stillPresent = page.getByRole('link', { name: 'Placebex beta' });
      await expect(stillPresent).toBeVisible();
      await expect(stillPresent).toHaveAttribute(
        'href',
        `/medication/${encodeURIComponent(beta.productIds['SP-PLACEBEX'] ?? '')}`,
      );
      await expect(page.getByText(/similar product/i)).toHaveCount(0);
    } finally {
      await server.close();
    }
  });

  test('persists opened searches and clears them with keyboard-accessible confirmation', async ({
    page,
  }) => {
    const server = await productionServer();
    server.revision('harness');
    try {
      await startWithAlpha(page, server.url);
      await page.goto(`${server.url}/search`);
      const input = page.getByRole('searchbox');
      await input.fill('fictivol');
      await page.getByRole('link', { name: /Open Fictivol alpha/ }).click();
      await expect(
        page.getByRole('heading', { name: 'Fictivol alpha', level: 1 }),
      ).toBeVisible();
      await page
        .getByRole('link', { name: 'Back to results for fictivol' })
        .click();
      await expect(input).toHaveValue('fictivol');
      await input.fill('');
      await expect(page).toHaveURL(`${server.url}/search`);
      const recent = page.getByRole('button', {
        name: 'Search again for fictivol',
      });
      await expect(recent).toBeVisible();

      await page.reload();
      await expect(
        page.getByRole('button', { name: 'Search again for fictivol' }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Search again for fictivol' })
        .click();
      await expect(page.getByRole('searchbox')).toHaveValue('fictivol');
      await expect(
        page.getByRole('heading', { name: 'Local medication search' }),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: /Open Fictivol alpha/ }),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/search\?q=fictivol$/);

      const searchInput = page.getByRole('searchbox');
      await searchInput.fill('');
      await expect(page).toHaveURL(`${server.url}/search`);
      const clearButton = page.getByRole('button', {
        name: 'Clear recent searches',
      });
      await clearButton.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('alertdialog', {
        name: 'Clear recent searches?',
      });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole('button', { name: 'Cancel' }),
      ).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(clearButton).toBeFocused();

      await clearButton.click();
      const reopenedDialog = page.getByRole('alertdialog', {
        name: 'Clear recent searches?',
      });
      await reopenedDialog
        .getByRole('button', { name: 'Clear searches' })
        .click();
      await expect(page.getByText('No recent searches yet.')).toBeVisible();
      await page.reload();
      await expect(page.getByText('No recent searches yet.')).toBeVisible();
    } finally {
      await server.close();
    }
  });
});
