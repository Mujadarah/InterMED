import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { LocalStoreHarness } from '../../apps/web/src/dev/local-store-harness';
import { productionServer } from './production-server';

type HarnessWindow = Window & {
  __intermedLocalStoreHarness: LocalStoreHarness;
};

// CI runners have variable browser/storage throughput; keep tight local budgets
// and use broad CI regression guards while preserving the same core-search SLO.
const SEARCH_PERFORMANCE_BUDGETS = process.env.CI
  ? {
      indexMilliseconds: 15_000,
      stagingMilliseconds: 60_000,
      keyToRenderMilliseconds: 750,
      coreSearchMilliseconds: 100,
    }
  : {
      indexMilliseconds: 5_000,
      stagingMilliseconds: 6_000,
      keyToRenderMilliseconds: 300,
      coreSearchMilliseconds: 100,
    };

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

async function currentResultRevision(page: Page): Promise<number> {
  return Number(
    await page
      .getByTestId('medication-search-page')
      .getAttribute('data-search-revision'),
  );
}

async function waitForResultRevision(
  page: Page,
  previous: number,
): Promise<void> {
  await page.waitForFunction(
    (revision) => {
      const page = document.querySelector<HTMLElement>(
        '[data-testid="medication-search-page"]',
      );
      return Number(page?.dataset['searchRevision'] ?? 0) > revision;
    },
    previous,
    { polling: 10, timeout: 10_000 },
  );
}

async function typeAndWait(page: Page, query: string): Promise<void> {
  const previous = await currentResultRevision(page);
  await page.keyboard.type(query);
  await waitForResultRevision(page, previous);
}

async function stageLargeCatalogue(page: Page, productCount: number) {
  return page.evaluate(async (count) => {
    const harness = (window as unknown as HarnessWindow)
      .__intermedLocalStoreHarness;
    return harness.stageLargeCatalogue(count);
  }, productCount);
}

async function measureQuery(
  page: Page,
  query: string,
): Promise<{
  readonly keyToRenderMilliseconds: number;
  readonly searchMilliseconds: number;
}> {
  const previous = await currentResultRevision(page);
  const startedAt = await page.evaluate(() => performance.now());
  await page.getByRole('searchbox').fill(query);
  await waitForResultRevision(page, previous);
  const endedAt = await page.evaluate(() => performance.now());
  const searchMilliseconds = Number(
    await page
      .getByTestId('medication-search-page')
      .getAttribute('data-search-duration-ms'),
  );
  return {
    keyToRenderMilliseconds: endedAt - startedAt,
    searchMilliseconds,
  };
}

function percentile95(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)] ?? 0;
}

type SearchSamples = {
  one: number[];
  two: number[];
  four: number[];
  coreOne: number[];
  coreTwo: number[];
  coreFour: number[];
};

async function measureSearchPerformance(page: Page) {
  const warmup = await measureQuery(page, 'fict');
  const searchPage = page.getByTestId('medication-search-page');
  const indexMilliseconds = Number(
    await searchPage.getAttribute('data-index-duration-ms'),
  );
  const indexedProductCount = Number(
    await searchPage.getAttribute('data-index-product-count'),
  );
  const querySets = {
    one: [
      'a',
      'e',
      'i',
      'o',
      'u',
      'f',
      'p',
      's',
      'm',
      'n',
      'x',
      'v',
      'l',
      't',
      'c',
      'r',
      'g',
      'h',
      'b',
      'd',
    ],
    two: [
      'fi',
      'ic',
      'ct',
      'ti',
      'iv',
      'vo',
      'ol',
      'pl',
      'la',
      'ac',
      'ce',
      'sy',
      'yn',
      'nt',
      'th',
      'im',
      'ag',
      'nu',
      'no',
      'sp',
    ],
    four: [
      'fict',
      'icti',
      'ctiv',
      'tivo',
      'ivol',
      'plac',
      'lace',
      'synt',
      'ynth',
      'imag',
      'magi',
      'null',
      'mock',
      'spec',
      'nove',
      'inve',
      'conc',
      'tion',
      'labo',
      'ucti',
    ],
  };
  const samples: SearchSamples = {
    one: [],
    two: [],
    four: [],
    coreOne: [],
    coreTwo: [],
    coreFour: [],
  };

  for (const query of querySets.one) {
    const measured = await measureQuery(page, query);
    samples.one.push(measured.keyToRenderMilliseconds);
    samples.coreOne.push(measured.searchMilliseconds);
  }
  for (const query of querySets.two) {
    const measured = await measureQuery(page, query);
    samples.two.push(measured.keyToRenderMilliseconds);
    samples.coreTwo.push(measured.searchMilliseconds);
  }
  for (const query of querySets.four) {
    const measured = await measureQuery(page, query);
    samples.four.push(measured.keyToRenderMilliseconds);
    samples.coreFour.push(measured.searchMilliseconds);
  }
  return { warmup, indexMilliseconds, indexedProductCount, samples };
}

