import type {
  CanonicalIngredientPair,
  DrugInteraction,
  DrugInteractionProvider,
  EvaluatedPairCoverage,
  EvaluationBase,
  EvaluationDetails,
  InteractionContext,
  InteractionEvaluation,
  InteractionEvaluationOptions,
  InteractionEvaluationStatus,
  InteractionEvidence,
  InteractionIncompleteReason,
  InteractionSelection,
  InteractionSourceVersion,
  InteractionTimer,
  ProviderDescriptor,
  ProviderRequest,
  ProviderResult,
  UniquePairsOptions,
} from './types';
import {
  addIncompleteReason,
  addSourceVersion,
  buildEvaluatedCoverage,
  indexCoverageByPair,
  pairKey,
  providerSourceVersions,
  uniquePairs,
  unavailableCoverage,
} from './pairs';
import { expandSelection, type ExpandedSelection } from './selection';
import { collectValidRecords } from './severity';
import { collectLinkedEvidence } from './merge';

const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;

function makeEvaluation(
  base: EvaluationBase,
  status: InteractionEvaluationStatus,
  details: EvaluationDetails = {},
): InteractionEvaluation {
  const interactions = details.interactions ?? [];
  return {
    ...base,
    status,
    evaluatedPairCoverage: details.evaluatedPairCoverage ?? [],
    interactionIds: interactions.map((record) => record.id),
    interactions,
    evidence: details.evidence ?? [],
    coverageComplete: details.coverageComplete ?? false,
    incompleteReasons: details.incompleteReasons ?? [],
    ...(details.pairLimit ? { pairLimit: details.pairLimit } : {}),
    ...(details.unavailableReason
      ? { unavailableReason: details.unavailableReason }
      : {}),
  };
}

function createDefaultTimer(): InteractionTimer | undefined {
  const runtime = globalThis as unknown as {
    setTimeout?: (callback: () => void, delayMs: number) => unknown;
    clearTimeout?: (handle: unknown) => void;
  };
  if (
    typeof runtime.setTimeout !== 'function' ||
    typeof runtime.clearTimeout !== 'function'
  )
    return undefined;
  return {
    schedule: (callback, delayMs) => runtime.setTimeout?.(callback, delayMs),
    cancel: (handle) => runtime.clearTimeout?.(handle),
  };
}

type ProviderCallOutcome =
  | { readonly kind: 'result'; readonly result: ProviderResult }
  | { readonly kind: 'error' }
  | { readonly kind: 'timeout' };

async function callProviderWithTimeout(
  provider: DrugInteractionProvider,
  request: ProviderRequest,
  timeoutMs: number,
  timer: InteractionTimer,
): Promise<ProviderCallOutcome> {
  let timerHandle: unknown;
  const controller = createTimeoutController();
  const timedOut = new Promise<ProviderCallOutcome>((resolve) => {
    timerHandle = timer.schedule(() => {
      controller?.abort();
      resolve({ kind: 'timeout' });
    }, timeoutMs);
  });
  const providerCall = Promise.resolve()
    .then(() =>
      provider.evaluate(
        controller ? { ...request, signal: controller.signal } : request,
      ),
    )
    .then<ProviderCallOutcome, ProviderCallOutcome>(
      (result) => ({ kind: 'result', result }),
      () => ({ kind: 'error' }),
    );
  const outcome = await Promise.race([providerCall, timedOut]);
  if (outcome.kind !== 'timeout') timer.cancel(timerHandle);
  return outcome;
}

function createTimeoutController(): AbortController | undefined {
  const runtime = globalThis as unknown as {
    AbortController?: new () => AbortController;
  };
  if (typeof runtime.AbortController !== 'function') return undefined;
  try {
    return new runtime.AbortController();
  } catch {
    return undefined;
  }
}

function buildEvaluationBase(
  selection: InteractionSelection,
  expanded: ExpandedSelection,
  sourceVersions: InteractionSourceVersion[],
  generatedAt: string,
  severityMappingReview: EvaluationBase['severityMappingReview'],
): EvaluationBase {
  return {
    datasetVersionId: selection.datasetVersionId,
    selectedProductToIngredientMappings: expanded.mappings,
    directIngredientIds: expanded.directIngredientIds,
    evaluatedIngredientIds: expanded.ingredientIds,
    unresolvedInputs: expanded.unresolvedInputs,
    duplicateExposure: expanded.duplicateExposure,
    sourceVersions,
    generatedAt,
    ...(severityMappingReview ? { severityMappingReview } : {}),
  };
}

