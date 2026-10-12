import { expandProductIngredients } from './expand';
import type { MedicationCatalogueSnapshot } from './catalogue';
import type {
  ActiveIngredientId,
  DataSourceId,
  DatasetVersionId,
  MedicationIngredientId,
  MedicationProductId,
} from './ids';

export type NormalizedSeverity = string;

export type InteractionEvaluationStatus =
  'reported' | 'no-reported-record' | 'incomplete' | 'unavailable';

export type ProviderAvailability = 'offline-licensed' | 'online-only';
export type ProviderRightsStatus = 'permitted' | 'not-permitted' | 'unknown';
export type ProviderStatus = 'available' | 'unavailable';

export type PairCoverageStatus =
  'reported' | 'covered-no-record' | 'not-covered' | 'unsupported-context';

export type CanonicalIngredientPair = readonly [
  ActiveIngredientId,
  ActiveIngredientId,
];

/** Source terminology remains unchanged; normalized severity is opt-in. */
export interface DrugInteraction {
  readonly id: string;
  readonly ingredientAId: ActiveIngredientId;
  readonly ingredientBId: ActiveIngredientId;
  readonly severity?: string;
  readonly normalizedSeverity?: NormalizedSeverity | 'unmapped';
  readonly severityMappingVersion?: string;
  readonly clinicalEffect?: string;
  readonly mechanism?: string;
  readonly evidenceLevel?: string;
  readonly management?: string;
  readonly monitoring?: string;
  readonly alternatives?: string;
  readonly contextLimitations: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly sourceId: DataSourceId;
  readonly sourceInteractionId?: string;
  readonly sourceVersion: string;
  readonly datasetVersionId: DatasetVersionId;
  readonly lastUpdated: string;
  readonly upstreamUpdatedAt?: string;
}

export interface InteractionEvidence {
  readonly id: string;
  readonly interactionId: string;
  readonly sourceId: DataSourceId;
  readonly sourceReferenceId?: string;
  readonly title?: string;
  readonly organization?: string;
  readonly publicationDate?: string;
  readonly urlOrDoi?: string;
  readonly evidenceLevel?: string;
  readonly sourceTerminology?: string;
  readonly sourceVersion: string;
  readonly retrievedAt: string;
  readonly reviewStatus: string;
}

/** Every key is a source term; missing terms are never inferred. */
export interface SeverityMapping {
  readonly mappingVersion: string;
  readonly reviewed: boolean;
  readonly map: Readonly<Record<string, NormalizedSeverity | 'unmapped'>>;
}

export interface InteractionContext {
  readonly requiredContextLimitations: readonly string[];
  readonly values?: Readonly<Record<string, string | number | boolean>>;
}

export interface ProviderCapabilities {
  readonly evaluableContextLimitations: readonly string[];
}

export interface ProviderDescriptor {
  readonly providerId: string;
  readonly sourceId: DataSourceId;
  readonly sourceVersion: string;
  readonly availability: ProviderAvailability;
  readonly capabilities: ProviderCapabilities;
  readonly rightsStatus: ProviderRightsStatus;
}

/** Compatibility alias for call sites that name the descriptor by its role. */
export type InteractionProviderDescriptor = ProviderDescriptor;

export interface ProviderRequest {
  readonly ingredientIds: readonly ActiveIngredientId[];
  readonly pairs: readonly CanonicalIngredientPair[];
  readonly context: InteractionContext;
  readonly datasetVersionId: DatasetVersionId;
  readonly online: boolean;
}

export interface ProviderPairCoverage {
  readonly pair: CanonicalIngredientPair;
  readonly status: PairCoverageStatus;
  readonly retrievedAt?: string;
  readonly reason?: string;
  readonly stale?: boolean;
}

export interface ProviderResult {
  readonly providerId: string;
  readonly sourceId: DataSourceId;
  readonly sourceVersion: string;
  readonly status: ProviderStatus;
  readonly pairCoverage: readonly ProviderPairCoverage[];
  readonly records: readonly DrugInteraction[];
  readonly evidence: readonly InteractionEvidence[];
  readonly retrievedAt: string;
  readonly reason?: string;
}

