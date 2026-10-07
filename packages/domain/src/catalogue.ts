import type {
  ActiveIngredient,
  ATCCode,
  DataSource,
  DatasetVersion,
  DosageForm,
  Manufacturer,
  MarketingAuthorizationHolder,
  MedicationIngredient,
  MedicationProduct,
  RegulatoryDocument,
} from './entities';

/** Schema label stored on DatasetVersion.schemaVersion for this model. */
export const MEDICATION_CATALOGUE_SCHEMA_VERSION = 'medication-catalogue-1';

/** Namespace used only when deriving DataSource canonical ids. */
export const INTERMED_ID_NAMESPACE = 'intermed';

export interface MedicationCatalogueSnapshot {
  readonly dataSources: readonly DataSource[];
  readonly datasetVersions: readonly DatasetVersion[];
  readonly products: readonly MedicationProduct[];
  readonly activeIngredients: readonly ActiveIngredient[];
  readonly medicationIngredients: readonly MedicationIngredient[];
  readonly atcCodes: readonly ATCCode[];
  readonly dosageForms: readonly DosageForm[];
  readonly manufacturers: readonly Manufacturer[];
  readonly marketingAuthorizationHolders: readonly MarketingAuthorizationHolder[];
  readonly regulatoryDocuments: readonly RegulatoryDocument[];
}

/**
 * Swappable catalogue loader. Domain functions take the snapshot this returns
 * and do not know whether the snapshot came from memory, a file, or a later adapter.
 */
export interface MedicationCatalogueSource {
  load(): MedicationCatalogueSnapshot;
}
