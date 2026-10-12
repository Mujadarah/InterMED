import type {
  CanonicalIngredientPair,
  DrugInteraction,
  EvaluatedPairCoverage,
  InteractionIncompleteReason,
  InteractionSourceVersion,
  ProviderDescriptor,
  ProviderPairCoverage,
  ProviderResult,
  UniquePairsOptions,
  UniquePairsResult,
} from './types';
import type { ActiveIngredientId } from '../ids';

export function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function pairKey(pair: CanonicalIngredientPair): string {
  return JSON.stringify(pair);
}

export function canonicalPair(
  first: ActiveIngredientId,
  second: ActiveIngredientId,
): CanonicalIngredientPair {
  return first <= second ? [first, second] : [second, first];
}

export function uniquePairs(
  ingredientIds: readonly ActiveIngredientId[],
  options: UniquePairsOptions = {},
): UniquePairsResult {
  const ids = [...new Set(ingredientIds)].sort(compareStrings);
  const ingredientCount = ids.length;
  const pairCount = (ingredientCount * (ingredientCount - 1)) / 2;
  const maxPairs = options.maxPairs;
  if (
    maxPairs !== undefined &&
    (!Number.isSafeInteger(maxPairs) || maxPairs < 0)
  )
    throw new RangeError('maxPairs must be a non-negative safe integer.');
  if (maxPairs !== undefined && pairCount > maxPairs)
    return {
      status: 'too-many-pairs',
      ingredientCount,
      pairCount,
      maxPairs,
      pairs: [],
    };

  const pairs: CanonicalIngredientPair[] = [];
  for (let firstIndex = 0; firstIndex < ids.length; firstIndex += 1) {
    const first = ids[firstIndex];
    if (first === undefined) continue;
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < ids.length;
      secondIndex += 1
    ) {
      const second = ids[secondIndex];
      if (second !== undefined) pairs.push(canonicalPair(first, second));
    }
  }
  return { status: 'ready', ingredientCount, pairCount, pairs };
}

function sourceVersionKey(version: InteractionSourceVersion): string {
  return JSON.stringify([
    version.providerId,
    version.sourceId,
    version.sourceVersion,
  ]);
}

export function addSourceVersion(
  target: InteractionSourceVersion[],
  value: InteractionSourceVersion,
): void {
  if (
    !target.some((item) => sourceVersionKey(item) === sourceVersionKey(value))
  )
    target.push(value);
}

export function addIncompleteReason(
  target: Set<InteractionIncompleteReason>,
  reason: InteractionIncompleteReason,
): void {
  target.add(reason);
}

export function indexCoverageByPair(
  result: ProviderResult,
  requestedPairs: ReadonlySet<string>,
  reasonSet: Set<InteractionIncompleteReason>,
): Map<string, ProviderPairCoverage> {
  const coverageByPair = new Map<string, ProviderPairCoverage>();
  for (const coverage of result.pairCoverage) {
    const pair = canonicalPair(coverage.pair[0], coverage.pair[1]);
    const key = pairKey(pair);
    if (!requestedPairs.has(key)) {
      addIncompleteReason(reasonSet, 'provider-pair-coverage-invalid');
      continue;
    }
    if (coverageByPair.has(key)) {
      addIncompleteReason(reasonSet, 'provider-pair-coverage-invalid');
      continue;
    }
    coverageByPair.set(key, { ...coverage, pair });
  }
  return coverageByPair;
}

export function buildEvaluatedCoverage(
  pairs: readonly CanonicalIngredientPair[],
  coverageByPair: ReadonlyMap<string, ProviderPairCoverage>,
  recordsByPair: ReadonlyMap<string, DrugInteraction[]>,
  result: ProviderResult,
  reasonSet: Set<InteractionIncompleteReason>,
): EvaluatedPairCoverage[] {
  return pairs.map((pair) => {
    const key = pairKey(pair);
    const coverage = coverageByPair.get(key);
    const pairRecords = recordsByPair.get(key) ?? [];
    if (!coverage) {
      addIncompleteReason(reasonSet, 'provider-pair-coverage-incomplete');
      return {
        pair,
        status: 'not-covered',
        providerId: result.providerId,
        sourceId: result.sourceId,
        sourceVersion: result.sourceVersion,
        reason: 'provider-omitted-pair-coverage',
      };
    }
    if (
      (coverage.status === 'reported' && pairRecords.length === 0) ||
      (coverage.status === 'covered-no-record' && pairRecords.length > 0)
    )
      addIncompleteReason(reasonSet, 'provider-pair-coverage-invalid');
    if (
      coverage.status === 'not-covered' ||
      coverage.status === 'unsupported-context'
    )
      addIncompleteReason(reasonSet, 'provider-pair-coverage-incomplete');
    if (coverage.stale) addIncompleteReason(reasonSet, 'stale-source-data');
    return {
      pair,
      status: coverage.status,
      providerId: result.providerId,
      sourceId: result.sourceId,
      sourceVersion: result.sourceVersion,
      retrievedAt: coverage.retrievedAt ?? result.retrievedAt,
      ...(coverage.reason ? { reason: coverage.reason } : {}),
      ...(coverage.stale ? { stale: true } : {}),
    };
  });
}

export function unavailableCoverage(
  pairs: readonly CanonicalIngredientPair[],
  descriptor: ProviderDescriptor,
  reason: string,
): EvaluatedPairCoverage[] {
  return pairs.map((pair) => ({
    pair,
    status: 'not-covered',
    providerId: descriptor.providerId,
    sourceId: descriptor.sourceId,
    sourceVersion: descriptor.sourceVersion,
    reason,
  }));
}

export function providerSourceVersions(
  descriptor: ProviderDescriptor,
): InteractionSourceVersion[] {
  return [
    {
      providerId: descriptor.providerId,
      sourceId: descriptor.sourceId,
      sourceVersion: descriptor.sourceVersion,
    },
  ];
}
