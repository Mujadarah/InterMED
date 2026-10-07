import {
  assessQuantity,
  deriveStableId,
  isPreservedSourceText,
  sealCatalogue,
  INTERMED_ID_NAMESPACE,
  MEDICATION_CATALOGUE_SCHEMA_VERSION,
  type DataSource,
  type DatasetVersion,
  type EntityKind,
  type FieldState,
  type IdByKind,
  type MedicationCatalogueSnapshot,
} from '@intermed/domain';
import { z } from 'zod';

const unknownReason = z.enum([
  'source-marked-unknown',
  'ambiguous-decimal',
  'not-a-decimal',
  'unrecognized-unit',
  'conflicting-values',
  'not-determinable',
]);

function isRecordKey(value: string): boolean {
  if (value.length === 0 || value !== value.trim()) return false;
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code === undefined || code <= 0x1f || code === 0x7f) return false;
    if (/\s/u.test(char)) return false;
  }
  return true;
}

const recordKey = z
  .string()
  .min(1)
  .refine(isRecordKey, 'blank or control character');

const text = z
  .string()
  .refine(isPreservedSourceText, 'A non-empty string is required.');
const instant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);

const stringField = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('missing') }),
  z.strictObject({ status: z.literal('unknown'), reason: unknownReason }),
  z.strictObject({ status: z.literal('present'), value: text }),
]);

const sourceUse = z.enum([
  'retrieval',
  'server-storage',
  'transformation',
  'display',
  'redistribution',
  'offline-cache',
  'commercial-use',
  'automated-test',
]);

const provenance = {
  sourceKey: recordKey,
  datasetVersionKey: recordKey,
};

const rawDataSource = z.strictObject({
  sourceKey: recordKey,
  name: text,
  authority: text,
  jurisdiction: stringField,
  url: text,
  licenseOrPermissionReference: stringField,
  rightsStatus: z.enum(['unresolved', 'granted', 'denied', 'expired']),
  allowedUses: z.array(sourceUse),
  prohibitedUses: z.array(sourceUse),
  permissionExpiresAt: stringField,
  attributionRequirements: stringField,
  expectedUpdateCadence: stringField,
  importMethod: text,
  coverageDescription: text,
  reviewOwner: text,
  reviewedAt: instant,
});

const rawDatasetVersion = z.strictObject({
  dataset: text,
  version: recordKey,
  upstreamVersion: stringField,
  publishedAt: stringField,
  upstreamPublishedAt: stringField,
  importedAt: instant,
  schemaVersion: z.literal(MEDICATION_CATALOGUE_SCHEMA_VERSION),
  minimumClientVersion: text,
  coverage: text,
  rightsApprovalReference: text,
  clinicalReviewReference: text,
  previousVersionKey: stringField,
  status: z.enum([
    'staging',
    'validated',
    'published',
    'rejected',
    'withdrawn',
  ]),
});

const rawProduct = z.strictObject({
  ...provenance,
  sourceProductId: recordKey,
  cim: stringField,
  commercialName: text,
  originalDciText: stringField,
  strengthText: stringField,
  dosageFormKey: stringField,
  route: stringField,
  atcKeys: z.array(recordKey),
  manufacturerKeys: z.array(recordKey),
  marketingAuthorizationHolderKey: stringField,
  authorizationNumber: stringField,
  authorizationDate: stringField,
  authorizationStatus: stringField,
  presentationOrPackDescription: stringField,
  regulatoryDocumentKeys: z.array(recordKey),
  sourceVersion: text,
  firstSeenAt: instant,
  lastSeenAt: instant,
  status: z.enum(['active', 'removed', 'unresolved']),
});

const rawMapping = z.strictObject({
  sourceKey: recordKey,
  sourceIngredientId: recordKey,
  mappingVersion: text,
  reviewStatus: z.enum(['unreviewed', 'reviewed', 'rejected']),
});

const rawIngredient = z.strictObject({
  ...provenance,
  sourceRecordKey: recordKey,
  preferredName: text,
  originalNames: z.array(text),
  dci: stringField,
  saltOrForm: stringField,
  synonyms: z.array(text),
  externalMappings: z.array(rawMapping).min(1),
  sourceVersion: text,
});

const rawStrength = z.strictObject({
  value: stringField,
  unit: stringField,
  originalText: stringField,
  denominatorValue: stringField,
  denominatorUnit: stringField,
});

const rawJoin = z.strictObject({
  ...provenance,
  sourceRecordKey: recordKey,
  productSourceKey: recordKey,
  productSourceKeySource: recordKey,
  ingredientKey: stringField,
  sourceIngredientText: text,
  strength: rawStrength,
  mappingStatus: z.enum(['confirmed', 'unresolved']),
  mappingVersion: text,
});

