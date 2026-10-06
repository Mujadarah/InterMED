import {
  deriveStableId,
  type ActiveIngredient,
  type ATCCode,
  type DataSource,
  type DatasetVersion,
  type DosageForm,
  type EntityKind,
  type IdByKind,
  type Manufacturer,
  type MarketingAuthorizationHolder,
  type MedicationCatalogueSnapshot,
  type MedicationIngredient,
  type MedicationProduct,
  type RegulatoryDocument,
} from '@intermed/domain';

export const SOURCE_NAMESPACE = 'intermed';
export const SOURCE_KEY = 'source.synthetic';
export const DATASET_KEY = 'synthetic-1';
const SEEN = '2026-10-06T00:00:00Z';

export function mustId<K extends EntityKind>(
  kind: K,
  sourceId: string,
  sourceRecordKey: string,
): IdByKind[K] {
  const result = deriveStableId(kind, sourceId, sourceRecordKey);
  if (!result.ok) throw new Error(`${kind} test id was rejected`);
  return result.id;
}

export const sourceId = mustId('DataSource', SOURCE_NAMESPACE, SOURCE_KEY);
export const datasetVersionId = mustId(
  'DatasetVersion',
  SOURCE_KEY,
  DATASET_KEY,
);

const missing = { status: 'missing' } as const;

export function product(
  sourceProductId: string,
  commercialName: string,
  overrides: Partial<MedicationProduct> = {},
): MedicationProduct {
  return {
    id: mustId('MedicationProduct', SOURCE_KEY, sourceProductId),
    sourceId,
    sourceProductId,
    cim: missing,
    commercialName,
    originalDciText: missing,
    strengthText: missing,
    dosageFormId: missing,
    route: missing,
    atcCodeIds: [],
    manufacturerIds: [],
    marketingAuthorizationHolderId: missing,
    authorizationNumber: missing,
    authorizationDate: missing,
    authorizationStatus: missing,
    presentationOrPackDescription: missing,
    regulatoryDocumentIds: [],
    sourceVersion: 'synthetic-1',
    datasetVersionId,
    firstSeenAt: SEEN,
    lastSeenAt: SEEN,
    status: 'active',
    ...overrides,
  };
}

export function ingredient(
  sourceRecordKey: string,
  preferredName: string,
  overrides: Partial<ActiveIngredient> = {},
): ActiveIngredient {
  return {
    id: mustId('ActiveIngredient', SOURCE_KEY, sourceRecordKey),
    preferredName,
    originalNames: [preferredName],
    dci: { status: 'present', value: preferredName },
    saltOrForm: missing,
    synonyms: [],
    externalMappings: [
      {
        sourceId,
        sourceIngredientId: sourceRecordKey,
        mappingVersion: 'map-synthetic-1',
        reviewStatus: 'unreviewed',
      },
    ],
    sourceId,
    sourceVersion: 'synthetic-1',
    datasetVersionId,
    sourceRecordKey,
    ...overrides,
  };
}

export function join(
  sourceRecordKey: string,
  productId: MedicationProduct['id'],
  sourceIngredientText: string,
  overrides: Partial<MedicationIngredient> = {},
): MedicationIngredient {
  return {
    id: mustId('MedicationIngredient', SOURCE_KEY, sourceRecordKey),
    productId,
    ingredientId: missing,
    sourceIngredientText,
    strengthValue: missing,
    strengthValueNormalized: missing,
    strengthUnit: missing,
    denominatorValue: missing,
    denominatorValueNormalized: missing,
    denominatorUnit: missing,
    strengthOriginalText: missing,
    mappingStatus: 'unresolved',
    mappingVersion: 'map-synthetic-1',
    sourceId,
    datasetVersionId,
    sourceRecordKey,
    ...overrides,
  };
}

export function atc(sourceRecordKey: string, code: string): ATCCode {
  return {
    id: mustId('AtcCode', SOURCE_KEY, sourceRecordKey),
    code,
    codeSystem: 'synthetic-illustrative',
    illustrative: true,
    displayName: {
      status: 'present',
      value: 'Synthetic illustrative class',
    },
    classificationVersion: missing,
    sourceId,
    datasetVersionId,
    sourceRecordKey,
  };
}

