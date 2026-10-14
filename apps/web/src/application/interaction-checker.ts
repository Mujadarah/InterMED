import { evaluateInteractions, parseStableId } from '@intermed/domain';
import type {
  DataSource,
  DatasetVersion,
  DrugInteractionProvider,
  InteractionSelection,
  GenerationReader,
  MedicationCatalogueSnapshot,
  MedicationProductId,
} from '@intermed/domain';
import { unavailableInteractionChecker } from './interaction-checker-contract';
import type { InteractionCheckerService } from './interaction-checker-contract';

/** Explicit work bound shown beside the checker action and in pair-limit results. */
export const INTERACTION_CHECKER_MAX_PAIRS = 45;

export interface InteractionCheckerDependencies {
  readonly activeGenerationId: () => string | null;
  readonly openReader: () => Promise<GenerationReader | null>;
}

export class InteractionCheckerUnavailableError extends Error {
  constructor(message = 'No interaction checker provider is available.') {
    super(message);
    this.name = 'InteractionCheckerUnavailableError';
  }
}

export class InteractionCheckerGenerationChangedError extends Error {
  constructor() {
    super('The active medication dataset changed during interaction checking.');
    this.name = 'InteractionCheckerGenerationChangedError';
  }
}

export class SyntheticPreviewRequiresSyntheticCatalogueError extends Error {
  constructor() {
    super('The synthetic interaction preview requires a synthetic catalogue.');
    this.name = 'SyntheticPreviewRequiresSyntheticCatalogueError';
  }
}

export class InteractionCheckerInvalidSelectionError extends Error {
  constructor() {
    super('The interaction selection contains an invalid product identifier.');
    this.name = 'InteractionCheckerInvalidSelectionError';
  }
}

function uniqueById<T extends { readonly id: string }>(
  records: readonly T[],
): T[] {
  const values = new Map<string, T>();
  for (const record of records) values.set(record.id, record);
  return [...values.values()];
}

function snapshotFromReaderDetails(
  details: readonly NonNullable<
    Awaited<ReturnType<GenerationReader['productDetail']>>
  >[],
): MedicationCatalogueSnapshot {
  const dataSources: DataSource[] = [];
  const datasetVersions: DatasetVersion[] = [];

  for (const detail of details) {
    if (detail.dataSource) dataSources.push(detail.dataSource);
    if (detail.datasetVersion) datasetVersions.push(detail.datasetVersion);
  }

  return {
    dataSources: uniqueById(dataSources),
    datasetVersions: uniqueById(datasetVersions),
    products: uniqueById(details.map((detail) => detail.product)),
    activeIngredients: uniqueById(
      details.flatMap((detail) =>
        detail.ingredients.flatMap((item) =>
          item.activeIngredient ? [item.activeIngredient] : [],
        ),
      ),
    ),
    medicationIngredients: uniqueById(
      details.flatMap((detail) =>
        detail.ingredients.map((item) => item.medicationIngredient),
      ),
    ),
    atcCodes: [],
    dosageForms: [],
    manufacturers: [],
    marketingAuthorizationHolders: [],
    regulatoryDocuments: [],
  };
}

const SYNTHETIC_SEVERITY_DISPLAY = {
  mappingVersion: 'synthetic-display-only-v1',
  reviewed: false,
  map: {},
} as const;

/**
 * Create the development-only checker adapter. The caller supplies a provider
 * loader from a statically guarded dev import; no provider is loaded until an
 * evaluation is requested. The service rejects real catalogue generations so
 * a fictional provider cannot be run against catalogue data used for care.
 */
export function createInteractionCheckerService(
  dependencies: InteractionCheckerDependencies,
  loadProvider?: () => Promise<DrugInteractionProvider>,
): InteractionCheckerService {
  if (!loadProvider) return unavailableInteractionChecker;

  return {
    availability: 'synthetic-preview',
    evaluate: async (productIds, online) => {
      if (productIds.length === 0)
        throw new InteractionCheckerInvalidSelectionError();

      const generationId = dependencies.activeGenerationId();
      if (!generationId) throw new InteractionCheckerUnavailableError();
      const datasetVersion = parseStableId('DatasetVersion', generationId);
      if (!datasetVersion.ok)
        throw new InteractionCheckerUnavailableError(
          'The active catalogue version identifier is invalid.',
        );

      const selectedProductIds = productIds.map((productId) => {
        const parsed = parseStableId('MedicationProduct', productId);
        if (!parsed.ok) throw new InteractionCheckerInvalidSelectionError();
        return parsed.id;
      });

      const reader = await dependencies.openReader();
      if (!reader) throw new InteractionCheckerUnavailableError();

      try {
        if (
          reader.generationId !== generationId ||
          dependencies.activeGenerationId() !== generationId
        )
          throw new InteractionCheckerGenerationChangedError();
        if (!reader.generation.synthetic)
          throw new SyntheticPreviewRequiresSyntheticCatalogueError();

        const details = await Promise.all(
          selectedProductIds.map((productId) =>
            reader.productDetail(productId),
          ),
        );
        if (dependencies.activeGenerationId() !== generationId)
          throw new InteractionCheckerGenerationChangedError();

        const selection: InteractionSelection = {
          snapshot: snapshotFromReaderDetails(
            details.filter(
              (detail): detail is NonNullable<typeof detail> => detail !== null,
            ),
          ),
          // Missing records stay in the selection so the domain engine reports
          // `product-not-found` instead of silently dropping the user's choice.
          productIds: selectedProductIds as readonly MedicationProductId[],
          datasetVersionId: datasetVersion.id,
        };
        const provider = await loadProvider();
        if (dependencies.activeGenerationId() !== generationId)
          throw new InteractionCheckerGenerationChangedError();
        const evaluation = await evaluateInteractions(selection, provider, {
          online,
          maxPairs: INTERACTION_CHECKER_MAX_PAIRS,
          severityMapping: SYNTHETIC_SEVERITY_DISPLAY,
        });
        if (dependencies.activeGenerationId() !== generationId)
          throw new InteractionCheckerGenerationChangedError();
        return evaluation;
      } finally {
        reader.release();
      }
    },
  };
}
