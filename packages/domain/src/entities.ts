import type { FieldState } from './field';
import type {
  ActiveIngredientId,
  AtcCodeId,
  DataSourceId,
  DatasetVersionId,
  DosageFormId,
  ManufacturerId,
  MarketingAuthorizationHolderId,
  MedicationIngredientId,
  MedicationProductId,
  RegulatoryDocumentId,
} from './ids';
import type { UnitField } from './quantity';

export type ProductStatus = 'active' | 'removed' | 'unresolved';
export type MappingStatus = 'confirmed' | 'unresolved';
export type MappingReviewStatus = 'unreviewed' | 'reviewed' | 'rejected';
export type RegulatoryDocumentType = 'RCP' | 'SmPC' | 'PIL' | 'other';
export type CacheRightsStatus = 'not-assessed' | 'prohibited' | 'permitted';
export type DatasetStatus =
  'staging' | 'validated' | 'published' | 'rejected' | 'withdrawn';
export type RightsStatus = 'unresolved' | 'granted' | 'denied' | 'expired';

/** Uses named in DATA_SOURCES.md. automated-test is only for synthetic fixtures. */
export type SourceUse =
  | 'retrieval'
  | 'server-storage'
  | 'transformation'
  | 'display'
  | 'redistribution'
  | 'offline-cache'
  | 'commercial-use'
  | 'automated-test';

export interface MedicationProduct {
  readonly id: MedicationProductId;
  readonly sourceId: DataSourceId;
  readonly sourceProductId: string;
  readonly cim: FieldState<string>;
  readonly commercialName: string;
  readonly originalDciText: FieldState<string>;
  readonly strengthText: FieldState<string>;
  readonly dosageFormId: FieldState<DosageFormId>;
  readonly route: FieldState<string>;
  readonly atcCodeIds: readonly AtcCodeId[];
  readonly manufacturerIds: readonly ManufacturerId[];
  readonly marketingAuthorizationHolderId: FieldState<MarketingAuthorizationHolderId>;
  readonly authorizationNumber: FieldState<string>;
  readonly authorizationDate: FieldState<string>;
  readonly authorizationStatus: FieldState<string>;
  readonly presentationOrPackDescription: FieldState<string>;
  readonly regulatoryDocumentIds: readonly RegulatoryDocumentId[];
  readonly sourceVersion: string;
  readonly datasetVersionId: DatasetVersionId;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly status: ProductStatus;
}

export interface ExternalIngredientMapping {
  readonly sourceId: DataSourceId;
  readonly sourceIngredientId: string;
  readonly mappingVersion: string;
  readonly reviewStatus: MappingReviewStatus;
}

export interface ActiveIngredient {
  readonly id: ActiveIngredientId;
  readonly preferredName: string;
  readonly originalNames: readonly string[];
  readonly dci: FieldState<string>;
  readonly saltOrForm: FieldState<string>;
  readonly synonyms: readonly string[];
  readonly externalMappings: readonly ExternalIngredientMapping[];
  readonly sourceId: DataSourceId;
  readonly sourceVersion: string;
  readonly datasetVersionId: DatasetVersionId;
  /** Stable-id input. Not a display name. Absent from DATA_MODEL's field list. */
  readonly sourceRecordKey: string;
}

export interface MedicationIngredient {
  readonly id: MedicationIngredientId;
  readonly productId: MedicationProductId;
  readonly ingredientId: FieldState<ActiveIngredientId>;
  readonly sourceIngredientText: string;
  readonly strengthValue: FieldState<string>;
  readonly strengthValueNormalized: FieldState<string>;
  readonly strengthUnit: UnitField;
  readonly denominatorValue: FieldState<string>;
  readonly denominatorValueNormalized: FieldState<string>;
  readonly denominatorUnit: UnitField;
  readonly strengthOriginalText: FieldState<string>;
  readonly mappingStatus: MappingStatus;
  readonly mappingVersion: string;
  readonly sourceId: DataSourceId;
  readonly datasetVersionId: DatasetVersionId;
  /** Stable-id input for the join. DATA_MODEL has no source join key. */
  readonly sourceRecordKey: string;
}