const rawAtc = z.strictObject({
  ...provenance,
  sourceRecordKey: recordKey,
  code: text,
  codeSystem: z.literal('synthetic-illustrative'),
  illustrative: z.literal(true),
  displayName: stringField,
  classificationVersion: stringField,
});

const rawForm = z.strictObject({
  ...provenance,
  sourceRecordKey: recordKey,
  displayName: text,
  originalSourceText: text,
  externalCode: stringField,
});

const rawParty = z.strictObject({
  ...provenance,
  sourceRecordKey: recordKey,
  name: text,
  country: stringField,
  sourceEntityId: stringField,
});

const rawDocument = z.strictObject({
  ...provenance,
  sourceRecordKey: recordKey,
  productSourceKey: recordKey,
  productSourceKeySource: recordKey,
  type: z.enum(['RCP', 'SmPC', 'PIL', 'other']),
  title: stringField,
  url: text,
  language: stringField,
  documentVersion: stringField,
  publishedAt: stringField,
  retrievedAt: stringField,
  lastCheckedAt: instant,
  sourceVersion: text,
  cachedContentReference: stringField,
  cacheRightsStatus: z.enum(['not-assessed', 'prohibited', 'permitted']),
  checksum: stringField,
});

const syntheticSourceSchema = z.strictObject({
  synthetic: z.literal(true),
  dataSource: rawDataSource,
  datasetVersion: rawDatasetVersion,
  products: z.array(rawProduct),
  activeIngredients: z.array(rawIngredient),
  medicationIngredients: z.array(rawJoin),
  atcCodes: z.array(rawAtc),
  dosageForms: z.array(rawForm),
  manufacturers: z.array(rawParty),
  marketingAuthorizationHolders: z.array(rawParty),
  regulatoryDocuments: z.array(rawDocument),
});

export type SyntheticMedicationSource = z.infer<typeof syntheticSourceSchema>;

export interface SourceValidationIssue {
  readonly code: 'invalid-source-document';
  readonly path: string;
  readonly message: string;
}

export type SyntheticValidationResult =
  | { readonly ok: true; readonly snapshot: MedicationCatalogueSnapshot }
  | { readonly ok: false; readonly issues: readonly SourceValidationIssue[] };

type RawField = z.infer<typeof stringField>;

function validationIssues(error: z.ZodError): readonly SourceValidationIssue[] {
  return error.issues.map((issue) => ({
    code: 'invalid-source-document',
    path: issue.path.map((part) => String(part)).join('.'),
    message: issue.message,
  }));
}

function mustId<K extends EntityKind>(
  kind: K,
  sourceId: string,
  sourceRecordKey: string,
): IdByKind[K] {
  const derived = deriveStableId(kind, sourceId, sourceRecordKey);
  if (!derived.ok) throw new Error(`unstable ${kind} key`);
  return derived.id;
}

function linkId<K extends EntityKind>(
  kind: K,
  sourceKey: string,
  field: RawField,
): FieldState<IdByKind[K]> {
  if (field.status !== 'present') return field;
  return { status: 'present', value: mustId(kind, sourceKey, field.value) };
}

function asField(field: RawField): FieldState<string> {
  return field;
}