function describeProvider(
  provider: DrugInteractionProvider,
): ProviderDescriptor | undefined {
  try {
    return provider.describe();
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isProviderDescriptor(value: unknown): value is ProviderDescriptor {
  try {
    if (!isRecord(value)) return false;
    if (typeof value.providerId !== 'string') return false;
    if (typeof value.sourceId !== 'string') return false;
    if (typeof value.sourceVersion !== 'string') return false;
    if (
      value.availability !== 'offline-licensed' &&
      value.availability !== 'online-only'
    )
      return false;
    if (
      value.rightsStatus !== 'permitted' &&
      value.rightsStatus !== 'not-permitted' &&
      value.rightsStatus !== 'unknown'
    )
      return false;
    if (!isRecord(value.capabilities)) return false;
    if (!Array.isArray(value.capabilities.evaluableContextLimitations))
      return false;
    return true;
  } catch {
    return false;
  }
}

function isProviderResult(value: unknown): value is ProviderResult {
  try {
    if (!isRecord(value)) return false;
    if (typeof value.providerId !== 'string') return false;
    if (typeof value.sourceId !== 'string') return false;
    if (typeof value.sourceVersion !== 'string') return false;
    if (value.status !== 'available' && value.status !== 'unavailable')
      return false;
    if (!Array.isArray(value.pairCoverage)) return false;
    if (!Array.isArray(value.records)) return false;
    if (!Array.isArray(value.evidence)) return false;
    if (typeof value.retrievedAt !== 'string') return false;
    return true;
  } catch {
    return false;
  }
}

function accessGateReason(
  descriptor: ProviderDescriptor,
  online: boolean,
): string | undefined {
  if (descriptor.rightsStatus !== 'permitted') return 'rights-not-permitted';
  if (descriptor.availability === 'online-only' && !online)
    return 'online-required';
  return undefined;
}

function collectExpansionReasons(
  expanded: ExpandedSelection,
  pairCount: number,
): Set<InteractionIncompleteReason> {
  const reasonSet = new Set<InteractionIncompleteReason>();
  if (expanded.unresolvedInputs.length > 0)
    addIncompleteReason(reasonSet, 'unresolved-inputs');
  if (expanded.mappings.length === 0 && !expanded.hasDirectInput)
    addIncompleteReason(reasonSet, 'no-products-selected');
  if (pairCount === 0) addIncompleteReason(reasonSet, 'no-pairs-to-evaluate');
  if (!expanded.datasetVersionPresent)
    addIncompleteReason(reasonSet, 'dataset-version-missing');
  return reasonSet;
}

function unsupportedLimitations(
  descriptor: ProviderDescriptor,
  context: InteractionContext,
): readonly string[] {
  return context.requiredContextLimitations.filter(
    (limitation) =>
      !descriptor.capabilities.evaluableContextLimitations.includes(limitation),
  );
}

function decideOutcome(
  base: EvaluationBase,
  validRecords: readonly DrugInteraction[],
  evaluatedPairCoverage: readonly EvaluatedPairCoverage[],
  evidence: readonly InteractionEvidence[],
  reasonSet: Set<InteractionIncompleteReason>,
  pairCount: number,
  unresolvedCount: number,
  statusUnavailable: boolean,
  unavailableReason: string | undefined,
): InteractionEvaluation {
  const coverageComplete =
    !statusUnavailable &&
    pairCount > 0 &&
    unresolvedCount === 0 &&
    reasonSet.size === 0 &&
    evaluatedPairCoverage.length === pairCount &&
    evaluatedPairCoverage.every(
      (coverage) =>
        coverage.status === 'reported' ||
        coverage.status === 'covered-no-record',
    );
  const status: InteractionEvaluationStatus = statusUnavailable
    ? 'unavailable'
    : validRecords.length > 0
      ? 'reported'
      : coverageComplete
        ? 'no-reported-record'
        : 'incomplete';

  if (statusUnavailable)
    addIncompleteReason(reasonSet, 'provider-pair-coverage-incomplete');

  return makeEvaluation(base, status, {
    evaluatedPairCoverage,
    interactions: [...validRecords],
    evidence,
    coverageComplete,
    incompleteReasons: [...reasonSet],
    ...(unavailableReason ? { unavailableReason } : {}),
  });
}

function preparePairsAndReasons(
  base: EvaluationBase,
  expanded: ExpandedSelection,
  descriptor: ProviderDescriptor,
  options: InteractionEvaluationOptions,
):
  | { readonly evaluation: InteractionEvaluation }
  | {
      readonly pairs: readonly CanonicalIngredientPair[];
      readonly reasonSet: Set<InteractionIncompleteReason>;
      readonly context: InteractionContext;
    } {
  const pairOptions: UniquePairsOptions =
    options.maxPairs === undefined ? {} : { maxPairs: options.maxPairs };
  const pairResult = uniquePairs(expanded.ingredientIds, pairOptions);
  if (pairResult.status === 'too-many-pairs')
    return {
      evaluation: makeEvaluation(base, 'incomplete', {
        pairLimit: pairResult,
        incompleteReasons: [
          'pair-limit-exceeded',
          ...(expanded.unresolvedInputs.length > 0
            ? ['unresolved-inputs' as const]
            : []),
        ],
      }),
    };

  const reasonSet = collectExpansionReasons(expanded, pairResult.pairs.length);
  if (pairResult.pairs.length === 0)
    return {
      evaluation: makeEvaluation(base, 'incomplete', {
        incompleteReasons: [...reasonSet],
      }),
    };

  if (!expanded.datasetVersionPresent) {
    addIncompleteReason(reasonSet, 'provider-pair-coverage-incomplete');
    return {
      evaluation: makeEvaluation(base, 'incomplete', {
        evaluatedPairCoverage: unavailableCoverage(
          pairResult.pairs,
          descriptor,
          'dataset-version-missing',
        ),
        incompleteReasons: [...reasonSet],
      }),
    };
  }

  const context = options.context ?? { requiredContextLimitations: [] };
  if (unsupportedLimitations(descriptor, context).length > 0) {
    addIncompleteReason(reasonSet, 'unsupported-context');
    return {
      evaluation: makeEvaluation(base, 'incomplete', {
        evaluatedPairCoverage: pairResult.pairs.map((pair) => ({
          pair,
          status: 'unsupported-context',
          providerId: descriptor.providerId,
          sourceId: descriptor.sourceId,
          sourceVersion: descriptor.sourceVersion,
          reason: 'unsupported-context',
        })),
        incompleteReasons: [...reasonSet],
      }),
    };
  }
  return { pairs: pairResult.pairs, reasonSet, context };
}

function summarizeProviderResult(
  base: EvaluationBase,
  expanded: ExpandedSelection,
  pairs: readonly CanonicalIngredientPair[],
  result: ProviderResult,
  descriptor: ProviderDescriptor,
  sourceVersions: InteractionSourceVersion[],
  options: InteractionEvaluationOptions,
  reasonSet: Set<InteractionIncompleteReason>,
): InteractionEvaluation {
  if (result.providerId !== descriptor.providerId)
    addIncompleteReason(reasonSet, 'provider-version-mismatch');
  if (
    result.sourceId !== descriptor.sourceId ||
    result.sourceVersion !== descriptor.sourceVersion
  )
    addIncompleteReason(reasonSet, 'provider-version-mismatch');
  addSourceVersion(sourceVersions, {
    providerId: result.providerId,
    sourceId: result.sourceId,
    sourceVersion: result.sourceVersion,
  });

  const requestedPairs = new Set(pairs.map(pairKey));
  const { validRecords, recordsByPair } = collectValidRecords(
    result,
    requestedPairs,
    reasonSet,
    sourceVersions,
    options,
    base.datasetVersionId,
  );
  const coverageByPair = indexCoverageByPair(result, requestedPairs, reasonSet);
  const evaluatedPairCoverage = buildEvaluatedCoverage(
    pairs,
    coverageByPair,
    recordsByPair,
    result,
    reasonSet,
  );
  const evidence = collectLinkedEvidence(result, validRecords, reasonSet);

  const statusUnavailable = result.status === 'unavailable';
  return decideOutcome(
    base,
    validRecords,
    evaluatedPairCoverage,
    evidence,
    reasonSet,
    pairs.length,
    expanded.unresolvedInputs.length,
    statusUnavailable,
    statusUnavailable ? (result.reason ?? 'provider-unavailable') : undefined,
  );
}

async function invokeProvider(
  provider: DrugInteractionProvider,
  base: EvaluationBase,
  expanded: ExpandedSelection,
  pairs: readonly CanonicalIngredientPair[],
  context: InteractionContext,
  selection: InteractionSelection,
  descriptor: ProviderDescriptor,
  options: InteractionEvaluationOptions,
): Promise<
  | { readonly result: ProviderResult }
  | { readonly evaluation: InteractionEvaluation }
> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0)
    throw new RangeError('timeoutMs must be a non-negative finite number.');
  const timer = options.timer ?? createDefaultTimer();
  if (!timer)
    return {
      evaluation: makeEvaluation(base, 'unavailable', {
        unavailableReason: 'timeout-scheduler-unavailable',
        evaluatedPairCoverage: unavailableCoverage(
          pairs,
          descriptor,
          'timeout-scheduler-unavailable',
        ),
      }),
    };

  const request: ProviderRequest = {
    ingredientIds: expanded.ingredientIds,
    pairs,
    context,
    datasetVersionId: selection.datasetVersionId,
    online: options.online,
  };
  const call = await callProviderWithTimeout(
    provider,
    request,
    timeoutMs,
    timer,
  );
  if (call.kind === 'timeout')
    return {
      evaluation: makeEvaluation(base, 'unavailable', {
        unavailableReason: 'provider-timeout',
        evaluatedPairCoverage: unavailableCoverage(
          pairs,
          descriptor,
          'provider-timeout',
        ),
      }),
    };
  if (call.kind === 'error')
    return {
      evaluation: makeEvaluation(base, 'unavailable', {
        unavailableReason: 'provider-error',
        evaluatedPairCoverage: unavailableCoverage(
          pairs,
          descriptor,
          'provider-error',
        ),
      }),
    };
  return { result: call.result };
}

