import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type { LocalStoreHarness } from '../../apps/web/src/dev/local-store-harness';
import { productionServer } from './production-server';

type HarnessWindow = Window & {
  __intermedLocalStoreHarness: LocalStoreHarness;
};

type StagedAlpha = {
  readonly generationId: string;
  readonly productIds: Readonly<Record<string, string>>;
};

/**
 * M12 accessibility, responsive and touch audit (automated, no new
 * dependencies). Every route that exists on main is audited with synthetic
 * data: home, search (with results), medication detail, favorites (with one
 * entry), calculators (with a result), and status/diagnostics/settings.
 * (The unknown-route fallback is covered by shell.spec.ts on the dev
 * server; the synthetic production server has no SPA fallback for it.)
 * Only Playwright 1.63 built-ins are used
 * (`toMatchAriaSnapshot`, `getByRole`, `page.setViewportSize`,
 * `locator.boundingBox`, keyboard).
 */

const INTERACTIVE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]';

async function harnessReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      Boolean(
        (window as unknown as Partial<HarnessWindow>)
          .__intermedLocalStoreHarness,
      ),
    undefined,
    { timeout: 10_000 },
  );
}

async function stageAlpha(page: Page): Promise<StagedAlpha> {
  await harnessReady(page);
  return page.evaluate(async () => {
    const harness = (window as unknown as HarnessWindow)
      .__intermedLocalStoreHarness;
    return harness.stageAndActivate('alpha');
  });
}

async function gotoRoute(page: Page, serverUrl: string, path: string) {
  await page.goto(`${serverUrl}${path}`);
  await expect(
    page.getByRole('heading', { level: 1 }),
    `route ${path} renders its h1`,
  ).toBeVisible();
  // Shell readiness toggles ShellStatus buttons asynchronously. Settle it
  // before any traversal is computed, or a late button shifts Tab order.
  // Exact text: the install copy on /status quotes the same phrase.
  await expect(
    page
      .getByText('Shell available offline', { exact: true })
      .or(page.getByText('Shell unavailable offline', { exact: true })),
    'shell readiness settles before the audit',
  ).toBeVisible({ timeout: 20_000 });
}

async function auditLang(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('lang', /.+/);
}

async function auditLandmarksAndHeadings(page: Page, h1Name: string) {
  await expect(page.getByRole('main')).toHaveCount(1);
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toHaveCount(1);
  await expect(h1).toHaveAccessibleName(h1Name);
  // The h1 carries the route's accessible name at the top of the main
  // landmark; the aria snapshot pins role, name and level together.
  await expect(h1).toMatchAriaSnapshot(`- heading "${h1Name}" [level=1]`);
  const levels = await page
    .locator('h1, h2, h3, h4, h5, h6')
    .evaluateAll((headings) =>
      headings.map((heading) => Number(heading.tagName.slice(1))),
    );
  expect(levels.length).toBeGreaterThan(0);
  expect(levels[0]).toBe(1);
  for (let index = 1; index < levels.length; index += 1) {
    expect(
      (levels[index] ?? 1) - (levels[index - 1] ?? 1),
      `heading level must not skip (h${levels[index - 1]} -> h${levels[index]})`,
    ).toBeLessThanOrEqual(1);
  }
}

async function auditControlNames(page: Page) {
  // Every form control has an accessible name; addressed by role with a name
  // wherever the role supports it.
  const controls = page.locator('input, select, textarea');
  const controlCount = await controls.count();
  for (let index = 0; index < controlCount; index += 1) {
    const control = controls.nth(index);
    if (!(await control.isVisible())) continue;
    await expect(
      control,
      `form control ${index} has a name`,
    ).toHaveAccessibleName(/.+/);
  }
  const buttons = page.getByRole('button');
  const buttonCount = await buttons.count();
  for (let index = 0; index < buttonCount; index += 1) {
    await expect(
      buttons.nth(index),
      `button ${index} has a name`,
    ).toHaveAccessibleName(/.+/);
  }
  const images = page.locator('img');
  const imageCount = await images.count();
  for (let index = 0; index < imageCount; index += 1) {
    expect(
      await images.nth(index).getAttribute('alt'),
      `image ${index} has alt text`,
    ).not.toBeNull();
  }
}

