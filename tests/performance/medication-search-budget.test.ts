import { expect, it } from 'vitest';
import { createMedicationSearchService } from '../../apps/web/src/application/medication-search';
import { bundle, testStore } from '../../packages/local-store/src/test-support';

const productCount = 25_000;
const ingredientCount = 512;
const searchP95BudgetMilliseconds = 50;

const productFamilies = [
  'Fictivol',
  'Placebex',
  'Synthetica',
  'Imagivol',
  'Nullara',
  'Mockera',
  'Speculon',
  'Novelix',
  'Inventra',
  'Conceptis',
  'Mărinox',
  'Șintetica',
  'Țiplex',
  'Îmagivol',
  'Âmbra',
] as const;

const queryMix = [
  // Supported prefixes and partial names.
  'fict',
  'place',
  'synt',
  'imag',
  'null',
  'mock',
  'nove',
  'inve',
  // Romanian diacritics supported by the current normalization.
  'măr',
  'MĂR',
  'șin',
  'ȘIN',
  'țip',
  'ȚIP',
  'îma',
  'âmb',
  // Typo-shaped no-match inputs; typo correction is not implemented.
  'fictivoll',
  'placebeks',
  'synthetca',
  'imagivool',
  'nullarra',
  'mockerra',
  'novelixx',
  'inventraa',
] as const;

function percentile(values: readonly number[], quantile: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * quantile) - 1)] ?? 0;
}

function roundedMilliseconds(value: number): number {
  return Number(value.toFixed(2));
}

it('keeps cached local search p95 within budget for 25,000 synthetic products', async () => {
  const ingredients = Array.from({ length: ingredientCount }, (_, index) => {
    const suffix = index.toString().padStart(3, '0');
    return {
      key: `AI-M12-PERF-${suffix}`,
      name: `Imaginary Compound ${suffix}`,
    };
  });
  const products = Array.from({ length: productCount }, (_, index) => {
    const suffix = index.toString().padStart(5, '0');
    const ingredientSuffix = (index % ingredientCount)
      .toString()
      .padStart(3, '0');
    const family = productFamilies[index % productFamilies.length];
    return {
      key: `SP-M12-PERF-${suffix}`,
      name: `${family} Product ${suffix}`,
      ingredientKeys: [`AI-M12-PERF-${ingredientSuffix}`],
    };
  });

  const synthetic = await bundle('m12-performance', {
    products,
    ingredients,
  });
  const store = testStore();

  try {
    await store.updates.stageAndActivate(synthetic.manifest, synthetic.text);
    const active = store.getState();
    if (active.status !== 'ready')
      throw new Error('The synthetic performance dataset did not activate');

    const service = createMedicationSearchService({
      activeGenerationId: () => active.generation.generationId,
      openReader: () => store.openReader(),
    });

    const warmup = await service.search('fict');
    expect(warmup.indexedProductCount).toBe(productCount);
    expect((await service.search('șin')).total).toBeGreaterThan(0);
    expect((await service.search('fictivoll')).total).toBe(0);

    for (let index = 0; index < queryMix.length; index += 1)
      await service.search(queryMix[index % queryMix.length]!);

    const queryCount = 240;
    const samples: number[] = [];
    for (let index = 0; index < queryCount; index += 1) {
      const response = await service.search(queryMix[index % queryMix.length]!);
      samples.push(response.searchDurationMilliseconds);
    }

    const p50Milliseconds = percentile(samples, 0.5);
    const p95Milliseconds = percentile(samples, 0.95);
    const measurement = {
      dataset: 'synthetic only',
      indexedProductCount: warmup.indexedProductCount,
      queryCount,
      queryMix: {
        supportedPrefixesAndPartialNames: 8,
        RomanianDiacriticQueries: 8,
        typoShapedNoMatchQueries: 8,
      },
      indexBuildMilliseconds: roundedMilliseconds(
        warmup.indexDurationMilliseconds,
      ),
      cachedSearchP50Milliseconds: roundedMilliseconds(p50Milliseconds),
      cachedSearchP95Milliseconds: roundedMilliseconds(p95Milliseconds),
      cachedSearchP95BudgetMilliseconds: searchP95BudgetMilliseconds,
      indexedDb: 'fake-indexeddb Vitest proxy; physical browsers unmeasured',
    };
    console.info(`M12_SEARCH_PERFORMANCE ${JSON.stringify(measurement)}`);

    expect(samples).toHaveLength(queryCount);
    expect(p95Milliseconds).toBeLessThanOrEqual(searchP95BudgetMilliseconds);
  } finally {
    store.close();
  }
}, 240_000);
