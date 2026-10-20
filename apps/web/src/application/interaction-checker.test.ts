import {
  type GenerationReader,
  type LocalDatasetGeneration,
  type MedicationProductDetail,
} from '@intermed/domain';
import { expect, it, vi } from 'vitest';
import {
  createOfflineSyntheticProvider,
  makeSyntheticSelection,
} from '../../../../tests/domain/synthetic-interaction-providers';
import {
  createInteractionCheckerService,
  INTERACTION_CHECKER_MAX_PAIRS,
  SyntheticPreviewRequiresSyntheticCatalogueError,
} from './interaction-checker';

function fixtureGeneration(synthetic = true): LocalDatasetGeneration {
  return {
    generationId: selection.datasetVersionId,
    dataset: 'synthetic-medication-catalogue',
    version: 'synthetic-interaction-service-test',
    schemaVersion: 'medication-catalogue-1',
    sourceIds: [],
    publishedAt: null,
    importedAt: '2026-10-01T00:00:00Z',
    downloadedAt: '2026-10-02T00:00:00.000Z',
    checksum: 'synthetic-interaction-service-checksum',
    coverage: 'Fictional fixtures only.',
    recordCounts: { products: selection.snapshot.products.length },
    synthetic,
  };
}

const selection = makeSyntheticSelection([
  {
    sourceProductId: 'SP-CHECKER-SERVICE-A',
    displayName: 'Service preview product A',
    ingredients: [
      {
        sourceIngredientId: 'AI-CHECKER-SERVICE-A',
        displayName: 'FICTIVOLINUM',
      },
    ],
  },
  {
    sourceProductId: 'SP-CHECKER-SERVICE-B',
    displayName: 'Service preview product B',
    ingredients: [
      {
        sourceIngredientId: 'AI-CHECKER-SERVICE-B',
        displayName: 'SYNTHETINIX',
      },
    ],
  },
]);

function readerFixture(synthetic = true) {
  const generation = fixtureGeneration(synthetic);
  const details = new Map<string, MedicationProductDetail>();
  for (const product of selection.snapshot.products) {
    details.set(product.id, {
      generation,
      product,
      ingredients: selection.snapshot.medicationIngredients
        .filter((join) => join.productId === product.id)
        .map((medicationIngredient) => {
          const ingredientState = medicationIngredient.ingredientId;
          return {
            medicationIngredient,
            activeIngredient:
              ingredientState.status === 'present'
                ? (selection.snapshot.activeIngredients.find(
                    (ingredient) => ingredient.id === ingredientState.value,
                  ) ?? null)
                : null,
          };
        }),
      dosageForm: null,
      atcCodes: [],
      manufacturers: [],
      marketingAuthorizationHolder: null,
      regulatoryDocuments: [],
      dataSource: selection.snapshot.dataSources[0] ?? null,
      datasetVersion: selection.snapshot.datasetVersions[0] ?? null,
    });
  }

  const reader: GenerationReader = {
    generationId: generation.generationId,
    generation,
    product: async (id) => details.get(id)?.product ?? null,
    ingredient: vi.fn(
      async (id) =>
        selection.snapshot.activeIngredients.find((item) => item.id === id) ??
        null,
    ),
    productIngredients: async (productId) =>
      selection.snapshot.medicationIngredients.filter(
        (item) => item.productId === productId,
      ),
    productDetail: vi.fn(async (id) => details.get(id) ?? null),
    productsByNamePrefix: async () => [],
    ingredientsByDciPrefix: vi.fn(async (prefix) =>
      selection.snapshot.activeIngredients.filter(
        (ingredient) =>
          ingredient.dci.status === 'present' &&
          ingredient.dci.value
            .toLocaleLowerCase()
            .startsWith(prefix.toLocaleLowerCase()),
      ),
    ),
    productsByAtcCode: async () => [],
    productIds: async () => selection.productIds,
    searchRecords: async () => [],
    release: vi.fn(),
  };
  return { generation, reader };
}

it('evaluates mapped products through one pinned synthetic reader and forwards shell online state', async () => {
  const { generation, reader } = readerFixture();
  const base = createOfflineSyntheticProvider();
  const evaluate = vi.fn((request) => base.evaluate(request));
  const provider = { describe: base.describe, evaluate };
  const activeGenerationId = vi.fn(() => generation.generationId);
  const openReader = vi.fn(async () => reader);
  const service = createInteractionCheckerService(
    { activeGenerationId, openReader },
    async () => provider,
  );

  const result = await service.evaluate(
    { productIds: selection.productIds, ingredientIds: [] },
    false,
  );

  expect(service.availability).toBe('synthetic-preview');
  expect(result.selectedProductToIngredientMappings).toHaveLength(2);
  expect(evaluate).toHaveBeenCalledWith(
    expect.objectContaining({ online: false, pairs: expect.any(Array) }),
  );
  expect(openReader).toHaveBeenCalledOnce();
  expect(reader.productDetail).toHaveBeenCalledTimes(2);
  expect(reader.release).toHaveBeenCalledOnce();
  expect(INTERACTION_CHECKER_MAX_PAIRS).toBe(45);
});