async function auditSkipLink(page: Page) {
  // Tab from the top reaches the skip link; activating it lands focus on the
  // main content. The bound loop mirrors keyboard-update.spec.ts so a trap
  // fails the test instead of hanging it.
  const skip = page.getByRole('link', { name: 'Skip to content' });
  const traversalBound = (await page.locator(INTERACTIVE_SELECTOR).count()) + 2;
  for (let presses = 0; presses < traversalBound; presses += 1) {
    if (
      await skip.evaluate((link) => link === link.ownerDocument.activeElement)
    )
      break;
    await page.keyboard.press('Tab');
  }
  await expect(skip, 'skip link is reachable by Tab').toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('main'),
    'skip link lands focus on the main content',
  ).toBeFocused();
}

async function expectVisibleFocusIndicator(
  target: ReturnType<Page['locator']>,
) {
  const indicator = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    const outlineWidth = Number.parseFloat(style.outlineWidth);
    const outline =
      style.outlineStyle !== 'none' &&
      outlineWidth > 0 &&
      style.outlineColor !== 'transparent' &&
      !/,\s*0\)$/.test(style.outlineColor);
    return outline || style.boxShadow !== 'none';
  });
  expect(indicator, 'focused control shows an outline or box-shadow').toBe(
    true,
  );
}

/** DOM-order indexes (over INTERACTIVE_SELECTOR) of the Tab-reachable set. */
async function tabbableIndexes(page: Page): Promise<number[]> {
  return page.locator(INTERACTIVE_SELECTOR).evaluateAll((elements) => {
    const visible = (element: Element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    const checkedRadio = new Set<string>();
    for (const element of elements) {
      if (
        element instanceof HTMLInputElement &&
        element.type === 'radio' &&
        element.checked &&
        element.name
      )
        checkedRadio.add(element.name);
    }
    const tabbable: number[] = [];
    elements.forEach((element, index) => {
      if (!visible(element)) return;
      if (element instanceof HTMLInputElement && element.type === 'radio') {
        // In a checked radio group only the checked radio is in Tab order;
        // the rest are reached with arrow keys. In an unchecked group every
        // radio is a Tab stop.
        if (element.name && checkedRadio.has(element.name) && !element.checked)
          return;
      }
      tabbable.push(index);
    });
    return tabbable;
  });
}

async function auditTabTraversal(page: Page) {
  const controls = page.locator(INTERACTIVE_SELECTOR);
  const expected = await tabbableIndexes(page);
  expect(expected.length).toBeGreaterThan(0);
  // Start from a deterministic point: earlier checks (the skip link) leave
  // the sequential starting point mid-page, and blur() does not reset it.
  // The skip link itself was already proven Tab-reachable from the top, so
  // focus it and traverse the rest in strict DOM order. Wrapping passes
  // through the document in Chromium, which records no control index and
  // is skipped below rather than mistaken for a trap.
  await page.getByRole('link', { name: 'Skip to content' }).focus();
  const visited: number[] = [];
  const seen = new Set<number>();
  for (let presses = 0; presses < expected.length + 2; presses += 1) {
    await page.keyboard.press('Tab');
    const index = await page.evaluate((selector) => {
      const elements = Array.from(document.querySelectorAll(selector));
      return elements.indexOf(document.activeElement as Element);
    }, INTERACTIVE_SELECTOR);
    if (index === -1) continue;
    visited.push(index);
    if (!seen.has(index)) {
      seen.add(index);
      await expectVisibleFocusIndicator(controls.nth(index));
    }
  }
  // Full coverage in DOM order, then the wrap back to the top: every
  // interactive control reachable, in order, with no keyboard trap.
  const rotation = [...expected.slice(1), ...expected.slice(0, 1)];
  expect(
    visited.slice(0, expected.length),
    'Tab reaches every control in DOM order and wraps',
  ).toEqual(rotation);
  expect(visited.length).toBeGreaterThan(expected.length);
}

async function auditNarrowViewport(page: Page) {
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(
    page.getByRole('heading', { level: 1 }),
    'route heading stays visible at 320x640',
  ).toBeVisible();
  const overflow = await page.evaluate(() => {
    const clipped: string[] = [];
    for (const element of document.querySelectorAll('body *')) {
      if (!(element instanceof HTMLElement)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (
        (rect.left < window.innerWidth && rect.right > window.innerWidth + 1) ||
        (rect.left < -1 && rect.right > 1)
      ) {
        const name =
          element.tagName.toLowerCase() +
          (element.className
            ? `.${String(element.className).split(' ')[0]}`
            : '');
        clipped.push(name);
      }
    }
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      clipped: [...new Set(clipped)].slice(0, 20),
    };
  });
  expect(
    overflow.scrollWidth,
    `no horizontal page scroll at 320x640 (scrollWidth ${overflow.scrollWidth} <= ${overflow.innerWidth})`,
  ).toBeLessThanOrEqual(overflow.innerWidth + 1);
  expect(overflow.clipped, 'no text clipped off-screen at 320x640').toEqual([]);
}

async function auditReducedMotion(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page.evaluate(
      () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    ),
  ).toBe(true);
  const animated = await page.evaluate(() => {
    const offenders: string[] = [];
    for (const element of document.querySelectorAll('body *')) {
      if (!(element instanceof HTMLElement)) continue;
      const style = getComputedStyle(element);
      const transitioning = style.transitionDuration
        .split(',')
        .some((value) => Number.parseFloat(value) > 0);
      const animating =
        style.animationName !== 'none' &&
        style.animationDuration
          .split(',')
          .some((value) => Number.parseFloat(value) > 0);
      if (transitioning || animating)
        offenders.push(
          element.tagName.toLowerCase() +
            (element.className
              ? `.${String(element.className).split(' ')[0]}`
              : ''),
        );
    }
    return [...new Set(offenders)].slice(0, 20);
  });
  expect(animated, 'reduced motion disables transitions/animations').toEqual(
    [],
  );
}