function reportPerformance(
  staging: Awaited<ReturnType<typeof stageLargeCatalogue>>,
  measurement: Awaited<ReturnType<typeof measureSearchPerformance>>,
) {
  const { warmup, indexMilliseconds, indexedProductCount, samples } =
    measurement;
  const measurements = {
    productCount: staging.productCount,
    bundleBuildMilliseconds: Number(staging.bundleBuildMilliseconds.toFixed(2)),
    localStoreStagingMilliseconds: Number(
      staging.localStoreStagingMilliseconds.toFixed(2),
    ),
    totalFixtureMilliseconds: Number(staging.totalMilliseconds.toFixed(2)),
    indexMilliseconds: Number(indexMilliseconds.toFixed(2)),
    indexedProductCount,
    warmupKeyToRenderMilliseconds: Number(
      warmup.keyToRenderMilliseconds.toFixed(2),
    ),
    keyToRenderP95Milliseconds: {
      oneCharacter: Number(percentile95(samples.one).toFixed(2)),
      twoCharacters: Number(percentile95(samples.two).toFixed(2)),
      fourCharacters: Number(percentile95(samples.four).toFixed(2)),
    },
    coreSearchP95Milliseconds: {
      oneCharacter: Number(percentile95(samples.coreOne).toFixed(2)),
      twoCharacters: Number(percentile95(samples.coreTwo).toFixed(2)),
      fourCharacters: Number(percentile95(samples.coreFour).toFixed(2)),
    },
  };
  console.log(`M7A_SEARCH_PERFORMANCE ${JSON.stringify(measurements)}`);
  return measurements;
}