/**
 * Resolve selected products against one pinned catalogue generation, create
 * unique pairs, and preserve provider coverage and provenance in the result.
 */
export async function evaluateInteractions(
  selection: InteractionSelection,
  provider: DrugInteractionProvider,
  options: InteractionEvaluationOptions,
): Promise<InteractionEvaluation> {
  const generatedAt = options.now ? options.now() : new Date().toISOString();
  const expanded = expandSelection(selection);
  const severityMappingReview = options.severityMapping
    ? {
        mappingVersion: options.severityMapping.mappingVersion,
        reviewed: options.severityMapping.reviewed,
      }
    : undefined;
  const descriptor = describeProvider(provider);
  if (!descriptor) {
    const base = buildEvaluationBase(
      selection,
      expanded,
      [],
      generatedAt,
      severityMappingReview,
    );
    return makeEvaluation(base, 'unavailable', {
      unavailableReason: 'provider-description-error',
      incompleteReasons: ['provider-pair-coverage-incomplete'],
    });
  }
  if (!isProviderDescriptor(descriptor)) {
    const base = buildEvaluationBase(
      selection,
      expanded,
      [],
      generatedAt,
      severityMappingReview,
    );
    return makeEvaluation(base, 'unavailable', {
      unavailableReason: 'provider-descriptor-invalid',
      incompleteReasons: ['provider-pair-coverage-incomplete'],
    });
  }

  const sourceVersions = providerSourceVersions(descriptor);
  const base = buildEvaluationBase(
    selection,
    expanded,
    sourceVersions,
    generatedAt,
    severityMappingReview,
  );

  const gateReason = accessGateReason(descriptor, options.online);
  if (gateReason)
    return makeEvaluation(base, 'unavailable', {
      unavailableReason: gateReason,
      evaluatedPairCoverage: [],
    });

  const prepared = preparePairsAndReasons(base, expanded, descriptor, options);
  if ('evaluation' in prepared) return prepared.evaluation;

  const invoked = await invokeProvider(
    provider,
    base,
    expanded,
    prepared.pairs,
    prepared.context,
    selection,
    descriptor,
    options,
  );
  if ('evaluation' in invoked) return invoked.evaluation;

  if (!isProviderResult(invoked.result))
    return makeEvaluation(base, 'unavailable', {
      unavailableReason: 'provider-result-invalid',
      evaluatedPairCoverage: unavailableCoverage(
        prepared.pairs,
        descriptor,
        'provider-result-invalid',
      ),
      incompleteReasons: ['provider-pair-coverage-incomplete'],
    });

  try {
    return summarizeProviderResult(
      base,
      expanded,
      prepared.pairs,
      invoked.result,
      descriptor,
      sourceVersions,
      options,
      prepared.reasonSet,
    );
  } catch {
    return makeEvaluation(base, 'unavailable', {
      unavailableReason: 'provider-result-invalid',
      evaluatedPairCoverage: unavailableCoverage(
        prepared.pairs,
        descriptor,
        'provider-result-invalid',
      ),
      incompleteReasons: ['provider-pair-coverage-incomplete'],
    });
  }
}