async function auditTouchTargets(
  page: Page,
  testInfo: TestInfo,
  route: string,
): Promise<void> {
  // Phone project only. Primary actions must be at least 44x44 CSS px;
  // inline text links (display:inline inside prose) are measured and
  // reported without failing.
  if (testInfo.project.name !== 'webkit-phone') return;
  const targets = page.locator(
    'a[href]:visible, button:visible:not([disabled]), ' +
      'input:visible:not([disabled]), select:visible:not([disabled]), ' +
      'textarea:visible:not([disabled]), summary:visible',
  );
  const count = await targets.count();
  let smallest = '';
  let smallestArea = Number.POSITIVE_INFINITY;
  for (let index = 0; index < count; index += 1) {
    const target = targets.nth(index);
    const measured = await target.evaluate((element) => {
      const boxOf = (node: Element) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      };
      // A wrapped radio is toggled through its label: the label is the
      // effective touch target.
      const node =
        element instanceof HTMLInputElement &&
        element.type === 'radio' &&
        element.closest('label')
          ? (element.closest('label') as HTMLElement)
          : element;
      const role =
        element.tagName.toLowerCase() +
        (element.getAttribute('class')
          ? `.${String(element.getAttribute('class')).split(' ')[0]}`
          : '');
      const name =
        element.getAttribute('aria-label') ??
        element.textContent?.trim().slice(0, 40) ??
        '';
      const inline =
        element.tagName === 'A' &&
        getComputedStyle(element).display === 'inline';
      return { ...boxOf(node), role, name, inline };
    });
    const area = measured.width * measured.height;
    if (area < smallestArea) {
      smallestArea = area;
      smallest = `${measured.role} "${measured.name}" ${measured.width.toFixed(0)}x${measured.height.toFixed(0)}`;
    }
    console.log(
      `TOUCH_TARGET ${route} ${measured.inline ? 'inline' : 'primary'} ` +
        `${measured.role} "${measured.name}" ` +
        `${measured.width.toFixed(1)}x${measured.height.toFixed(1)}`,
    );
    if (measured.inline) continue;
    expect(
      measured.width,
      `${measured.role} "${measured.name}" is at least 44px wide`,
    ).toBeGreaterThanOrEqual(44);
    expect(
      measured.height,
      `${measured.role} "${measured.name}" is at least 44px tall`,
    ).toBeGreaterThanOrEqual(44);
  }
  console.log(
    `TOUCH_TARGET ${route} summary: ${count} targets, smallest ${smallest}`,
  );
}

async function auditRoute(
  page: Page,
  testInfo: TestInfo,
  route: string,
  h1Name: string,
) {
  await auditLang(page);
  await auditLandmarksAndHeadings(page, h1Name);
  await auditControlNames(page);
  await auditSkipLink(page);
  await auditTabTraversal(page);
  await auditNarrowViewport(page);
  await auditReducedMotion(page);
  await auditTouchTargets(page, testInfo, route);
}

