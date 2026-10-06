import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { productionServer } from './production-server';

const cached = async (page: Page) => {
  await expect(
    page.getByRole('status').filter({ hasText: 'Shell available offline' }),
  ).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
};

const expectKeyboardFocus = async (target: Locator) => {
  await expect(target).toBeFocused();
  expect(
    await target.evaluate((element) => element.matches(':focus-visible')),
  ).toBe(true);
  const outline = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
      color: style.outlineColor,
    };
  });
  expect(outline.style).not.toBe('none');
  expect(outline.width).toBeGreaterThan(0);
  expect(outline.color).not.toBe('transparent');
  expect(outline.color).not.toMatch(/,\s*0\)$/);
};

const tabTo = async (page: Page, target: Locator) => {
  for (let presses = 0; presses < 12; presses += 1) {
    if (await target.evaluate((element) => element === document.activeElement))
      break;
    await page.keyboard.press('Tab');
  }

  await expectKeyboardFocus(target);
};

const reverseTo = async (page: Page, target: Locator) => {
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expectKeyboardFocus(target);
};

test('keyboard shell update waits, blocks other tabs, then reloads on request', async ({
  page,
  context,
}) => {
  const server = await productionServer();
  try {
    await page.goto(server.url + '/status');
    await cached(page);
    await expect(page.locator('html')).toHaveAttribute(
      'data-intermed-shell-revision',
      'a',
    );

    const other = await context.newPage();
    await other.goto(server.url);
    await cached(other);
    const otherNavigations: string[] = [];
    other.on('framenavigated', (frame) => {
      if (frame === other.mainFrame()) otherNavigations.push(frame.url());
    });

    const pageNavigations: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) pageNavigations.push(frame.url());
    });
    const check = page.getByRole('button', { name: 'Check for shell update' });
    await tabTo(page, check);
    await reverseTo(page, check);

    server.revision('b');
    await page.keyboard.press('Enter');
    const available = page
      .getByRole('status')
      .filter({ hasText: 'Shell update available' });
    await expect(available).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute(
      'data-intermed-shell-revision',
      'a',
    );
    await expect(page).toHaveURL(server.url + '/status');
    expect(pageNavigations).toEqual([]);

    const activate = page.getByRole('button', {
      name: 'Update shell and reload',
    });
    await tabTo(page, activate);
    await reverseTo(page, activate);
    await page.keyboard.press('Space');
    await expect(available).toContainText('Close other InterMED tabs');
    await expect(page.locator('html')).toHaveAttribute(
      'data-intermed-shell-revision',
      'a',
    );
    await expect(other.locator('html')).toHaveAttribute(
      'data-intermed-shell-revision',
      'a',
    );
    expect(pageNavigations).toEqual([]);
    expect(otherNavigations).toEqual([]);

    await other.close();
    await tabTo(page, activate);
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute(
      'data-intermed-shell-revision',
      'b',
    );
    await cached(page);
    await expect(page).toHaveURL(server.url + '/status');
  } finally {
    await server.close();
  }
});
