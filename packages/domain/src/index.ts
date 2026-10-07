export type { FieldState, UnknownReason } from './field';
export {
  isPreservedSourceText,
  MISSING,
  presentField,
  unknownField,
} from './field';
export type {
  ActiveIngredientId,
  AtcCodeId,
  DataSourceId,
  DatasetVersionId,
  DeriveIdResult,
  DosageFormId,
  EntityKind,
  IdByKind,
  IdIssue,
  ManufacturerId,
  MarketingAuthorizationHolderId,
  MedicationIngredientId,
  MedicationProductId,
  ParseIdResult,
  RegulatoryDocumentId,
} from './ids';
export { deriveStableId, parseStableId } from './ids';
export type { AssessedQuantity, UnitField } from './quantity';
export { assessQuantity, assessUnit, normalizeDecimalToken } from './quantity';

export type {
  ActiveIngredient,
  ATCCode,
  CacheRightsStatus,
  DatasetRecordCounts,
  DatasetStatus,
  DatasetVersion,
  DataSource,
  DosageForm,
  ExternalIngredientMapping,
  Manufacturer,
  MappingReviewStatus,
  MappingStatus,
  MarketingAuthorizationHolder,
  MedicationIngredient,
  MedicationProduct,
  ProductStatus,
  RegulatoryDocument,
  RegulatoryDocumentType,
  RightsStatus,
  SourceUse,
} from './entities';
export type {
  MedicationCatalogueSnapshot,
  MedicationCatalogueSource,
} from './catalogue';
export {
  INTERMED_ID_NAMESPACE,
  MEDICATION_CATALOGUE_SCHEMA_VERSION,
} from './catalogue';
export type {
  CatalogueEntity,
  CatalogueIssue,
  CatalogueIssueCode,
} from './issues';
export type { CombinationExpansion, ExpandedComponent } from './expand';
export { expandProductIngredients } from './expand';
export {
  catalogueFingerprint,
  canonicalJson,
  fingerprint,
  sealCatalogue,
} from './checksum';
export { validateReferentialIntegrity } from './integrity';
export type { AmbiguousIdentity, AmbiguousIdentityReason } from './identity';
export { findAmbiguousIdentities, foldLegacyCedilla } from './identity';
export type { DeserializeCatalogueResult } from './serialize';
export { deserializeCatalogue, serializeCatalogue } from './serialize';

export interface BootstrapInfo {
  readonly label: string;
  readonly referenceData: 'unavailable';
}

export interface BootstrapInfoProvider {
  getInfo(): BootstrapInfo;
}

export type {
  PublishedBundleDescriptor,
  PublishedDatasetAbsent,
  PublishedDatasetAbsentReason,
  PublishedDatasetManifest,
  PublishedDatasetRead,
  PublishedDatasetReader,
  PublishedDatasetUnavailable,
  PublishedDatasetUnavailableReason,
} from './published-dataset';
export type {
  DatasetGenerationRepository,
  DatasetStateSource,
  DatasetUpdateFailureReason,
  DatasetUpdatePipeline,
  DatasetUpdateState,
  FavoriteEntry,
  FavoriteStatus,
  GenerationReader,
  LocalCatalogueStore,
  LocalDatasetCandidate,
  LocalDatasetGeneration,
  LocalPreferencesStore,
  ProductTombstone,
  PublishedBundleLoader,
  PublishedBundleRead,
  RecentSearchEntry,
} from './local-store';