function mapSource(
  raw: SyntheticMedicationSource,
): MedicationCatalogueSnapshot {
  const sourceKey = raw.dataSource.sourceKey;
  const versionKey = raw.datasetVersion.version;
  const sourceId = mustId('DataSource', INTERMED_ID_NAMESPACE, sourceKey);
  const datasetVersionId = mustId('DatasetVersion', sourceKey, versionKey);
  const dataSource: DataSource = {
    id: sourceId,
    sourceKey,
    name: raw.dataSource.name,
    authority: raw.dataSource.authority,
    jurisdiction: asField(raw.dataSource.jurisdiction),
    url: raw.dataSource.url,
    licenseOrPermissionReference: asField(
      raw.dataSource.licenseOrPermissionReference,
    ),
    rightsStatus: raw.dataSource.rightsStatus,
    allowedUses: raw.dataSource.allowedUses,
    prohibitedUses: raw.dataSource.prohibitedUses,
    permissionExpiresAt: asField(raw.dataSource.permissionExpiresAt),
    attributionRequirements: asField(raw.dataSource.attributionRequirements),
    expectedUpdateCadence: asField(raw.dataSource.expectedUpdateCadence),
    importMethod: raw.dataSource.importMethod,
    coverageDescription: raw.dataSource.coverageDescription,
    reviewOwner: raw.dataSource.reviewOwner,
    reviewedAt: raw.dataSource.reviewedAt,
  };
  const previous = linkId(
    'DatasetVersion',
    sourceKey,
    raw.datasetVersion.previousVersionKey,
  );
  const datasetVersion: DatasetVersion = {
    id: datasetVersionId,
    dataset: raw.datasetVersion.dataset,
    sourceIds: [sourceId],
    upstreamVersion: asField(raw.datasetVersion.upstreamVersion),
    version: versionKey,
    publishedAt: asField(raw.datasetVersion.publishedAt),
    upstreamPublishedAt: asField(raw.datasetVersion.upstreamPublishedAt),
    importedAt: raw.datasetVersion.importedAt,
    checksum: '',
    schemaVersion: raw.datasetVersion.schemaVersion,
    minimumClientVersion: raw.datasetVersion.minimumClientVersion,
    recordCounts: {
      dataSources: 0,
      datasetVersions: 0,
      products: 0,
      activeIngredients: 0,
      medicationIngredients: 0,
      atcCodes: 0,
      dosageForms: 0,
      manufacturers: 0,
      marketingAuthorizationHolders: 0,
      regulatoryDocuments: 0,
    },
    coverage: raw.datasetVersion.coverage,
    rightsApprovalReference: raw.datasetVersion.rightsApprovalReference,
    clinicalReviewReference: raw.datasetVersion.clinicalReviewReference,
    previousVersionId: previous,
    status: raw.datasetVersion.status,
  };
  const snapshot: MedicationCatalogueSnapshot = {
    dataSources: [dataSource],
    datasetVersions: [datasetVersion],
    products: raw.products.map((row) => ({
      id: mustId('MedicationProduct', row.sourceKey, row.sourceProductId),
      sourceId: mustId('DataSource', INTERMED_ID_NAMESPACE, row.sourceKey),
      sourceProductId: row.sourceProductId,
      cim: asField(row.cim),
      commercialName: row.commercialName,
      originalDciText: asField(row.originalDciText),
      strengthText: asField(row.strengthText),
      dosageFormId: linkId('DosageForm', row.sourceKey, row.dosageFormKey),
      route: asField(row.route),
      atcCodeIds: row.atcKeys.map((key) =>
        mustId('AtcCode', row.sourceKey, key),
      ),
      manufacturerIds: row.manufacturerKeys.map((key) =>
        mustId('Manufacturer', row.sourceKey, key),
      ),
      marketingAuthorizationHolderId: linkId(
        'MarketingAuthorizationHolder',
        row.sourceKey,
        row.marketingAuthorizationHolderKey,
      ),
      authorizationNumber: asField(row.authorizationNumber),
      authorizationDate: asField(row.authorizationDate),
      authorizationStatus: asField(row.authorizationStatus),
      presentationOrPackDescription: asField(row.presentationOrPackDescription),
      regulatoryDocumentIds: row.regulatoryDocumentKeys.map((key) =>
        mustId('RegulatoryDocument', row.sourceKey, key),
      ),
      sourceVersion: row.sourceVersion,
      datasetVersionId: mustId(
        'DatasetVersion',
        row.sourceKey,
        row.datasetVersionKey,
      ),
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      status: row.status,
    })),
    activeIngredients: raw.activeIngredients.map((row) => ({
      id: mustId('ActiveIngredient', row.sourceKey, row.sourceRecordKey),
      preferredName: row.preferredName,
      originalNames: row.originalNames,
      dci: asField(row.dci),
      saltOrForm: asField(row.saltOrForm),
      synonyms: row.synonyms,
      externalMappings: row.externalMappings.map((mapping) => ({
        sourceId: mustId(
          'DataSource',
          INTERMED_ID_NAMESPACE,
          mapping.sourceKey,
        ),
        sourceIngredientId: mapping.sourceIngredientId,
        mappingVersion: mapping.mappingVersion,
        reviewStatus: mapping.reviewStatus,
      })),
      sourceId: mustId('DataSource', INTERMED_ID_NAMESPACE, row.sourceKey),
      sourceVersion: row.sourceVersion,
      datasetVersionId: mustId(
        'DatasetVersion',
        row.sourceKey,
        row.datasetVersionKey,
      ),
      sourceRecordKey: row.sourceRecordKey,
    })),
    medicationIngredients: raw.medicationIngredients.map((row) => {
      const strength = assessQuantity({
        value: asField(row.strength.value),
        unit: asField(row.strength.unit),
        originalText: asField(row.strength.originalText),
      });
      const denominator = assessQuantity({
        value: asField(row.strength.denominatorValue),
        unit: asField(row.strength.denominatorUnit),
        originalText: { status: 'missing' },
      });
      return {
        id: mustId('MedicationIngredient', row.sourceKey, row.sourceRecordKey),
        productId: mustId(
          'MedicationProduct',
          row.productSourceKeySource,
          row.productSourceKey,
        ),
        ingredientId: linkId(
          'ActiveIngredient',
          row.sourceKey,
          row.ingredientKey,
        ),
        sourceIngredientText: row.sourceIngredientText,
        strengthValue: strength.value,
        strengthValueNormalized: strength.normalized,
        strengthUnit: strength.unit,
        denominatorValue: denominator.value,
        denominatorValueNormalized: denominator.normalized,
        denominatorUnit: denominator.unit,
        strengthOriginalText: strength.originalText,
        mappingStatus: row.mappingStatus,
        mappingVersion: row.mappingVersion,
        sourceId: mustId('DataSource', INTERMED_ID_NAMESPACE, row.sourceKey),
        datasetVersionId: mustId(
          'DatasetVersion',
          row.sourceKey,
          row.datasetVersionKey,
        ),
        sourceRecordKey: row.sourceRecordKey,
      };
    }),
    atcCodes: raw.atcCodes.map((row) => ({
      id: mustId('AtcCode', row.sourceKey, row.sourceRecordKey),
      code: row.code,
      codeSystem: row.codeSystem,
      illustrative: row.illustrative,
      displayName: asField(row.displayName),
      classificationVersion: asField(row.classificationVersion),
      sourceId: mustId('DataSource', INTERMED_ID_NAMESPACE, row.sourceKey),
      datasetVersionId: mustId(
        'DatasetVersion',
        row.sourceKey,
        row.datasetVersionKey,
      ),
      sourceRecordKey: row.sourceRecordKey,
    })),
    dosageForms: raw.dosageForms.map((row) => ({
      id: mustId('DosageForm', row.sourceKey, row.sourceRecordKey),
      displayName: row.displayName,
      originalSourceText: row.originalSourceText,
      externalCode: asField(row.externalCode),
      sourceId: mustId('DataSource', INTERMED_ID_NAMESPACE, row.sourceKey),
      datasetVersionId: mustId(
        'DatasetVersion',
        row.sourceKey,
        row.datasetVersionKey,
      ),
      sourceRecordKey: row.sourceRecordKey,
    })),
    manufacturers: raw.manufacturers.map((row) => ({
      id: mustId('Manufacturer', row.sourceKey, row.sourceRecordKey),
      name: row.name,
      country: asField(row.country),
      sourceId: mustId('DataSource', INTERMED_ID_NAMESPACE, row.sourceKey),
      sourceEntityId: asField(row.sourceEntityId),
      datasetVersionId: mustId(
        'DatasetVersion',
        row.sourceKey,
        row.datasetVersionKey,
      ),
      sourceRecordKey: row.sourceRecordKey,
    })),
    marketingAuthorizationHolders: raw.marketingAuthorizationHolders.map(
      (row) => ({
        id: mustId(
          'MarketingAuthorizationHolder',
          row.sourceKey,
          row.sourceRecordKey,
        ),
        name: row.name,
        country: asField(row.country),
        sourceId: mustId('DataSource', INTERMED_ID_NAMESPACE, row.sourceKey),
        sourceEntityId: asField(row.sourceEntityId),
        datasetVersionId: mustId(
          'DatasetVersion',
          row.sourceKey,
          row.datasetVersionKey,
        ),
        sourceRecordKey: row.sourceRecordKey,
      }),
    ),
    regulatoryDocuments: raw.regulatoryDocuments.map((row) => ({
      id: mustId('RegulatoryDocument', row.sourceKey, row.sourceRecordKey),
      productId: mustId(
        'MedicationProduct',
        row.productSourceKeySource,
        row.productSourceKey,
      ),
      type: row.type,
      title: asField(row.title),
      url: row.url,
      language: asField(row.language),
      documentVersion: asField(row.documentVersion),
      publishedAt: asField(row.publishedAt),
      retrievedAt: asField(row.retrievedAt),
      lastCheckedAt: row.lastCheckedAt,
      sourceId: mustId('DataSource', INTERMED_ID_NAMESPACE, row.sourceKey),
      sourceVersion: row.sourceVersion,
      datasetVersionId: mustId(
        'DatasetVersion',
        row.sourceKey,
        row.datasetVersionKey,
      ),
      cachedContentReference: asField(row.cachedContentReference),
      cacheRightsStatus: row.cacheRightsStatus,
      checksum: asField(row.checksum),
      sourceRecordKey: row.sourceRecordKey,
    })),
  };
  return sealCatalogue(snapshot);
}

/**
 * Validate one synthetic source document into domain entities.
 * Referential gaps stay in the snapshot and are reported by the domain checker.
 * This function returns issues instead of throwing.
 */
export function validateSyntheticSource(
  input: unknown,
): SyntheticValidationResult {
  try {
    const parsed = syntheticSourceSchema.safeParse(input);
    if (!parsed.success)
      return { ok: false, issues: validationIssues(parsed.error) };
    return { ok: true, snapshot: mapSource(parsed.data) };
  } catch {
    return {
      ok: false,
      issues: [
        {
          code: 'invalid-source-document',
          path: '',
          message: 'The synthetic source could not be mapped.',
        },
      ],
    };
  }
}