it('searches synthetic active-ingredient names in the pinned generation', async () => {
  const { generation, reader } = readerFixture();
  const service = createInteractionCheckerService(
    {
      activeGenerationId: () => generation.generationId,
      openReader: async () => reader,
    },
    async () => createOfflineSyntheticProvider(),
  );
  const ingredient = selection.snapshot.activeIngredients[0]!;

  await expect(
    service.searchIngredients(ingredient.preferredName),
  ).resolves.toEqual([{ id: ingredient.id, name: ingredient.preferredName }]);
  expect(reader.ingredientsByDciPrefix).toHaveBeenCalledWith(
    ingredient.preferredName,
  );
  expect(reader.release).toHaveBeenCalledOnce();
});

it('evaluates a directly selected ingredient without selecting a product', async () => {
  const { generation, reader } = readerFixture();
  const provider = createOfflineSyntheticProvider();
  const evaluate = vi.fn((request) => provider.evaluate(request));
  const service = createInteractionCheckerService(
    {
      activeGenerationId: () => generation.generationId,
      openReader: async () => reader,
    },
    async () => ({ describe: provider.describe, evaluate }),
  );
  const ingredient = selection.snapshot.activeIngredients[0]!;

  const result = await service.evaluate(
    { productIds: [], ingredientIds: [ingredient.id] },
    false,
  );

  expect(result.directIngredientIds).toEqual([ingredient.id]);
  expect(result.selectedProductToIngredientMappings).toEqual([]);
  expect(result.incompleteReasons).toContain('no-pairs-to-evaluate');
  expect(result.evaluatedIngredientIds).toEqual([ingredient.id]);
  expect(reader.ingredient).toHaveBeenCalledWith(ingredient.id);
  expect(reader.productDetail).toHaveBeenCalledOnce();
  expect(reader.release).toHaveBeenCalledOnce();
});

it('counts direct and product-derived exposure of the same ingredient', async () => {
  const { generation, reader } = readerFixture();
  const provider = createOfflineSyntheticProvider();
  const service = createInteractionCheckerService(
    {
      activeGenerationId: () => generation.generationId,
      openReader: async () => reader,
    },
    async () => provider,
  );
  const product = selection.snapshot.products[0]!;
  const ingredient = selection.snapshot.activeIngredients[0]!;

  const result = await service.evaluate(
    { productIds: [product.id], ingredientIds: [ingredient.id] },
    false,
  );

  expect(result.duplicateExposure).toContainEqual({
    ingredientId: ingredient.id,
    productIds: [product.id],
    directInput: true,
  });
  expect(result.evaluatedIngredientIds).toEqual([ingredient.id]);
});

it('refuses to run the synthetic preview against a non-synthetic generation', async () => {
  const { generation, reader } = readerFixture(false);
  const base = createOfflineSyntheticProvider();
  const evaluate = vi.fn((request) => base.evaluate(request));
  const service = createInteractionCheckerService(
    {
      activeGenerationId: () => generation.generationId,
      openReader: async () => reader,
    },
    async () => ({ describe: base.describe, evaluate }),
  );

  await expect(
    service.evaluate(
      { productIds: selection.productIds, ingredientIds: [] },
      true,
    ),
  ).rejects.toBeInstanceOf(SyntheticPreviewRequiresSyntheticCatalogueError);
  expect(evaluate).not.toHaveBeenCalled();
  expect(reader.release).toHaveBeenCalledOnce();
});

it('has no evaluation action when no provider is configured', async () => {
  const { generation, reader } = readerFixture();
  const openReader = vi.fn(async () => reader);
  const service = createInteractionCheckerService({
    activeGenerationId: () => generation.generationId,
    openReader,
  });

  expect(service.availability).toBe('unavailable');
  await expect(
    service.evaluate(
      { productIds: selection.productIds, ingredientIds: [] },
      true,
    ),
  ).rejects.toThrow('No interaction checker provider is available.');
  expect(openReader).not.toHaveBeenCalled();
});
