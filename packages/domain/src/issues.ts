export type CatalogueIssueCode =
  | 'product-not-found'
  | 'no-ingredients'
  | 'unresolved-mapping'
  | 'confirmed-mapping-missing-ingredient'
  | 'dangling-ingredient'
  | 'dangling-product'
  | 'dangling-dosage-form'
  | 'dangling-atc'
  | 'dangling-manufacturer'
  | 'dangling-marketing-authorization-holder'
  | 'dangling-regulatory-document'
  | 'dangling-source'
  | 'dangling-dataset-version'
  | 'dangling-previous-dataset-version'
  | 'regulatory-document-product-mismatch'
  | 'duplicate-id'
  | 'duplicate-source-product-id'
  | 'invalid-unit'
  | 'ambiguous-decimal'
  | 'checksum-mismatch'
  | 'record-count-mismatch'
  | 'dataset-version-count'
  | 'invalid-timestamp'
  | 'malformed-snapshot'
  | 'malformed-json'
  | 'ingredient-mapping-unreviewed'
  | 'atc-not-illustrative';

export type CatalogueEntity =
  | 'Catalogue'
  | 'MedicationProduct'
  | 'ActiveIngredient'
  | 'MedicationIngredient'
  | 'ATCCode'
  | 'DosageForm'
  | 'Manufacturer'
  | 'MarketingAuthorizationHolder'
  | 'RegulatoryDocument'
  | 'DataSource'
  | 'DatasetVersion';

export interface CatalogueIssue {
  readonly code: CatalogueIssueCode;
  readonly entity: CatalogueEntity;
  readonly entityId: string;
  readonly field: string;
  readonly detail: string;
}

export function catalogueIssue(
  code: CatalogueIssueCode,
  entity: CatalogueEntity,
  entityId: string,
  field: string,
  detail: string,
): CatalogueIssue {
  return { code, entity, entityId, field, detail };
}