export function dosageForm(
  sourceRecordKey: string,
  displayName: string,
): DosageForm {
  return {
    id: mustId('DosageForm', SOURCE_KEY, sourceRecordKey),
    displayName,
    originalSourceText: displayName,
    externalCode: missing,
    sourceId,
    datasetVersionId,
    sourceRecordKey,
  };
}

export function manufacturer(
  sourceRecordKey: string,
  name: string,
): Manufacturer {
  return {
    id: mustId('Manufacturer', SOURCE_KEY, sourceRecordKey),
    name,
    country: missing,
    sourceId,
    sourceEntityId: missing,
    datasetVersionId,
    sourceRecordKey,
  };
}

export function holder(
  sourceRecordKey: string,
  name: string,
): MarketingAuthorizationHolder {
  return {
    id: mustId('MarketingAuthorizationHolder', SOURCE_KEY, sourceRecordKey),
    name,
    country: missing,
    sourceId,
    sourceEntityId: missing,
    datasetVersionId,
    sourceRecordKey,
  };
}

export function document(
  sourceRecordKey: string,
  productId: MedicationProduct['id'],
): RegulatoryDocument {
  return {
    id: mustId('RegulatoryDocument', SOURCE_KEY, sourceRecordKey),
    productId,
    type: 'other',
    title: { status: 'present', value: 'Synthetic document placeholder' },
    url: 'https://example.invalid/intermed/synthetic-document',
    language: missing,
    documentVersion: missing,
    publishedAt: missing,
    retrievedAt: missing,
    lastCheckedAt: SEEN,
    sourceId,
    sourceVersion: 'synthetic-1',
    datasetVersionId,
    cachedContentReference: missing,
    cacheRightsStatus: 'not-assessed',
    checksum: missing,
    sourceRecordKey,
  };
}

export function emptyCatalogue(
  overrides: Partial<MedicationCatalogueSnapshot> = {},
): MedicationCatalogueSnapshot {
  const dataSource: DataSource = {
    id: sourceId,
    sourceKey: SOURCE_KEY,
    name: 'Synthetic InterMED medication fixture',
    authority: 'none',
    jurisdiction: missing,
    url: 'https://example.invalid/intermed/synthetic-medication-fixture',
    licenseOrPermissionReference: {
      status: 'present',
      value: 'synthetic-no-rights-granted',
    },
    rightsStatus: 'unresolved',
    allowedUses: ['automated-test'],
    prohibitedUses: [
      'retrieval',
      'server-storage',
      'transformation',
      'display',
      'redistribution',
      'offline-cache',
      'commercial-use',
    ],
    permissionExpiresAt: missing,
    attributionRequirements: {
      status: 'present',
      value: 'Synthetic fixture. Do not attribute it to a regulator.',
    },
    expectedUpdateCadence: missing,
    importMethod: 'synthetic-inline',
    coverageDescription:
      'Fictional names only. Not a medicines catalogue and not for clinical use.',
    reviewOwner: 'none',
    reviewedAt: SEEN,
  };
  const datasetVersion: DatasetVersion = {
    id: datasetVersionId,
    dataset: 'synthetic-medication-catalogue',
    sourceIds: [sourceId],
    upstreamVersion: missing,
    version: DATASET_KEY,
    publishedAt: missing,
    upstreamPublishedAt: missing,
    importedAt: SEEN,
    checksum: 'unset',
    schemaVersion: 'medication-catalogue-1',
    minimumClientVersion: '0.0.0',
    recordCounts: {
      dataSources: 1,
      datasetVersions: 1,
      products: 0,
      activeIngredients: 0,
      medicationIngredients: 0,
      atcCodes: 0,
      dosageForms: 0,
      manufacturers: 0,
      marketingAuthorizationHolders: 0,
      regulatoryDocuments: 0,
    },
    coverage: 'Synthetic development snapshot. No clinical coverage.',
    rightsApprovalReference: 'not-approved',
    clinicalReviewReference: 'not-reviewed',
    previousVersionId: missing,
    status: 'staging',
  };
  return {
    dataSources: [dataSource],
    datasetVersions: [datasetVersion],
    products: [],
    activeIngredients: [],
    medicationIngredients: [],
    atcCodes: [],
    dosageForms: [],
    manufacturers: [],
    marketingAuthorizationHolders: [],
    regulatoryDocuments: [],
    ...overrides,
  };
}
