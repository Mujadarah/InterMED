import { afterEach, expect, it, vi } from 'vitest';
import type {
  GenerationReader,
  MedicationSearchRecord,
} from '@intermed/domain';
import { product } from '../../../../tests/domain/builders';
import { createMedicationSearchService } from './medication-search';

afterEach(() => vi.restoreAllMocks());

function searchDocument(): MedicationSearchRecord {
  return {
    product: product('SP-FICTIVOL', 'Fictivol'),
    ingredientNames: ['Fictivolinum'],
    atcCodes: ['SYN-SP-FICTIVOL'],
    dosageFormName: 'fictional tablet',
    manufacturerNames: ['Synthetica Laboratories'],
  };
}

function reader(
  generationId: string,
  documents: readonly MedicationSearchRecord[],
  release: () => void,
  searchRecords = vi.fn(async () => documents),
): GenerationReader {
  return {
    generationId,
    searchRecords,
    release,
  } as unknown as GenerationReader;
}

it('reads one pinned generation, releases it, and reuses its in-memory index', async () => {
  const release = vi.fn();
  const searchRecords = vi.fn(async () => [searchDocument()]);
  const openReader = vi.fn(async () =>
    reader('generation-a', [], release, searchRecords),
  );
  const service = createMedicationSearchService({
    activeGenerationId: () => 'generation-a',
    openReader,
  });

  const first = await service.search('fictivol');
  const second = await service.search('fictivolinum');

  expect(
    first.results.map((match) => match.record.product.commercialName),
  ).toEqual(['Fictivol']);
  expect(second.total).toBe(1);
  expect(first.indexedProductCount).toBe(1);
  expect(openReader).toHaveBeenCalledOnce();
  expect(searchRecords).toHaveBeenCalledOnce();
  expect(release).toHaveBeenCalledOnce();
});

it('does not touch local storage for a query that normalizes to empty', async () => {
  const openReader = vi.fn(async () => null);
  const service = createMedicationSearchService({
    activeGenerationId: () => null,
    openReader,
  });

  const page = await service.search('  \n  ');

  expect(page.total).toBe(0);
  expect(page.generationId).toBeNull();
  expect(openReader).not.toHaveBeenCalled();
});

it('cancels a stale caller while allowing the shared index build to finish', async () => {
  const readCompletion: {
    finish?: (documents: readonly MedicationSearchRecord[]) => void;
  } = {};
  const searchRecords = vi.fn(
    () =>
      new Promise<readonly MedicationSearchRecord[]>((resolve) => {
        readCompletion.finish = resolve;
      }),
  );
  const release = vi.fn();
  const openReader = vi.fn(async () =>
    reader('generation-a', [], release, searchRecords),
  );
  const service = createMedicationSearchService({
    activeGenerationId: () => 'generation-a',
    openReader,
  });
  const controller = new AbortController();
  const staleSearch = service.search('old query', controller.signal);
  await vi.waitFor(() => expect(searchRecords).toHaveBeenCalledOnce());
  controller.abort();
  readCompletion.finish?.([searchDocument()]);

  await expect(staleSearch).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
  await expect(service.search('fictivol')).resolves.toMatchObject({ total: 1 });
  expect(openReader).toHaveBeenCalledOnce();
});

it('refuses a reader if the active generation changes before it is pinned', async () => {
  let activeGenerationId = 'generation-a';
  const openReader = vi.fn(async () => {
    activeGenerationId = 'generation-b';
    return reader('generation-a', [searchDocument()], vi.fn());
  });
  const service = createMedicationSearchService({
    activeGenerationId: () => activeGenerationId,
    openReader,
  });

  await expect(service.search('fictivol')).rejects.toThrow(
    'The active medication dataset changed during search. Try again.',
  );
});