export interface DrugInteractionProvider {
  describe(): ProviderDescriptor;
  evaluate(request: ProviderRequest): Promise<ProviderResult>;
}

export interface InteractionSelection {
  readonly snapshot: MedicationCatalogueSnapshot;
  readonly productIds: readonly MedicationProductId[];
  readonly datasetVersionId: DatasetVersionId;
  readonly ingredientIds?: readonly ActiveIngredientId[];
}

export interface InteractionProductIngredientMapping {
  readonly productId: MedicationProductId;
  readonly ingredientIds: readonly ActiveIngredientId[];
}

export interface DuplicateExposure {
  readonly ingredientId: ActiveIngredientId;
  readonly productIds: readonly MedicationProductId[];
  readonly directInput: boolean;
}

export type UnresolvedInteractionInputReason =
  | 'product-not-found'
  | 'no-ingredients'
  | 'unresolved-mapping'
  | 'confirmed-mapping-missing-ingredient'
  | 'dangling-ingredient'
  | 'malformed-snapshot'
  | 'dataset-version-mismatch'
  | 'dataset-version-missing'
  | 'no-products-selected'
  | 'unknown-ingredient';

export interface UnresolvedInteractionInput {
  readonly productId?: MedicationProductId;
  readonly joinId?: MedicationIngredientId;
  readonly ingredientId?: ActiveIngredientId;
  readonly reason: UnresolvedInteractionInputReason;
}

export interface EvaluatedPairCoverage {
  readonly pair: CanonicalIngredientPair;
  readonly status: PairCoverageStatus;
  readonly providerId?: string;
  readonly sourceId?: DataSourceId;
  readonly sourceVersion?: string;
  readonly retrievedAt?: string;
  readonly reason?: string;
  readonly stale?: boolean;
}

export interface InteractionSourceVersion {
  readonly providerId: string;
  readonly sourceId: DataSourceId;
  readonly sourceVersion: string;
}

export type InteractionIncompleteReason =
  | 'no-products-selected'
  | 'no-pairs-to-evaluate'
  | 'unresolved-inputs'
  | 'dataset-version-missing'
  | 'pair-limit-exceeded'
  | 'provider-pair-coverage-incomplete'
  | 'provider-pair-coverage-invalid'
  | 'provider-version-mismatch'
  | 'record-pair-outside-request'
  | 'evidence-link-invalid'
  | 'unsupported-context'
  | 'stale-source-data';

