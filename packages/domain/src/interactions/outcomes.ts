import type {
  CanonicalIngredientPair,
  CategorizedInteractionOutcomes,
  DrugInteraction,
  EvaluatedPairCoverage,
  InteractionEvaluation,
  InteractionPairOutcome,
} from './types';
import { canonicalPair, pairKey } from './pairs';

function recordsForPair(
  evaluation: InteractionEvaluation,
  pair: CanonicalIngredientPair,
): DrugInteraction[] {
  const key = pairKey(pair);
  return [
    ...evaluation.interactions,
    ...evaluation.inactiveRecords.map(({ record }) => record),
  ].filter(
    (record) =>
      pairKey(canonicalPair(record.ingredientAId, record.ingredientBId)) ===
      key,
  );
}

function recordIsOutdated(
  record: DrugInteraction,
  coverage: EvaluatedPairCoverage,
): boolean {
  return (
    record.isOutdated === true ||
    (coverage.sourceId !== undefined &&
      coverage.sourceVersion !== undefined &&
      record.sourceId === coverage.sourceId &&
      record.sourceVersion !== coverage.sourceVersion)
  );
}

function hasProviderDisagreement(
  evaluation: InteractionEvaluation,
  pair: CanonicalIngredientPair,
): boolean {
  const key = pairKey(pair);
  return (
    evaluation.disagreements?.some(
      (disagreement) => pairKey(disagreement.pair) === key,
    ) ?? false
  );
}

function sourceForCoverage(
  evaluation: InteractionEvaluation,
  coverage: EvaluatedPairCoverage,
): { readonly sourceId: string; readonly sourceVersion: string } | undefined {
  const providerVersion = evaluation.sourceVersions.find(
    (sourceVersion) =>
      coverage.providerId !== undefined &&
      sourceVersion.providerId === coverage.providerId,
  );
  const sourceId = coverage.sourceId ?? providerVersion?.sourceId;
  const sourceVersion =
    coverage.sourceVersion ?? providerVersion?.sourceVersion;
  if (!sourceId || !sourceVersion) return undefined;
  return { sourceId, sourceVersion };
}

function classifyPair(
  evaluation: InteractionEvaluation,
  coverage: EvaluatedPairCoverage,
): InteractionPairOutcome {
  const pair = canonicalPair(coverage.pair[0], coverage.pair[1]);
  const records = recordsForPair(evaluation, pair);
  const hasUncertainRecord = records.some(
    (record) => record.sourceStatesUncertainEvidence === true,
  );

  // Keep the owner's precedence explicit: conflicting or uncertain, documented,
  // inactive or outdated, insufficient, then evaluated with no record.
  if (hasUncertainRecord || hasProviderDisagreement(evaluation, pair))
    return { pair, category: 'conflicting-or-uncertain' };

  const hasCurrentRecord = evaluation.interactions.some(
    (record) =>
      pairKey(canonicalPair(record.ingredientAId, record.ingredientBId)) ===
        pairKey(pair) &&
      record.recordStatus === 'current' &&
      !recordIsOutdated(record, coverage),
  );
  if (hasCurrentRecord) return { pair, category: 'documented-interaction' };

  const hasInactiveOrOutdatedRecord =
    evaluation.inactiveRecords.some(
      ({ record }) =>
        pairKey(canonicalPair(record.ingredientAId, record.ingredientBId)) ===
        pairKey(pair),
    ) ||
    records.some(
      (record) =>
        record.recordStatus !== 'current' || recordIsOutdated(record, coverage),
    );
  if (hasInactiveOrOutdatedRecord)
    return { pair, category: 'inactive-or-outdated' };

  const providerUnavailable =
    evaluation.status === 'unavailable' ||
    evaluation.recordsFromUnavailableProvider === true;
  const pairCovered =
    coverage.status === 'reported' || coverage.status === 'covered-no-record';
  const incomplete =
    evaluation.status === 'incomplete' ||
    !evaluation.coverageComplete ||
    evaluation.incompleteReasons.length > 0 ||
    evaluation.unresolvedInputs.length > 0;
  const hasRecordWithoutCurrentFinding =
    records.length > 0 && coverage.status === 'covered-no-record';

  if (
    providerUnavailable ||
    incomplete ||
    !pairCovered ||
    (coverage.status === 'reported' && records.length === 0) ||
    hasRecordWithoutCurrentFinding
  )
    return { pair, category: 'insufficient-information' };

  if (coverage.status === 'covered-no-record' && records.length === 0) {
    const source = sourceForCoverage(evaluation, coverage);
    if (!source) return { pair, category: 'insufficient-information' };
    return {
      pair,
      category: 'evaluated-no-interaction-identified',
      message: `No clinically significant interaction identified by ${source.sourceId} ${source.sourceVersion} for this evaluated pair`,
    };
  }

  return { pair, category: 'insufficient-information' };
}

/**
 * Categorize each evaluated pair without mapping or inferring clinical severity.
 * Pair-independent coverage and resolution details are returned in `notes`.
 */
export function categorizeInteractionOutcomes(
  evaluation: InteractionEvaluation,
): CategorizedInteractionOutcomes {
  const coverageByPair = new Map<string, EvaluatedPairCoverage>();
  for (const coverage of evaluation.evaluatedPairCoverage) {
    const pair = canonicalPair(coverage.pair[0], coverage.pair[1]);
    const key = pairKey(pair);
    if (!coverageByPair.has(key))
      coverageByPair.set(key, { ...coverage, pair });
  }

  return {
    pairOutcomes: [...coverageByPair.values()].map((coverage) =>
      classifyPair(evaluation, coverage),
    ),
    notes: {
      evaluationStatus: evaluation.status,
      coverageComplete: evaluation.coverageComplete,
      sourceVersions: evaluation.sourceVersions.map((sourceVersion) => ({
        ...sourceVersion,
      })),
      incompleteReasons: [...evaluation.incompleteReasons],
      unresolvedInputs: evaluation.unresolvedInputs.map((input) => ({
        ...input,
      })),
      ...(evaluation.unavailableReason
        ? { unavailableReason: evaluation.unavailableReason }
        : {}),
      ...(evaluation.recordsFromUnavailableProvider
        ? { recordsFromUnavailableProvider: true }
        : {}),
    },
  };
}
