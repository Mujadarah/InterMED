import { canonicalPair, deriveStableId } from '@intermed/domain';
import type {
  ActiveIngredientId,
  CanonicalIngredientPair,
  DrugInteraction,
  DrugInteractionProvider,
} from '@intermed/domain';

const SYNTHETIC_SOURCE_ID = 'source.synthetic';
const SYNTHETIC_SOURCE_VERSION = 'synthetic-preview-v1';
const SYNTHETIC_RETRIEVED_AT = '2026-10-14T00:00:00.000Z';
const FICTIVOLINUM = deriveStableId(
  'ActiveIngredient',
  SYNTHETIC_SOURCE_ID,
  'AI-FICTIVOLINUM',
);
const SYNTHETINUM = deriveStableId(
  'ActiveIngredient',
  SYNTHETIC_SOURCE_ID,
  'AI-SYNTHETINUM',
);
const sourceIdResult = deriveStableId(
  'DataSource',
  'intermed',
  'source.synthetic-interaction-preview',
);
if (!FICTIVOLINUM.ok || !SYNTHETINUM.ok || !sourceIdResult.ok)
  throw new Error('Synthetic interaction fixture identifiers are invalid.');

const sourceId = sourceIdResult.id;
const interactionId = 'synthetic-preview-interaction-fictivol-synthetinix-v1';
const evidenceId = 'synthetic-preview-evidence-fictivol-synthetinix-v1';
const fictionalPair: CanonicalIngredientPair = canonicalPair(
  FICTIVOLINUM.id as ActiveIngredientId,
  SYNTHETINUM.id as ActiveIngredientId,
);

function pairKey(pair: CanonicalIngredientPair): string {
  return JSON.stringify(pair);
}

const fictionalRecord: Omit<DrugInteraction, 'datasetVersionId'> = {
  id: interactionId,
  ingredientAId: fictionalPair[0],
  ingredientBId: fictionalPair[1],
  severity: 'fictional-demo-category',
  clinicalEffect:
    'Synthetic fixture using FICTIVOLINUM and SYNTHETINUM. It carries no clinical meaning.',
  evidenceLevel: 'fictional-fixture-only',
  contextLimitations: [],
  evidenceIds: [evidenceId],
  sourceId,
  sourceVersion: SYNTHETIC_SOURCE_VERSION,
  lastUpdated: SYNTHETIC_RETRIEVED_AT,
  recordStatus: 'current',
  updateHistory: [],
};

/**
 * Fictional demonstration provider. It reports one fixed synthetic pair only;
 * all other pairs are explicitly not covered. Bootstrap loads it only in a
 * development build and the application service requires synthetic catalogue
 * data before calling it.
 */
export const developmentSyntheticInteractionProvider: DrugInteractionProvider =
  {
    describe: () => ({
      providerId: 'intermed-development-synthetic-interaction-preview',
      sourceId,
      sourceVersion: SYNTHETIC_SOURCE_VERSION,
      availability: 'offline-licensed',
      capabilities: { evaluableContextLimitations: [] },
      rightsStatus: 'permitted',
    }),
    evaluate: async (request) => {
      const requestedFictionalPair = request.pairs.find(
        (pair) => pairKey(pair) === pairKey(fictionalPair),
      );
      const records: DrugInteraction[] = requestedFictionalPair
        ? [
            {
              ...fictionalRecord,
              datasetVersionId: request.datasetVersionId,
            },
          ]
        : [];
      const evidence = records.map((record) => ({
        id: evidenceId,
        interactionId: record.id,
        sourceId,
        sourceVersion: SYNTHETIC_SOURCE_VERSION,
        retrievedAt: SYNTHETIC_RETRIEVED_AT,
        reviewStatus: 'unreviewed',
        evidenceLevel: 'fictional-fixture-only',
      }));

      return {
        providerId: 'intermed-development-synthetic-interaction-preview',
        sourceId,
        sourceVersion: SYNTHETIC_SOURCE_VERSION,
        status: 'available',
        retrievedAt: SYNTHETIC_RETRIEVED_AT,
        pairCoverage: request.pairs.map((pair) =>
          pairKey(pair) === pairKey(fictionalPair)
            ? {
                pair,
                status: 'reported' as const,
                retrievedAt: SYNTHETIC_RETRIEVED_AT,
              }
            : {
                pair,
                status: 'not-covered' as const,
                reason: 'synthetic-sample-pair-only',
                retrievedAt: SYNTHETIC_RETRIEVED_AT,
              },
        ),
        records,
        evidence,
      };
    },
  };