test.describe.serial('medication search browser coverage', () => {
  test('searches and opens a local candidate by keyboard after going offline', async ({
    page,
  }) => {
    const server = await productionServer();
    server.revision('harness');
    try {
      await page.goto(`${server.url}/`);
      await expect(
        page
          .getByRole('complementary', { name: 'Application shell' })
          .getByText('Shell available offline', { exact: true }),
      ).toBeVisible();
      await harnessReady(page);
      await page.evaluate(async () => {
        const harness = (window as unknown as HarnessWindow)
          .__intermedLocalStoreHarness;
        await harness.stageAndActivate('alpha');
      });

      await page.goto(`${server.url}/status`);
      await expect(
        page.getByText('synthetic-alpha', { exact: true }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByText('synthetic-alpha', { exact: true }),
      ).toBeVisible();
      server.failure('offline');
      await page.reload();
      await expect(
        page.getByText('synthetic-alpha', { exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId('dataset-section')).toHaveAttribute(
        'data-dataset-state',
        'ready',
      );

      for (let tab = 0; tab < 12; tab += 1) {
        if (
          (await page.evaluate(() =>
            (document.activeElement as HTMLElement | null)?.getAttribute(
              'href',
            ),
          )) === '/search'
        )
          break;
        await page.keyboard.press('Tab');
      }
      await expect(
        page.getByRole('link', { name: 'Medication search' }),
      ).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('heading', { name: 'Local medication search' }),
      ).toBeVisible();
      await expect(page.getByRole('main')).toBeFocused();

      for (let tab = 0; tab < 12; tab += 1) {
        if (
          (await page.evaluate(
            () => (document.activeElement as HTMLElement | null)?.id,
          )) === 'local-medication-search'
        )
          break;
        await page.keyboard.press('Tab');
      }
      const input = page.getByRole('searchbox', {
        name: /Search local medications by name, active ingredient, ATC code, or manufacturer/,
      });
      await expect(input).toBeFocused();
      await expect(input).toBeEnabled();
      expect((await input.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(
        44,
      );

      const queryNetworkRequests: string[] = [];
      page.on('request', (request) => {
        if (
          request.resourceType() === 'fetch' ||
          request.resourceType() === 'xhr'
        )
          queryNetworkRequests.push(request.url());
      });
      await typeAndWait(page, 'fictivol');
      const status = page
        .getByRole('status')
        .filter({ hasText: 'medication candidate' });
      await expect(status).toHaveText('1 medication candidate found.');
      const results = page.getByRole('list', {
        name: 'Medication search results',
      });
      await expect(results).toBeVisible();
      const candidate = page.getByRole('link', { name: /Open Fictivol alpha/ });
      await expect(candidate).toBeVisible();
      await expect(candidate).toContainText('Not provided by source');
      expect(
        (await candidate.boundingBox())?.height ?? 0,
      ).toBeGreaterThanOrEqual(44);
      expect(queryNetworkRequests).toEqual([]);

      await expect(input).toBeFocused();
      for (let tab = 0; tab < 16; tab += 1) {
        if (
          await candidate.evaluate(
            (link) => link === link.ownerDocument.activeElement,
          )
        )
          break;
        await page.keyboard.press('Tab');
      }
      await expect(candidate).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('heading', {
          name: 'Medication detail is not available yet',
        }),
      ).toBeVisible();
      await expect(page.locator('code')).toContainText('SP-FICTIVOL');
    } finally {
      await server.close();
    }
  });

  test('measures local search on a 20,000-product fictional catalogue', async ({
    page,
  }, testInfo: TestInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop');
    test.setTimeout(120_000);

    const server = await productionServer();
    server.revision('harness');
    try {
      await page.goto(`${server.url}/status`);
      await harnessReady(page);
      const staging = await stageLargeCatalogue(page, 20_000);

      await page.goto(`${server.url}/search`);
      await expect(
        page.getByText('synthetic-large-20000', { exact: true }),
      ).toBeVisible({
        timeout: 20_000,
      });
      const input = page.getByRole('searchbox');
      await expect(input).toBeEnabled();

      const measurement = await measureSearchPerformance(page);
      reportPerformance(staging, measurement);
      const { indexMilliseconds, indexedProductCount, samples } = measurement;
      expect(indexedProductCount).toBe(20_000);
      expect(staging.productCount).toBeGreaterThanOrEqual(20_000);
      expect(indexMilliseconds).toBeLessThan(
        SEARCH_PERFORMANCE_BUDGETS.indexMilliseconds,
      );
      expect(staging.localStoreStagingMilliseconds).toBeLessThan(
        SEARCH_PERFORMANCE_BUDGETS.stagingMilliseconds,
      );
      expect(percentile95(samples.coreOne)).toBeLessThan(
        SEARCH_PERFORMANCE_BUDGETS.coreSearchMilliseconds,
      );
      expect(percentile95(samples.coreTwo)).toBeLessThan(
        SEARCH_PERFORMANCE_BUDGETS.coreSearchMilliseconds,
      );
      expect(percentile95(samples.coreFour)).toBeLessThan(
        SEARCH_PERFORMANCE_BUDGETS.coreSearchMilliseconds,
      );
      // The intentional 200 ms debounce is included in key-to-render p95.
      expect(percentile95(samples.one)).toBeLessThan(
        SEARCH_PERFORMANCE_BUDGETS.keyToRenderMilliseconds,
      );
      expect(percentile95(samples.two)).toBeLessThan(
        SEARCH_PERFORMANCE_BUDGETS.keyToRenderMilliseconds,
      );
      expect(percentile95(samples.four)).toBeLessThan(
        SEARCH_PERFORMANCE_BUDGETS.keyToRenderMilliseconds,
      );
    } finally {
      await server.close();
    }
  });
});
