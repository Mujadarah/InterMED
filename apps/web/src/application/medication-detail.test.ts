import { expect, it, vi } from 'vitest';
import type {
  GenerationReader,
  LocalDatasetGeneration,
  MedicationProductDetail,
} from '@intermed/domain';
import { product as makeProduct } from '../../../../tests/domain/builders';
import {
  createMedicationDetailService,
  MedicationDetailGenerationChangedError,
  MedicationDetailUnavailableError,
} from './medication-detail';

const syntheticProduct = makeProduct('SP-FICTIVOL', 'Fictivol detail');

function productDetail(generationId: string): MedicationProductDetail {
  const generation: LocalDatasetGeneration = {
    generationId,
    dataset: 'synthetic-medication-catalogue',
    version: generationId,
    schemaVersion: 'medication-catalogue-1',
    sourceIds: [],
    publishedAt: null,
    importedAt: '2026-10-01T00:00:00Z',
    downloadedAt: '2026-10-02T00:00:00Z',
    checksum: 'synthetic-checksum',
    coverage: 'Synthetic fixture only.',
    recordCounts: { products: 1 },
    synthetic: true,
  };
  return {
    generation,
    product: syntheticProduct,
    ingredients: [],
    dosageForm: null,
    atcCodes: [],
    manufacturers: [],
    marketingAuthorizationHolder: null,
    regulatoryDocuments: [],
    dataSource: null,
    datasetVersion: null,
  };
}

function reader(
  generationId: string,
  readDetail = vi.fn(async () => productDetail(generationId)),
  release = vi.fn(),
): GenerationReader {
  return {
    generationId,
    generation: productDetail(generationId).generation,
    productDetail: readDetail,
    release,
  } as unknown as GenerationReader;
}

it('reads through one matching pinned reader and always releases it', async () => {
  const release = vi.fn();
  const readDetail = vi.fn(async () => productDetail('generation-a'));
  const pinned = reader('generation-a', readDetail, release);
  const openReader = vi.fn(async () => pinned);
  const service = createMedicationDetailService({
    activeGenerationId: () => 'generation-a',
    openReader,
  });

  await expect(
    service.productDetail(syntheticProduct.id),
  ).resolves.toMatchObject({
    generation: { generationId: 'generation-a' },
    product: { commercialName: 'Fictivol detail' },
  });

  expect(openReader).toHaveBeenCalledOnce();
  expect(readDetail).toHaveBeenCalledWith(syntheticProduct.id);
  expect(release).toHaveBeenCalledOnce();
});

it('rejects a reader pinned to a different active generation', async () => {
  const release = vi.fn();
  const readDetail = vi.fn(async () => productDetail('generation-b'));
  const service = createMedicationDetailService({
    activeGenerationId: () => 'generation-a',
    openReader: async () => reader('generation-b', readDetail, release),
  });

  await expect(
    service.productDetail(syntheticProduct.id),
  ).rejects.toBeInstanceOf(MedicationDetailGenerationChangedError);
  expect(readDetail).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledOnce();
});

it('rejects a detail if the active generation changes while it is being read', async () => {
  let activeGenerationId = 'generation-a';
  let finishRead: ((detail: MedicationProductDetail) => void) | undefined;
  const readDetail = vi.fn(
    () =>
      new Promise<MedicationProductDetail>((resolve) => {
        finishRead = resolve;
      }),
  );
  const release = vi.fn();
  const service = createMedicationDetailService({
    activeGenerationId: () => activeGenerationId,
    openReader: async () => reader('generation-a', readDetail, release),
  });

  const reading = service.productDetail(syntheticProduct.id);
  await vi.waitFor(() => expect(readDetail).toHaveBeenCalledOnce());
  activeGenerationId = 'generation-b';
  finishRead?.(productDetail('generation-a'));

  await expect(reading).rejects.toBeInstanceOf(
    MedicationDetailGenerationChangedError,
  );
  expect(release).toHaveBeenCalledOnce();
});

it('returns not found for a malformed product id without opening storage', async () => {
  const openReader = vi.fn(async () => null);
  const service = createMedicationDetailService({
    activeGenerationId: () => 'generation-a',
    openReader,
  });

  await expect(service.productDetail('not-a-product-id')).resolves.toBeNull();
  expect(openReader).not.toHaveBeenCalled();
});

it('reports when no active local generation can be read', async () => {
  const openReader = vi.fn(async () => null);
  const service = createMedicationDetailService({
    activeGenerationId: () => null,
    openReader,
  });

  await expect(
    service.productDetail(syntheticProduct.id),
  ).rejects.toBeInstanceOf(MedicationDetailUnavailableError);
  expect(openReader).not.toHaveBeenCalled();
});
