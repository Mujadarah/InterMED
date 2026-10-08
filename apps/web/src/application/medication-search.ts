import {
  createMedicationSearchIndex,
  normalizeMedicationSearchQuery,
  searchMedicationIndex,
  type GenerationReader,
  type MedicationSearchRecord,
  type MedicationSearchIndex,
  type MedicationSearchMatch,
} from '@intermed/domain';

export interface MedicationSearchResponse {
  readonly generationId: string | null;
  readonly results: readonly MedicationSearchMatch[];
  readonly total: number;
  readonly truncated: boolean;
  readonly indexedProductCount: number;
  readonly indexDurationMilliseconds: number;
  readonly searchDurationMilliseconds: number;
}

export interface MedicationSearchService {
  /** Search the current active generation using a lazily built memory index. */
  search(
    query: string,
    signal?: AbortSignal,
  ): Promise<MedicationSearchResponse>;
}

export interface MedicationSearchDependencies {
  readonly activeGenerationId: () => string | null;
  readonly openReader: () => Promise<GenerationReader | null>;
}

interface IndexedGeneration {
  readonly generationId: string;
  readonly index: MedicationSearchIndex;
  readonly productCount: number;
  readonly indexDurationMilliseconds: number;
}

export class MedicationSearchUnavailableError extends Error {
  constructor() {
    super('No active local medication dataset is available.');
    this.name = 'MedicationSearchUnavailableError';
  }
}

export class MedicationSearchGenerationChangedError extends Error {
  constructor() {
    super('The active medication dataset changed during search. Try again.');
    this.name = 'MedicationSearchGenerationChangedError';
  }
}

function now(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function abortError(): Error {
  const error = new Error('The search request was cancelled.');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function waitForSignal<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
    if (signal.aborted) onAbort();
  });
}

/**
 * Build one disposable, in-memory index per active generation. The reader is
 * pinned only while its rows are copied; query evaluation never touches the
 * network or IndexedDB after the index is ready.
 */
export function createMedicationSearchService(
  dependencies: MedicationSearchDependencies,
): MedicationSearchService {
  let cached: IndexedGeneration | null = null;
  const pending = new Map<string, Promise<IndexedGeneration>>();

  async function buildIndex(generationId: string): Promise<IndexedGeneration> {
    const startedAt = now();
    const reader = await dependencies.openReader();
    if (!reader) throw new MedicationSearchUnavailableError();
    try {
      if (
        reader.generationId !== generationId ||
        dependencies.activeGenerationId() !== generationId
      )
        throw new MedicationSearchGenerationChangedError();

      const records: readonly MedicationSearchRecord[] =
        await reader.searchDocuments();
      const index = createMedicationSearchIndex(records);
      const indexDurationMilliseconds = Math.max(0, now() - startedAt);
      if (dependencies.activeGenerationId() !== generationId)
        throw new MedicationSearchGenerationChangedError();

      const built: IndexedGeneration = {
        generationId,
        index,
        productCount: records.length,
        indexDurationMilliseconds,
      };
      cached = built;
      return built;
    } finally {
      reader.release();
    }
  }

  function indexFor(
    generationId: string,
    signal?: AbortSignal,
  ): Promise<IndexedGeneration> {
    throwIfAborted(signal);
    if (cached?.generationId === generationId) return Promise.resolve(cached);

    let build = pending.get(generationId);
    if (!build) {
      build = buildIndex(generationId);
      pending.set(generationId, build);
      void build
        .finally(() => {
          if (pending.get(generationId) === build) pending.delete(generationId);
        })
        .catch(() => undefined);
    }
    return waitForSignal(build, signal);
  }

  return {
    search: async (query, signal) => {
      throwIfAborted(signal);
      if (!normalizeMedicationSearchQuery(query))
        return {
          generationId: dependencies.activeGenerationId(),
          results: [],
          total: 0,
          truncated: false,
          indexedProductCount: 0,
          indexDurationMilliseconds: 0,
          searchDurationMilliseconds: 0,
        };

      const generationId = dependencies.activeGenerationId();
      if (!generationId) throw new MedicationSearchUnavailableError();
      const built = await indexFor(generationId, signal);
      throwIfAborted(signal);
      if (dependencies.activeGenerationId() !== built.generationId)
        throw new MedicationSearchGenerationChangedError();

      const searchStartedAt = now();
      const page = searchMedicationIndex(built.index, query);
      const searchDurationMilliseconds = Math.max(0, now() - searchStartedAt);
      throwIfAborted(signal);
      if (dependencies.activeGenerationId() !== built.generationId)
        throw new MedicationSearchGenerationChangedError();

      return {
        generationId: built.generationId,
        results: page.matches,
        total: page.total,
        truncated: page.truncated,
        indexedProductCount: built.productCount,
        indexDurationMilliseconds: built.indexDurationMilliseconds,
        searchDurationMilliseconds,
      };
    },
  };
}

/** Used only for injected state-only test setups that provide no local reader. */
export const unavailableMedicationSearch: MedicationSearchService = {
  search: async (query, signal) => {
    throwIfAborted(signal);
    if (!normalizeMedicationSearchQuery(query))
      return {
        generationId: null,
        results: [],
        total: 0,
        truncated: false,
        indexedProductCount: 0,
        indexDurationMilliseconds: 0,
        searchDurationMilliseconds: 0,
      };
    throw new MedicationSearchUnavailableError();
  },
};