test.describe('m12 accessibility audit', () => {
  test('home route is accessible, responsive and touch-ready', async ({
    page,
  }, testInfo) => {
    test.slow();
    const server = await productionServer();
    try {
      await gotoRoute(page, server.url, '/');
      await auditRoute(page, testInfo, 'home', 'A foundation for InterMED');
    } finally {
      await server.close();
    }
  });

  test('search route with synthetic results is accessible, responsive and touch-ready', async ({
    page,
  }, testInfo) => {
    test.slow();
    const server = await productionServer();
    server.revision('harness');
    try {
      await page.goto(`${server.url}/status`);
      await stageAlpha(page);
      await gotoRoute(page, server.url, '/search');
      const input = page.getByRole('searchbox', {
        name: /Search local medications by name/,
      });
      await expect(input).toBeEnabled();
      await input.fill('fictivol');
      await expect(
        page.getByRole('link', { name: /Open Fictivol alpha/ }),
      ).toBeVisible();
      await auditRoute(page, testInfo, 'search', 'Local medication search');
    } finally {
      await server.close();
    }
  });

  test('medication detail route with synthetic data is accessible, responsive and touch-ready', async ({
    page,
  }, testInfo) => {
    test.slow();
    const server = await productionServer();
    server.revision('harness');
    try {
      await page.goto(`${server.url}/status`);
      const alpha = await stageAlpha(page);
      const productId = alpha.productIds['SP-FICTIVOL'] ?? '';
      expect(productId).not.toBe('');
      await gotoRoute(
        page,
        server.url,
        `/medication/${encodeURIComponent(productId)}`,
      );
      await expect(
        page.getByRole('heading', { name: 'Fictivol alpha', level: 1 }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /favorites/ }),
      ).toBeVisible();
      await auditRoute(page, testInfo, 'detail', 'Fictivol alpha');
    } finally {
      await server.close();
    }
  });

  test('favorites route with a synthetic entry is accessible, responsive and touch-ready', async ({
    page,
  }, testInfo) => {
    test.slow();
    const server = await productionServer();
    server.revision('harness');
    try {
      await page.goto(`${server.url}/status`);
      await stageAlpha(page);
      await page.goto(`${server.url}/search`);
      const input = page.getByRole('searchbox');
      await expect(input).toBeEnabled();
      await input.fill('fictivol');
      const result = page.getByRole('link', {
        name: 'Open Fictivol alpha',
        exact: false,
      });
      await expect(result).toBeVisible();
      await result.click();
      await expect(
        page.getByRole('heading', { name: 'Fictivol alpha', level: 1 }),
      ).toBeVisible();
      const toggle = page.getByRole('button', { name: 'Add to favorites' });
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(
        page.getByRole('button', { name: 'Remove from favorites' }),
      ).toBeVisible();
      await gotoRoute(page, server.url, '/favorites');
      await expect(
        page.getByRole('link', { name: 'Fictivol alpha' }),
      ).toBeVisible();
      await auditRoute(page, testInfo, 'favorites', 'Favorites');
    } finally {
      await server.close();
    }
  });

  test('calculators route with a result is accessible, responsive and touch-ready', async ({
    page,
  }, testInfo) => {
    test.slow();
    const server = await productionServer();
    try {
      await gotoRoute(page, server.url, '/calculators');
      await page.getByLabel('Height unit').selectOption('cm');
      await page.getByLabel('Weight', { exact: true }).fill('70');
      await page.getByLabel('Height', { exact: true }).fill('175');
      await page.getByLabel('Age in years').fill('30');
      await page.getByRole('button', { name: 'Calculate' }).click();
      await expect(page.getByText('Result: 22.9 kg/m²')).toBeVisible();
      await auditRoute(page, testInfo, 'calculators', 'Calculators');
    } finally {
      await server.close();
    }
  });

  test('status route with diagnostics and settings is accessible, responsive and touch-ready', async ({
    page,
  }, testInfo) => {
    test.slow();
    const server = await productionServer();
    server.revision('harness');
    try {
      await page.goto(`${server.url}/status`);
      await stageAlpha(page);
      await gotoRoute(page, server.url, '/status');
      await expect(page.getByTestId('dataset-section')).toHaveAttribute(
        'data-dataset-state',
        'ready',
      );
      await expect(
        page.getByRole('region', { name: 'Diagnostics', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Local preferences' }),
      ).toBeVisible();
      await auditRoute(page, testInfo, 'status', 'Development status');
    } finally {
      await server.close();
    }
  });
});