export interface InteractionTimer {
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

export interface InteractionEvaluationOptions {
  readonly online: boolean;
  readonly context?: InteractionContext;
  readonly maxPairs?: number;
  readonly timeoutMs?: number;
  readonly severityMapping?: SeverityMapping;
  readonly now?: () => string;
  readonly timer?: InteractionTimer;
}

export interface UniquePairsOptions {
  readonly maxPairs?: number;
}

export interface UniquePairsComplete {
  readonly status: 'ready';
  readonly ingredientCount: number;
  readonly pairCount: number;
  readonly pairs: readonly CanonicalIngredientPair[];
}

export interface TooManyPairsOutcome {
  readonly status: 'too-many-pairs';
  readonly ingredientCount: number;
  readonly pairCount: number;
  readonly maxPairs: number;
  readonly pairs: readonly [];
}

export type UniquePairsResult = UniquePairsComplete | TooManyPairsOutcome;

export interface InteractionEvaluation {
  readonly datasetVersionId: DatasetVersionId;
  readonly selectedProductToIngredientMappings: readonly InteractionProductIngredientMapping[];
  readonly directIngredientIds: readonly ActiveIngredientId[];
  readonly evaluatedIngredientIds: readonly ActiveIngredientId[];
  readonly unresolvedInputs: readonly UnresolvedInteractionInput[];
  readonly duplicateExposure: readonly DuplicateExposure[];
  readonly evaluatedPairCoverage: readonly EvaluatedPairCoverage[];
  readonly sourceVersions: readonly InteractionSourceVersion[];
  readonly generatedAt: string;
  readonly status: InteractionEvaluationStatus;
  readonly interactionIds: readonly string[];
  readonly interactions: readonly DrugInteraction[];
  readonly evidence: readonly InteractionEvidence[];
  readonly coverageComplete: boolean;
  readonly incompleteReasons: readonly InteractionIncompleteReason[];
  readonly pairLimit?: TooManyPairsOutcome;
  readonly unavailableReason?: string;
  readonly severityMappingReview?: {
    readonly mappingVersion: string;
    readonly reviewed: boolean;
  };
}

export type InteractionDisagreementReason =
  'severity-terms-differ' | 'reported-vs-covered-no-record';

export interface InteractionDisagreementTerm {
  readonly providerId: string;
  readonly sourceId: DataSourceId;
  readonly sourceVersion: string;
  readonly severity: string;
}

export interface InteractionDisagreement {
  readonly pair: CanonicalIngredientPair;
  readonly reasons: readonly InteractionDisagreementReason[];
  readonly severityTerms: readonly InteractionDisagreementTerm[];
}

export interface MergedProviderResults {
  readonly providerResults: readonly ProviderResult[];
  readonly records: readonly DrugInteraction[];
  readonly evidence: readonly InteractionEvidence[];
  readonly sourceVersions: readonly InteractionSourceVersion[];
  readonly disagreements: readonly InteractionDisagreement[];
}

const UNRESOLVED_EXPANSION_CODES: ReadonlySet<string> = new Set([
  'product-not-found',
  'no-ingredients',
  'unresolved-mapping',
  'confirmed-mapping-missing-ingredient',
  'dangling-ingredient',
  'malformed-snapshot',
]);

const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function pairKey(pair: CanonicalIngredientPair): string {
  return JSON.stringify(pair);
}

function stableUnique<T extends string>(values: readonly T[]): T[] {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
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

interface ExpandedSelection {
  readonly mappings: readonly InteractionProductIngredientMapping[];
  readonly ingredientIds: readonly ActiveIngredientId[];
  readonly directIngredientIds: readonly ActiveIngredientId[];
  readonly hasDirectInput: boolean;
  readonly unresolvedInputs: readonly UnresolvedInteractionInput[];
  readonly duplicateExposure: readonly DuplicateExposure[];
  readonly datasetVersionPresent: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSnapshot(value: unknown): value is MedicationCatalogueSnapshot {
  return (
    isRecord(value) &&
    Array.isArray(value.datasetVersions) &&
    Array.isArray(value.products) &&
    Array.isArray(value.activeIngredients) &&
    Array.isArray(value.medicationIngredients)
  );
}

function pushUnresolved(
  target: UnresolvedInteractionInput[],
  input: UnresolvedInteractionInput,
): void {
  const duplicate = target.some(
    (item) =>
      item.productId === input.productId &&
      item.joinId === input.joinId &&
      item.ingredientId === input.ingredientId &&
      item.reason === input.reason,
  );
  if (!duplicate) target.push(input);
}

function expandSelection(selection: InteractionSelection): ExpandedSelection {
  const productIds = stableUnique(selection.productIds ?? []);
  const rawDirectIds = stableUnique(selection.ingredientIds ?? []);
  const hasDirectInput = rawDirectIds.length > 0;
  const mappings: InteractionProductIngredientMapping[] = [];
  const unresolvedInputs: UnresolvedInteractionInput[] = [];
  if (productIds.length === 0 && !hasDirectInput)
    pushUnresolved(unresolvedInputs, { reason: 'no-products-selected' });

  if (!isSnapshot(selection.snapshot)) {
    pushUnresolved(unresolvedInputs, { reason: 'malformed-snapshot' });
    for (const ingredientId of rawDirectIds)
      pushUnresolved(unresolvedInputs, {
        ingredientId,
        reason: 'unknown-ingredient',
      });
    return {
      mappings: productIds.map((productId) => ({
        productId,
        ingredientIds: [],
      })),
      ingredientIds: [],
      directIngredientIds: [],
      hasDirectInput,
      unresolvedInputs,
      duplicateExposure: [],
      datasetVersionPresent: false,
    };
  }

  const snapshot = selection.snapshot;
  const datasetVersionPresent = snapshot.datasetVersions.some(
    (version) => isRecord(version) && version.id === selection.datasetVersionId,
  );
  if (!datasetVersionPresent)
    pushUnresolved(unresolvedInputs, { reason: 'dataset-version-missing' });

  const pinnedSnapshot: MedicationCatalogueSnapshot = {
    ...snapshot,
    products: snapshot.products.filter(
      (item) => item.datasetVersionId === selection.datasetVersionId,
    ),
    activeIngredients: snapshot.activeIngredients.filter(
      (item) => item.datasetVersionId === selection.datasetVersionId,
    ),
    medicationIngredients: snapshot.medicationIngredients.filter(
      (item) => item.datasetVersionId === selection.datasetVersionId,
    ),
  };

  const directIngredientIds: ActiveIngredientId[] = [];
  for (const ingredientId of rawDirectIds) {
    const linked = pinnedSnapshot.activeIngredients.find(
      (item) => item.id === ingredientId,
    );
    if (linked) directIngredientIds.push(ingredientId);
    else
      pushUnresolved(unresolvedInputs, {
        ingredientId,
        reason: 'unknown-ingredient',
      });
  }
  const resolvedDirectIds =
    stableUnique(directIngredientIds).sort(compareStrings);

  for (const productId of productIds) {
    const selectedProduct = snapshot.products.find(
      (item) => isRecord(item) && item.id === productId,
    );
    if (!selectedProduct) {
      pushUnresolved(unresolvedInputs, {
        productId,
        reason: 'product-not-found',
      });
      mappings.push({ productId, ingredientIds: [] });
      continue;
    }
    if (selectedProduct.datasetVersionId !== selection.datasetVersionId) {
      pushUnresolved(unresolvedInputs, {
        productId,
        reason: 'dataset-version-mismatch',
      });
      mappings.push({ productId, ingredientIds: [] });
      continue;
    }

    for (const join of snapshot.medicationIngredients) {
      if (
        join.productId === productId &&
        join.datasetVersionId !== selection.datasetVersionId
      )
        pushUnresolved(unresolvedInputs, {
          productId,
          joinId: join.id,
          reason: 'dataset-version-mismatch',
        });
    }

    const expansion = expandProductIngredients(pinnedSnapshot, productId);
    for (const issue of expansion.issues) {
      if (!UNRESOLVED_EXPANSION_CODES.has(issue.code)) continue;
      const reason = issue.code as UnresolvedInteractionInputReason;
      pushUnresolved(
        unresolvedInputs,
        issue.entity === 'MedicationIngredient'
          ? {
              productId,
              joinId: issue.entityId as MedicationIngredientId,
              reason,
            }
          : { productId, reason },
      );
    }

    const ingredientIds: ActiveIngredientId[] = [];
    for (const component of expansion.components) {
      const ingredientState = component.ingredientId;
      if (
        component.mappingStatus !== 'confirmed' ||
        ingredientState.status !== 'present'
      )
        continue;
      const linked = pinnedSnapshot.activeIngredients.find(
        (item) => item.id === ingredientState.value,
      );
      if (linked) ingredientIds.push(ingredientState.value);
    }
    mappings.push({
      productId,
      ingredientIds: stableUnique(ingredientIds),
    });
  }

  const productIdsByIngredient = new Map<
    ActiveIngredientId,
    MedicationProductId[]
  >();
  for (const mapping of mappings) {
    for (const ingredientId of mapping.ingredientIds) {
      const products = productIdsByIngredient.get(ingredientId) ?? [];
      products.push(mapping.productId);
      productIdsByIngredient.set(ingredientId, products);
    }
  }
  const directIdSet = new Set<ActiveIngredientId>(resolvedDirectIds);
  const allIngredientIds = stableUnique([
    ...[...productIdsByIngredient.keys()],
    ...resolvedDirectIds,
  ]).sort(compareStrings);
  const duplicateExposure = allIngredientIds
    .filter((ingredientId) => {
      const selectedProducts = productIdsByIngredient.get(ingredientId) ?? [];
      if (selectedProducts.length > 1) return true;
      return selectedProducts.length >= 1 && directIdSet.has(ingredientId);
    })
    .map((ingredientId) => ({
      ingredientId,
      productIds: productIdsByIngredient.get(ingredientId) ?? [],
      directInput: directIdSet.has(ingredientId),
    }))
    .sort((left, right) =>
      compareStrings(left.ingredientId, right.ingredientId),
    );

  return {
    mappings,
    ingredientIds: allIngredientIds,
    directIngredientIds: resolvedDirectIds,
    hasDirectInput,
    unresolvedInputs,
    duplicateExposure,
    datasetVersionPresent,
  };
}

function sourceVersionKey(version: InteractionSourceVersion): string {
  return JSON.stringify([
    version.providerId,
    version.sourceId,
    version.sourceVersion,
  ]);
}

function addSourceVersion(
  target: InteractionSourceVersion[],
  value: InteractionSourceVersion,
): void {
  if (
    !target.some((item) => sourceVersionKey(item) === sourceVersionKey(value))
  )
    target.push(value);
}

interface EvaluationBase {
  readonly datasetVersionId: DatasetVersionId;
  readonly selectedProductToIngredientMappings: readonly InteractionProductIngredientMapping[];
  readonly directIngredientIds: readonly ActiveIngredientId[];
  readonly evaluatedIngredientIds: readonly ActiveIngredientId[];
  readonly unresolvedInputs: readonly UnresolvedInteractionInput[];
  readonly duplicateExposure: readonly DuplicateExposure[];
  readonly sourceVersions: readonly InteractionSourceVersion[];
  readonly generatedAt: string;
  readonly severityMappingReview?: {
    readonly mappingVersion: string;
    readonly reviewed: boolean;
  };
}

interface EvaluationDetails {
  readonly evaluatedPairCoverage?: readonly EvaluatedPairCoverage[];
  readonly interactions?: readonly DrugInteraction[];
  readonly evidence?: readonly InteractionEvidence[];
  readonly coverageComplete?: boolean;
  readonly incompleteReasons?: readonly InteractionIncompleteReason[];
  readonly pairLimit?: TooManyPairsOutcome;
  readonly unavailableReason?: string;
}

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
  const timedOut = new Promise<ProviderCallOutcome>((resolve) => {
    timerHandle = timer.schedule(() => resolve({ kind: 'timeout' }), timeoutMs);
  });
  const providerCall = Promise.resolve()
    .then(() => provider.evaluate(request))
    .then<ProviderCallOutcome, ProviderCallOutcome>(
      (result) => ({ kind: 'result', result }),
      () => ({ kind: 'error' }),
    );
  const outcome = await Promise.race([providerCall, timedOut]);
  if (outcome.kind !== 'timeout') timer.cancel(timerHandle);
  return outcome;
}

function mapSeverity(
  interaction: DrugInteraction,
  mapping: SeverityMapping | undefined,
): DrugInteraction {
  const {
    normalizedSeverity: existingNormalizedSeverity,
    severityMappingVersion: existingMappingVersion,
    severityMappingReviewed: existingMappingReviewed,
    ...sourceRecord
  } = interaction as DrugInteraction & {
    readonly severityMappingReviewed?: boolean;
  };
  void existingNormalizedSeverity;
  void existingMappingVersion;
  void existingMappingReviewed;
  if (!mapping || interaction.severity === undefined) return sourceRecord;

  const sourceTerm = interaction.severity;
  const hasExplicitMapping = Object.prototype.hasOwnProperty.call(
    mapping.map,
    sourceTerm,
  );
  const normalizedSeverity = hasExplicitMapping
    ? (mapping.map[sourceTerm] ?? 'unmapped')
    : 'unmapped';
  return {
    ...sourceRecord,
    normalizedSeverity,
    severityMappingVersion: mapping.mappingVersion,
  };
}

function unavailableCoverage(
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

function providerSourceVersions(
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

function addIncompleteReason(
  target: Set<InteractionIncompleteReason>,
  reason: InteractionIncompleteReason,
): void {
  target.add(reason);
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
  let descriptor: ProviderDescriptor;
  try {
    descriptor = provider.describe();
  } catch {
    const base: EvaluationBase = {
      datasetVersionId: selection.datasetVersionId,
      selectedProductToIngredientMappings: expanded.mappings,
      directIngredientIds: expanded.directIngredientIds,
      evaluatedIngredientIds: expanded.ingredientIds,
      unresolvedInputs: expanded.unresolvedInputs,
      duplicateExposure: expanded.duplicateExposure,
      sourceVersions: [],
      generatedAt,
      ...(severityMappingReview ? { severityMappingReview } : {}),
    };
    return makeEvaluation(base, 'unavailable', {
      unavailableReason: 'provider-description-error',
      incompleteReasons: ['provider-pair-coverage-incomplete'],
    });
  }

  const sourceVersions = providerSourceVersions(descriptor);
  const base: EvaluationBase = {
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

  if (descriptor.rightsStatus !== 'permitted')
    return makeEvaluation(base, 'unavailable', {
      unavailableReason: 'rights-not-permitted',
      evaluatedPairCoverage: [],
    });
  if (descriptor.availability === 'online-only' && !options.online)
    return makeEvaluation(base, 'unavailable', {
      unavailableReason: 'online-required',
      evaluatedPairCoverage: [],
    });

  const pairOptions: UniquePairsOptions =
    options.maxPairs === undefined ? {} : { maxPairs: options.maxPairs };
  const pairResult = uniquePairs(expanded.ingredientIds, pairOptions);
  if (pairResult.status === 'too-many-pairs')
    return makeEvaluation(base, 'incomplete', {
      pairLimit: pairResult,
      incompleteReasons: [
        'pair-limit-exceeded',
        ...(expanded.unresolvedInputs.length > 0
          ? ['unresolved-inputs' as const]
          : []),
      ],
    });

  const reasonSet = new Set<InteractionIncompleteReason>();
  if (expanded.unresolvedInputs.length > 0)
    addIncompleteReason(reasonSet, 'unresolved-inputs');
  if (expanded.mappings.length === 0 && !expanded.hasDirectInput)
    addIncompleteReason(reasonSet, 'no-products-selected');
  if (pairResult.pairs.length === 0)
    addIncompleteReason(reasonSet, 'no-pairs-to-evaluate');
  if (!expanded.datasetVersionPresent)
    addIncompleteReason(reasonSet, 'dataset-version-missing');

  if (pairResult.pairs.length === 0)
    return makeEvaluation(base, 'incomplete', {
      incompleteReasons: [...reasonSet],
    });

  if (!expanded.datasetVersionPresent) {
    addIncompleteReason(reasonSet, 'provider-pair-coverage-incomplete');
    return makeEvaluation(base, 'incomplete', {
      evaluatedPairCoverage: unavailableCoverage(
        pairResult.pairs,
        descriptor,
        'dataset-version-missing',
      ),
      incompleteReasons: [...reasonSet],
    });
  }

  const context = options.context ?? { requiredContextLimitations: [] };
  const unsupportedContext = context.requiredContextLimitations.filter(
    (limitation) =>
      !descriptor.capabilities.evaluableContextLimitations.includes(limitation),
  );
  if (unsupportedContext.length > 0) {
    addIncompleteReason(reasonSet, 'unsupported-context');
    return makeEvaluation(base, 'incomplete', {
      evaluatedPairCoverage: pairResult.pairs.map((pair) => ({
        pair,
        status: 'unsupported-context',
        providerId: descriptor.providerId,
        sourceId: descriptor.sourceId,
        sourceVersion: descriptor.sourceVersion,
        reason: 'unsupported-context',
      })),
      incompleteReasons: [...reasonSet],
    });
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0)
    throw new RangeError('timeoutMs must be a non-negative finite number.');
  const timer = options.timer ?? createDefaultTimer();
  if (!timer)
    return makeEvaluation(base, 'unavailable', {
      unavailableReason: 'timeout-scheduler-unavailable',
      evaluatedPairCoverage: unavailableCoverage(
        pairResult.pairs,
        descriptor,
        'timeout-scheduler-unavailable',
      ),
    });

  const request: ProviderRequest = {
    ingredientIds: expanded.ingredientIds,
    pairs: pairResult.pairs,
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
    return makeEvaluation(base, 'unavailable', {
      unavailableReason: 'provider-timeout',
      evaluatedPairCoverage: unavailableCoverage(
        pairResult.pairs,
        descriptor,
        'provider-timeout',
      ),
    });
  if (call.kind === 'error')
    return makeEvaluation(base, 'unavailable', {
      unavailableReason: 'provider-error',
      evaluatedPairCoverage: unavailableCoverage(
        pairResult.pairs,
        descriptor,
        'provider-error',
      ),
    });

  const result = call.result;
  if (result.providerId !== descriptor.providerId) {
    addIncompleteReason(reasonSet, 'provider-version-mismatch');
  }
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

  const requestedPairs = new Set(pairResult.pairs.map(pairKey));
  const validRecords: DrugInteraction[] = [];
  const recordsByPair = new Map<string, DrugInteraction[]>();
  for (const record of result.records) {
    const pair = canonicalPair(record.ingredientAId, record.ingredientBId);
    const key = pairKey(pair);
    if (pair[0] === pair[1] || !requestedPairs.has(key)) {
      addIncompleteReason(reasonSet, 'record-pair-outside-request');
      continue;
    }
    const canonicalRecord: DrugInteraction = {
      ...record,
      ingredientAId: pair[0],
      ingredientBId: pair[1],
    };
    if (
      record.sourceId !== result.sourceId ||
      record.sourceVersion !== result.sourceVersion
    )
      addIncompleteReason(reasonSet, 'provider-version-mismatch');
    for (const sourceVersion of [
      {
        providerId: result.providerId,
        sourceId: record.sourceId,
        sourceVersion: record.sourceVersion,
      },
    ])
      addSourceVersion(sourceVersions, sourceVersion);
    const mappedRecord = mapSeverity(canonicalRecord, options.severityMapping);
    validRecords.push(mappedRecord);
    const pairRecords = recordsByPair.get(key) ?? [];
    pairRecords.push(mappedRecord);
    recordsByPair.set(key, pairRecords);
  }

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

  const evaluatedPairCoverage: EvaluatedPairCoverage[] = pairResult.pairs.map(
    (pair) => {
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
    },
  );

  const recordById = new Map(validRecords.map((record) => [record.id, record]));
  const evidence: InteractionEvidence[] = [];
  for (const item of result.evidence) {
    const record = recordById.get(item.interactionId);
    if (record?.evidenceIds.includes(item.id)) evidence.push(item);
    else addIncompleteReason(reasonSet, 'evidence-link-invalid');
  }
  const linkedEvidenceIds = new Set(evidence.map((item) => item.id));
  for (const record of validRecords) {
    if (
      record.evidenceIds.some(
        (evidenceId) => !linkedEvidenceIds.has(evidenceId),
      )
    )
      addIncompleteReason(reasonSet, 'evidence-link-invalid');
  }

  const statusUnavailable = result.status === 'unavailable';
  const unavailableReason = statusUnavailable
    ? (result.reason ?? 'provider-unavailable')
    : undefined;
  const coverageComplete =
    !statusUnavailable &&
    pairResult.pairs.length > 0 &&
    expanded.unresolvedInputs.length === 0 &&
    reasonSet.size === 0 &&
    evaluatedPairCoverage.length === pairResult.pairs.length &&
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
    interactions: validRecords,
    evidence,
    coverageComplete,
    incompleteReasons: [...reasonSet],
    ...(unavailableReason ? { unavailableReason } : {}),
  });
}

function addDisagreementTerm(
  target: InteractionDisagreementTerm[],
  providerResult: ProviderResult,
  severity: string | undefined,
): void {
  if (severity === undefined) return;
  target.push({
    providerId: providerResult.providerId,
    sourceId: providerResult.sourceId,
    sourceVersion: providerResult.sourceVersion,
    severity,
  });
}

function severityTermsDifferAcrossProviders(
  terms: readonly InteractionDisagreementTerm[],
): boolean {
  for (let left = 0; left < terms.length; left += 1) {
    const leftTerm = terms[left];
    if (!leftTerm) continue;
    for (let right = left + 1; right < terms.length; right += 1) {
      const rightTerm = terms[right];
      if (!rightTerm) continue;
      if (
        leftTerm.providerId !== rightTerm.providerId &&
        leftTerm.severity !== rightTerm.severity
      )
        return true;
    }
  }
  return false;
}

/**
 * Merge provider payloads without creating a combined severity or verdict.
 * The tuple type and runtime guard require results from at least two providers.
 */
export function mergeProviderResults(
  providerResults: readonly [
    ProviderResult,
    ProviderResult,
    ...ProviderResult[],
  ],
): MergedProviderResults {
  if (providerResults.length < 2)
    throw new RangeError('At least two provider results are required.');

  interface PairFindings {
    readonly pair: CanonicalIngredientPair;
    readonly terms: InteractionDisagreementTerm[];
    readonly reports: {
      readonly providerIndex: number;
      readonly status: PairCoverageStatus;
    }[];
  }

  const findings = new Map<string, PairFindings>();
  const getFinding = (pair: CanonicalIngredientPair): PairFindings => {
    const key = pairKey(pair);
    const existing = findings.get(key);
    if (existing) return existing;
    const created: PairFindings = { pair, terms: [], reports: [] };
    findings.set(key, created);
    return created;
  };

  for (
    let providerIndex = 0;
    providerIndex < providerResults.length;
    providerIndex += 1
  ) {
    const result = providerResults[providerIndex];
    if (!result) continue;
    for (const record of result.records) {
      const pair = canonicalPair(record.ingredientAId, record.ingredientBId);
      const finding = getFinding(pair);
      addDisagreementTerm(finding.terms, result, record.severity);
    }
    for (const coverage of result.pairCoverage) {
      const pair = canonicalPair(coverage.pair[0], coverage.pair[1]);
      getFinding(pair).reports.push({
        providerIndex,
        status: coverage.status,
      });
    }
  }

  const disagreements: InteractionDisagreement[] = [];
  for (const finding of findings.values()) {
    const reasons: InteractionDisagreementReason[] = [];
    if (severityTermsDifferAcrossProviders(finding.terms))
      reasons.push('severity-terms-differ');
    const reportedProviderIndexes = new Set(
      finding.reports
        .filter((report) => report.status === 'reported')
        .map((report) => report.providerIndex),
    );
    const noRecordProviderIndexes = new Set(
      finding.reports
        .filter((report) => report.status === 'covered-no-record')
        .map((report) => report.providerIndex),
    );
    if (
      [...reportedProviderIndexes].some((index) =>
        [...noRecordProviderIndexes].some((otherIndex) => otherIndex !== index),
      )
    )
      reasons.push('reported-vs-covered-no-record');
    if (reasons.length > 0)
      disagreements.push({
        pair: finding.pair,
        reasons,
        severityTerms: finding.terms,
      });
  }

  const records = providerResults.flatMap((result) =>
    result.records.map((record) => {
      const pair = canonicalPair(record.ingredientAId, record.ingredientBId);
      return {
        ...record,
        ingredientAId: pair[0],
        ingredientBId: pair[1],
      };
    }),
  );
  const sourceVersions: InteractionSourceVersion[] = [];
  for (const result of providerResults) {
    addSourceVersion(sourceVersions, {
      providerId: result.providerId,
      sourceId: result.sourceId,
      sourceVersion: result.sourceVersion,
    });
    for (const record of result.records)
      addSourceVersion(sourceVersions, {
        providerId: result.providerId,
        sourceId: record.sourceId,
        sourceVersion: record.sourceVersion,
      });
  }

  return {
    providerResults,
    records,
    evidence: providerResults.flatMap((result) => result.evidence),
    sourceVersions,
    disagreements: disagreements.sort((left, right) =>
      compareStrings(pairKey(left.pair), pairKey(right.pair)),
    ),
  };
}
