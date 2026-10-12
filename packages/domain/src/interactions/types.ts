import type { MedicationCatalogueSnapshot } from '../catalogue';
import type {
  ActiveIngredientId,
  DataSourceId,
  DatasetVersionId,
  MedicationIngredientId,
  MedicationProductId,
} from '../ids';

export type NormalizedSeverity = string;

export interface InteractionAbortSignal {
  readonly aborted: boolean;
}

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

export type InteractionRecordStatus = 'current' | 'superseded' | 'withdrawn';
export type InteractionRecordUpdateChange =
  'created' | 'updated' | 'superseded' | 'withdrawn';

export interface InteractionRecordUpdateHistoryEntry {
  readonly sourceVersion: string;
  readonly changedAt: string;
  readonly change: InteractionRecordUpdateChange;
}

/** Source terminology remains unchanged; normalized severity is opt-in. */
export interface DrugInteraction {
  readonly id: string;
  readonly ingredientAId: ActiveIngredientId;
  readonly ingredientBId: ActiveIngredientId;
  readonly severity?: string;
  readonly normalizedSeverity?: NormalizedSeverity | 'unmapped';
  readonly severityMappingVersion?: string;
  readonly severityMappingReviewed?: boolean;
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
  /** Lifecycle status is supplied by the source; it is never inferred. */
  readonly recordStatus: InteractionRecordStatus;
  readonly supersededBy?: string;
  readonly statusChangedAt?: string;
  readonly updateHistory: readonly InteractionRecordUpdateHistoryEntry[];
  readonly sourceStatesUncertainEvidence?: boolean;
  /** Set by evaluation when sourceVersion differs from the provider descriptor. */
  readonly isOutdated?: boolean;
}

export type InactiveInteractionRecordReason = 'superseded' | 'withdrawn';

export interface InactiveInteractionRecord {
  readonly record: DrugInteraction;
  readonly reason: InactiveInteractionRecordReason;
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
  readonly signal?: InteractionAbortSignal;
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
  | 'unknown-ingredient'
  | 'unreviewed-ingredient-mapping';

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
  | 'record-dataset-version-mismatch'
  | 'outdated-record-source-version'
  | 'only-inactive-records'
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
  readonly inactiveRecords: readonly InactiveInteractionRecord[];
  readonly evidence: readonly InteractionEvidence[];
  readonly coverageComplete: boolean;
  readonly incompleteReasons: readonly InteractionIncompleteReason[];
  readonly pairLimit?: TooManyPairsOutcome;
  readonly unavailableReason?: string;
  readonly recordsFromUnavailableProvider?: boolean;
  readonly disagreements?: readonly InteractionDisagreement[];
  readonly severityMappingReview?: {
    readonly mappingVersion: string;
    readonly reviewed: boolean;
  };
}

export type InteractionOutcomeCategory =
  | 'conflicting-or-uncertain'
  | 'documented-interaction'
  | 'inactive-or-outdated'
  | 'insufficient-information'
  | 'evaluated-no-interaction-identified';

export interface InteractionPairOutcome {
  readonly pair: CanonicalIngredientPair;
  readonly category: InteractionOutcomeCategory;
  readonly message?: string;
}

export interface InteractionOutcomeNotes {
  readonly evaluationStatus: InteractionEvaluationStatus;
  readonly coverageComplete: boolean;
  readonly sourceVersions: readonly InteractionSourceVersion[];
  readonly incompleteReasons: readonly InteractionIncompleteReason[];
  readonly unresolvedInputs: readonly UnresolvedInteractionInput[];
  readonly unavailableReason?: string;
  readonly recordsFromUnavailableProvider?: boolean;
}

export interface CategorizedInteractionOutcomes {
  readonly pairOutcomes: readonly InteractionPairOutcome[];
  readonly notes: InteractionOutcomeNotes;
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

export interface EvaluationBase {
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

export interface EvaluationDetails {
  readonly evaluatedPairCoverage?: readonly EvaluatedPairCoverage[];
  readonly interactions?: readonly DrugInteraction[];
  readonly inactiveRecords?: readonly InactiveInteractionRecord[];
  readonly evidence?: readonly InteractionEvidence[];
  readonly coverageComplete?: boolean;
  readonly incompleteReasons?: readonly InteractionIncompleteReason[];
  readonly pairLimit?: TooManyPairsOutcome;
  readonly unavailableReason?: string;
  readonly recordsFromUnavailableProvider?: boolean;
}
