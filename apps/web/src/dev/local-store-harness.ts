import type {
  DatasetUpdateState,
  GenerationReader,
  MedicationProductId,
} from '@intermed/domain';
import {
  buildSyntheticCatalogueBundle,
  createLocalDatasetStore,
  LOCAL_DATASET_DB_NAME,
  openSchemaUpgradeProbe,
  SYNTHETIC_DATASET,
} from '@intermed/local-store';

/**
 * Test-only browser harness for the local dataset store.
 *
 * This module is injected into the application HTML only when the build runs
 * with `INTERMED_LOCAL_STORE_HARNESS=1` (see apps/web/vite.config.ts and
 * scripts/build-pwa-fixtures.mjs). The production bundle never contains it, and
 * `tests/browser/local-store.spec.ts` asserts that. It exists so browser tests
 * can stage synthetic generations and run pinned evaluations against real
 * IndexedDB without any network access or clinical data.
 */

export interface HarnessRow {
  readonly pinnedGenerationId: string;
  readonly datasetVersionId: string;
  readonly name: string;
}

export interface HarnessEvaluation {
  readonly generationId: string;
  readonly rows: readonly HarnessRow[];
}

export interface HarnessUpgradeResult {
  readonly status: 'upgraded';
  readonly schemaGeneration: number;
  readonly favorites: number;
  readonly activeGenerationId: string | null;
}

export interface LocalStoreHarness {
  state(): Promise<DatasetUpdateState>;
  stageAndActivate(label: string): Promise<{
    readonly generationId: string;
    readonly productIds: Readonly<Record<string, string>>;
  }>;
  stageLargeCatalogue(productCount: number): Promise<{
    readonly generationId: string;
    readonly productCount: number;
    readonly bundleBuildMilliseconds: number;
    readonly localStoreStagingMilliseconds: number;
    readonly totalMilliseconds: number;
  }>;
  readProducts(): Promise<readonly string[]>;
  beginEvaluation(): Promise<string>;
  readNext(): Promise<HarnessRow | null>;
  endEvaluation(): Promise<HarnessEvaluation>;
  addFavorite(productId: string): Promise<void>;
  upgradeSchema(): Promise<HarnessUpgradeResult>;
  clear(): Promise<void>;
}

type HarnessWindow = Window & {
  __intermedLocalStoreHarness: LocalStoreHarness;
};

interface Evaluation {
  readonly reader: GenerationReader;
  readonly productIds: readonly MedicationProductId[];
  readonly rows: HarnessRow[];
  index: number;
}

function installLocalStoreHarness(): LocalStoreHarness {
  const store = createLocalDatasetStore({
    name: LOCAL_DATASET_DB_NAME,
    dataset: SYNTHETIC_DATASET,
  });
  let evaluation: Evaluation | null = null;
  const harness: LocalStoreHarness = {
    state: () => store.open(),
    stageAndActivate: async (label) => {
      const synthetic = await buildSyntheticCatalogueBundle({ label });
      await store.updates.stageAndActivate(synthetic.manifest, synthetic.text);
      return {
        generationId: synthetic.generationId,
        productIds: synthetic.productIds,
      };
    },
    stageLargeCatalogue: async (productCount) => {
      if (!Number.isInteger(productCount) || productCount < 20_000)
        throw new RangeError(
          'Large search fixture must contain at least 20,000 products.',
        );
      const startedAt = performance.now();
      const ingredientCount = 512;
      const ingredients = Array.from(
        { length: ingredientCount },
        (_, index) => ({
          key: `AI-LARGE-${index.toString().padStart(3, '0')}`,
          name: `Imaginary Compound ${index.toString().padStart(3, '0')}`,
        }),
      );
      const families = [
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
        'Fabulen',
        'Mythica',
      ];
      const products = Array.from({ length: productCount }, (_, index) => ({
        key: `SP-LARGE-${index.toString().padStart(5, '0')}`,
        name: `${families[index % families.length]} Product ${index
          .toString()
          .padStart(5, '0')}`,
        ingredientKeys: [
          `AI-LARGE-${(index % ingredientCount).toString().padStart(3, '0')}`,
        ],
      }));
      const synthetic = await buildSyntheticCatalogueBundle({
        label: `large-${productCount}`,
        products,
        ingredients,
      });
      const bundleBuiltAt = performance.now();
      await store.updates.stageAndActivate(synthetic.manifest, synthetic.text);
      const finishedAt = performance.now();
      return {
        generationId: synthetic.generationId,
        productCount,
        bundleBuildMilliseconds: bundleBuiltAt - startedAt,
        localStoreStagingMilliseconds: finishedAt - bundleBuiltAt,
        totalMilliseconds: finishedAt - startedAt,
      };
    },
    readProducts: async () => {
      const reader = await store.openReader();
      if (!reader) return [];
      try {
        const names: string[] = [];
        for (const id of await reader.productIds()) {
          const product = await reader.product(id);
          if (product) names.push(product.commercialName);
        }
        return names.sort();
      } finally {
        reader.release();
      }
    },
    beginEvaluation: async () => {
      const reader = await store.openReader();
      if (!reader) throw new Error('No active generation to evaluate');
      evaluation = {
        reader,
        productIds: await reader.productIds(),
        rows: [],
        index: 0,
      };
      return reader.generationId;
    },
    readNext: async () => {
      if (!evaluation) return null;
      const id = evaluation.productIds[evaluation.index];
      if (id === undefined) return null;
      evaluation.index += 1;
      const product = await evaluation.reader.product(id);
      if (!product) return null;
      const row: HarnessRow = {
        pinnedGenerationId: evaluation.reader.generationId,
        datasetVersionId: product.datasetVersionId,
        name: product.commercialName,
      };
      evaluation.rows.push(row);
      return row;
    },
    endEvaluation: async () => {
      if (!evaluation) return { generationId: '', rows: [] };
      const finished: Evaluation = evaluation;
      evaluation = null;
      finished.reader.release();
      return {
        generationId: finished.reader.generationId,
        rows: finished.rows,
      };
    },
    addFavorite: async (productId) => {
      await store.preferences.addFavorite({
        productId: productId as MedicationProductId,
        lastKnownDisplayName: 'Synthetic harness favorite',
        lastKnownDatasetVersionId: null,
      });
    },
    upgradeSchema: async () => {
      const probe = await openSchemaUpgradeProbe(LOCAL_DATASET_DB_NAME);
      try {
        return {
          status: probe.status,
          schemaGeneration: probe.schemaGeneration,
          favorites: probe.favorites.length,
          activeGenerationId: probe.activeGenerationId,
        };
      } finally {
        probe.close();
      }
    },
    clear: async () => {
      await store.preferences.clearAllLocalData();
    },
  };
  return harness;
}

(window as unknown as HarnessWindow).__intermedLocalStoreHarness =
  installLocalStoreHarness();