export interface ATCCode {
  readonly id: AtcCodeId;
  readonly code: string;
  /** Only illustrative codes are representable until a rights-approved import. */
  readonly codeSystem: 'synthetic-illustrative';
  readonly illustrative: true;
  readonly displayName: FieldState<string>;
  readonly classificationVersion: FieldState<string>;
  readonly sourceId: DataSourceId;
  readonly datasetVersionId: DatasetVersionId;
  readonly sourceRecordKey: string;
}

export interface DosageForm {
  readonly id: DosageFormId;
  readonly displayName: string;
  readonly originalSourceText: string;
  readonly externalCode: FieldState<string>;
  readonly sourceId: DataSourceId;
  readonly datasetVersionId: DatasetVersionId;
  readonly sourceRecordKey: string;
}

export interface Manufacturer {
  readonly id: ManufacturerId;
  readonly name: string;
  readonly country: FieldState<string>;
  readonly sourceId: DataSourceId;
  readonly sourceEntityId: FieldState<string>;
  readonly datasetVersionId: DatasetVersionId;
  readonly sourceRecordKey: string;
}

export interface MarketingAuthorizationHolder {
  readonly id: MarketingAuthorizationHolderId;
  readonly name: string;
  readonly country: FieldState<string>;
  readonly sourceId: DataSourceId;
  readonly sourceEntityId: FieldState<string>;
  readonly datasetVersionId: DatasetVersionId;
  readonly sourceRecordKey: string;
}

export interface RegulatoryDocument {
  readonly id: RegulatoryDocumentId;
  readonly productId: MedicationProductId;
  readonly type: RegulatoryDocumentType;
  readonly title: FieldState<string>;
  readonly url: string;
  readonly language: FieldState<string>;
  readonly documentVersion: FieldState<string>;
  readonly publishedAt: FieldState<string>;
  readonly retrievedAt: FieldState<string>;
  readonly lastCheckedAt: string;
  readonly sourceId: DataSourceId;
  readonly sourceVersion: string;
  readonly datasetVersionId: DatasetVersionId;
  readonly cachedContentReference: FieldState<string>;
  readonly cacheRightsStatus: CacheRightsStatus;
  readonly checksum: FieldState<string>;
  readonly sourceRecordKey: string;
}

export interface DataSource {
  readonly id: DataSourceId;
  /** Stable-id input under the intermed namespace. Distinct from the canonical id. */
  readonly sourceKey: string;
  readonly name: string;
  readonly authority: string;
  readonly jurisdiction: FieldState<string>;
  readonly url: string;
  readonly licenseOrPermissionReference: FieldState<string>;
  readonly rightsStatus: RightsStatus;
  readonly allowedUses: readonly SourceUse[];
  readonly prohibitedUses: readonly SourceUse[];
  readonly permissionExpiresAt: FieldState<string>;
  readonly attributionRequirements: FieldState<string>;
  readonly expectedUpdateCadence: FieldState<string>;
  readonly importMethod: string;
  readonly coverageDescription: string;
  readonly reviewOwner: string;
  readonly reviewedAt: string;
}

export interface DatasetRecordCounts {
  readonly dataSources: number;
  readonly datasetVersions: number;
  readonly products: number;
  readonly activeIngredients: number;
  readonly medicationIngredients: number;
  readonly atcCodes: number;
  readonly dosageForms: number;
  readonly manufacturers: number;
  readonly marketingAuthorizationHolders: number;
  readonly regulatoryDocuments: number;
}

export interface DatasetVersion {
  readonly id: DatasetVersionId;
  readonly dataset: string;
  readonly sourceIds: readonly DataSourceId[];
  readonly upstreamVersion: FieldState<string>;
  readonly version: string;
  readonly publishedAt: FieldState<string>;
  readonly upstreamPublishedAt: FieldState<string>;
  readonly importedAt: string;
  readonly checksum: string;
  readonly schemaVersion: string;
  readonly minimumClientVersion: string;
  readonly recordCounts: DatasetRecordCounts;
  readonly coverage: string;
  readonly rightsApprovalReference: string;
  readonly clinicalReviewReference: string;
  readonly previousVersionId: FieldState<DatasetVersionId>;
  readonly status: DatasetStatus;
}
