import type { MedicationCatalogueSnapshot } from './catalogue';
import { canonicalJson } from './checksum';
import type {
  ActiveIngredient,
  ATCCode,
  CacheRightsStatus,
  DataSource,
  DatasetRecordCounts,
  DatasetStatus,
  DatasetVersion,
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
import type { FieldState, UnknownReason } from './field';
import { parseStableId, type EntityKind, type IdByKind } from './ids';
import { catalogueIssue, type CatalogueIssue } from './issues';
import type { UnitField } from './quantity';

export type DeserializeCatalogueResult =
  | { readonly ok: true; readonly snapshot: MedicationCatalogueSnapshot }
  | { readonly ok: false; readonly issues: readonly CatalogueIssue[] };

type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: CatalogueIssue[] };

type Read<T> = (value: unknown, path: string) => Result<T>;

const UNKNOWN_REASONS: ReadonlySet<string> = new Set([
  'source-marked-unknown',
  'ambiguous-decimal',
  'not-a-decimal',
  'unrecognized-unit',
  'conflicting-values',
  'not-determinable',
]);

function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function problem(path: string, detail: string): Result<never> {
  return {
    ok: false,
    issues: [catalogueIssue('malformed-json', 'Catalogue', '', path, detail)],
  };
}

function readExact<T>(
  value: unknown,
  path: string,
  readers: { [K in keyof T]: Read<T[K]> },
): Result<T> {
  if (!isPlain(value)) return problem(path, 'An object is required.');
  const readersRecord = readers as Record<string, Read<unknown>>;
  const expected = Object.keys(readersRecord);
  const actual = Object.keys(value);
  if (
    actual.length !== expected.length ||
    expected.some((key) => !Object.hasOwn(value, key))
  )
    return problem(path, 'The object keys do not match the catalogue shape.');
  const output = {} as T;
  const issues: CatalogueIssue[] = [];
  for (const key of expected) {
    const reader = readersRecord[key];
    if (!reader) return problem(path, 'A catalogue reader is missing.');
    const result = reader(value[key], `${path}.${key}`);
    if (!result.ok) issues.push(...result.issues);
    else (output as Record<string, unknown>)[key] = result.value;
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: output };
}

function readArray<T>(readItem: Read<T>): Read<readonly T[]> {
  return (value, path) => {
    if (!Array.isArray(value)) return problem(path, 'An array is required.');
    const items: T[] = [];
    const issues: CatalogueIssue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const result = readItem(value[index], `${path}[${index}]`);
      if (!result.ok) issues.push(...result.issues);
      else items.push(result.value);
    }
    if (issues.length > 0) return { ok: false, issues };
    return { ok: true, value: items };
  };
}

function readString(value: unknown, path: string): Result<string> {
  if (
    typeof value !== 'string' ||
    value.trim() === '' ||
    value !== value.trim()
  )
    return problem(path, 'A non-blank string is required.');
  return { ok: true, value };
}

function readEnum<T extends string>(allowed: readonly T[]): Read<T> {
  return (value, path) => {
    if (typeof value === 'string' && allowed.some((item) => item === value))
      return { ok: true, value: value as T };
    return problem(path, 'The value is outside the allowed set.');
  };
}

function readCount(value: unknown, path: string): Result<number> {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    return problem(path, 'A non-negative integer is required.');
  return { ok: true, value };
}

function readId<K extends EntityKind>(kind: K): Read<IdByKind[K]> {
  return (value, path) => {
    if (typeof value !== 'string')
      return problem(path, 'A canonical id is required.');
    const parsed = parseStableId(kind, value);
    if (!parsed.ok) return problem(path, 'The canonical id is malformed.');
    return { ok: true, value: parsed.id };
  };
}

function isUnknownReason(value: string): value is UnknownReason {
  return UNKNOWN_REASONS.has(value);
}

function readField<T>(readValue: Read<T>): Read<FieldState<T>> {
  return (value, path) => {
    if (!isPlain(value)) return problem(path, 'A field state is required.');
    const keys = Object.keys(value);
    if (value.status === 'missing' && keys.length === 1)
      return { ok: true, value: { status: 'missing' } };
    if (
      value.status === 'unknown' &&
      keys.length === 2 &&
      typeof value.reason === 'string' &&
      isUnknownReason(value.reason)
    )
      return { ok: true, value: { status: 'unknown', reason: value.reason } };
    if (
      value.status === 'present' &&
      keys.length === 2 &&
      Object.hasOwn(value, 'value')
    ) {
      const parsed = readValue(value.value, `${path}.value`);
      if (!parsed.ok) return parsed;
      return { ok: true, value: { status: 'present', value: parsed.value } };
    }
    return problem(
      path,
      'The field state is not missing, unknown, or present.',
    );
  };
}

function readUnit(value: unknown, path: string): Result<UnitField> {
  if (!isPlain(value)) return problem(path, 'A unit state is required.');
  const keys = Object.keys(value).sort().join(',');
  if (value.status === 'missing' && keys === 'status')
    return { ok: true, value: { status: 'missing' } };
  if (
    value.status === 'unknown' &&
    keys === 'reason,status' &&
    typeof value.reason === 'string' &&
    isUnknownReason(value.reason)
  )
    return { ok: true, value: { status: 'unknown', reason: value.reason } };
  if (
    value.status === 'present' &&
    keys === 'sourceText,status' &&
    typeof value.sourceText === 'string' &&
    value.sourceText.length > 0
  )
    return {
      ok: true,
      value: { status: 'present', sourceText: value.sourceText },
    };
  if (
    value.status === 'invalid' &&
    keys === 'reason,sourceText,status' &&
    typeof value.sourceText === 'string' &&
    (value.reason === 'not-a-unit-token' ||
      value.reason === 'unrecognized-unit')
  )
    return {
      ok: true,
      value: {
        status: 'invalid',
        sourceText: value.sourceText,
        reason: value.reason,
      },
    };
  return problem(path, 'The unit state is not valid.');
}

const readStringField = readField(readString);
const readProductStatus = readEnum<ProductStatus>([
  'active',
  'removed',
  'unresolved',
]);
const readMappingStatus = readEnum<MappingStatus>(['confirmed', 'unresolved']);
const readReviewStatus = readEnum<MappingReviewStatus>([
  'unreviewed',
  'reviewed',
  'rejected',
]);
const readDocumentType = readEnum<RegulatoryDocumentType>([
  'RCP',
  'SmPC',
  'PIL',
  'other',
]);
const readCacheRights = readEnum<CacheRightsStatus>([
  'not-assessed',
  'prohibited',
  'permitted',
]);
const readDatasetStatus = readEnum<DatasetStatus>([
  'staging',
  'validated',
  'published',
  'rejected',
  'withdrawn',
]);
const readRights = readEnum<RightsStatus>([
  'unresolved',
  'granted',
  'denied',
  'expired',
]);
const readUse = readEnum<SourceUse>([
  'retrieval',
  'server-storage',
  'transformation',
  'display',
  'redistribution',
  'offline-cache',
  'commercial-use',
  'automated-test',
]);

function readMapping(
  value: unknown,
  path: string,
): Result<ExternalIngredientMapping> {
  return readExact<ExternalIngredientMapping>(value, path, {
    sourceId: readId('DataSource'),
    sourceIngredientId: readString,
    mappingVersion: readString,
    reviewStatus: readReviewStatus,
  });
}

function readProduct(value: unknown, path: string): Result<MedicationProduct> {
  return readExact<MedicationProduct>(value, path, {
    id: readId('MedicationProduct'),
    sourceId: readId('DataSource'),
    sourceProductId: readString,
    cim: readStringField,
    commercialName: readString,
    originalDciText: readStringField,
    strengthText: readStringField,
    dosageFormId: readField(readId('DosageForm')),
    route: readStringField,
    atcCodeIds: readArray(readId('AtcCode')),
    manufacturerIds: readArray(readId('Manufacturer')),
    marketingAuthorizationHolderId: readField(
      readId('MarketingAuthorizationHolder'),
    ),
    authorizationNumber: readStringField,
    authorizationDate: readStringField,
    authorizationStatus: readStringField,
    presentationOrPackDescription: readStringField,
    regulatoryDocumentIds: readArray(readId('RegulatoryDocument')),
    sourceVersion: readString,
    datasetVersionId: readId('DatasetVersion'),
    firstSeenAt: readString,
    lastSeenAt: readString,
    status: readProductStatus,
  });
}

function readIngredient(
  value: unknown,
  path: string,
): Result<ActiveIngredient> {
  return readExact<ActiveIngredient>(value, path, {
    id: readId('ActiveIngredient'),
    preferredName: readString,
    originalNames: readArray(readString),
    dci: readStringField,
    saltOrForm: readStringField,
    synonyms: readArray(readString),
    externalMappings: readArray(readMapping),
    sourceId: readId('DataSource'),
    sourceVersion: readString,
    datasetVersionId: readId('DatasetVersion'),
    sourceRecordKey: readString,
  });
}

function readJoin(value: unknown, path: string): Result<MedicationIngredient> {
  return readExact<MedicationIngredient>(value, path, {
    id: readId('MedicationIngredient'),
    productId: readId('MedicationProduct'),
    ingredientId: readField(readId('ActiveIngredient')),
    sourceIngredientText: readString,
    strengthValue: readStringField,
    strengthValueNormalized: readStringField,
    strengthUnit: readUnit,
    denominatorValue: readStringField,
    denominatorValueNormalized: readStringField,
    denominatorUnit: readUnit,
    strengthOriginalText: readStringField,
    mappingStatus: readMappingStatus,
    mappingVersion: readString,
    sourceId: readId('DataSource'),
    datasetVersionId: readId('DatasetVersion'),
    sourceRecordKey: readString,
  });
}

function readAtc(value: unknown, path: string): Result<ATCCode> {
  return readExact<ATCCode>(value, path, {
    id: readId('AtcCode'),
    code: readString,
    codeSystem: readEnum(['synthetic-illustrative'] as const),
    illustrative: (input, itemPath) =>
      input === true
        ? { ok: true, value: true }
        : problem(itemPath, 'ATC rows must be marked illustrative.'),
    displayName: readStringField,
    classificationVersion: readStringField,
    sourceId: readId('DataSource'),
    datasetVersionId: readId('DatasetVersion'),
    sourceRecordKey: readString,
  });
}

function readForm(value: unknown, path: string): Result<DosageForm> {
  return readExact<DosageForm>(value, path, {
    id: readId('DosageForm'),
    displayName: readString,
    originalSourceText: readString,
    externalCode: readStringField,
    sourceId: readId('DataSource'),
    datasetVersionId: readId('DatasetVersion'),
    sourceRecordKey: readString,
  });
}

function readParty<T extends Manufacturer | MarketingAuthorizationHolder>(
  kind: 'Manufacturer' | 'MarketingAuthorizationHolder',
): Read<T> {
  return (value, path) =>
    readExact<T>(value, path, {
      id: readId(kind),
      name: readString,
      country: readStringField,
      sourceId: readId('DataSource'),
      sourceEntityId: readStringField,
      datasetVersionId: readId('DatasetVersion'),
      sourceRecordKey: readString,
    } as { [K in keyof T]: Read<T[K]> });
}

function readDocument(
  value: unknown,
  path: string,
): Result<RegulatoryDocument> {
  return readExact<RegulatoryDocument>(value, path, {
    id: readId('RegulatoryDocument'),
    productId: readId('MedicationProduct'),
    type: readDocumentType,
    title: readStringField,
    url: readString,
    language: readStringField,
    documentVersion: readStringField,
    publishedAt: readStringField,
    retrievedAt: readStringField,
    lastCheckedAt: readString,
    sourceId: readId('DataSource'),
    sourceVersion: readString,
    datasetVersionId: readId('DatasetVersion'),
    cachedContentReference: readStringField,
    cacheRightsStatus: readCacheRights,
    checksum: readStringField,
    sourceRecordKey: readString,
  });
}

function readSource(value: unknown, path: string): Result<DataSource> {
  return readExact<DataSource>(value, path, {
    id: readId('DataSource'),
    sourceKey: readString,
    name: readString,
    authority: readString,
    jurisdiction: readStringField,
    url: readString,
    licenseOrPermissionReference: readStringField,
    rightsStatus: readRights,
    allowedUses: readArray(readUse),
    prohibitedUses: readArray(readUse),
    permissionExpiresAt: readStringField,
    attributionRequirements: readStringField,
    expectedUpdateCadence: readStringField,
    importMethod: readString,
    coverageDescription: readString,
    reviewOwner: readString,
    reviewedAt: readString,
  });
}

function readCounts(value: unknown, path: string): Result<DatasetRecordCounts> {
  return readExact<DatasetRecordCounts>(value, path, {
    dataSources: readCount,
    datasetVersions: readCount,
    products: readCount,
    activeIngredients: readCount,
    medicationIngredients: readCount,
    atcCodes: readCount,
    dosageForms: readCount,
    manufacturers: readCount,
    marketingAuthorizationHolders: readCount,
    regulatoryDocuments: readCount,
  });
}

function readVersion(value: unknown, path: string): Result<DatasetVersion> {
  return readExact<DatasetVersion>(value, path, {
    id: readId('DatasetVersion'),
    dataset: readString,
    sourceIds: readArray(readId('DataSource')),
    upstreamVersion: readStringField,
    version: readString,
    publishedAt: readStringField,
    upstreamPublishedAt: readStringField,
    importedAt: readString,
    checksum: readString,
    schemaVersion: readString,
    minimumClientVersion: readString,
    recordCounts: readCounts,
    coverage: readString,
    rightsApprovalReference: readString,
    clinicalReviewReference: readString,
    previousVersionId: readField(readId('DatasetVersion')),
    status: readDatasetStatus,
  });
}

function readSnapshot(
  value: unknown,
  path: string,
): Result<MedicationCatalogueSnapshot> {
  return readExact<MedicationCatalogueSnapshot>(value, path, {
    dataSources: readArray(readSource),
    datasetVersions: readArray(readVersion),
    products: readArray(readProduct),
    activeIngredients: readArray(readIngredient),
    medicationIngredients: readArray(readJoin),
    atcCodes: readArray(readAtc),
    dosageForms: readArray(readForm),
    manufacturers: readArray(readParty<Manufacturer>('Manufacturer')),
    marketingAuthorizationHolders: readArray(
      readParty<MarketingAuthorizationHolder>('MarketingAuthorizationHolder'),
    ),
    regulatoryDocuments: readArray(readDocument),
  });
}

/** Canonical JSON. The payload is plain data with no vendor envelope. */
export function serializeCatalogue(
  snapshot: MedicationCatalogueSnapshot,
): string {
  return canonicalJson(snapshot);
}

/** Read canonical catalogue JSON. Malformed input returns issues and does not throw. */
export function deserializeCatalogue(json: string): DeserializeCatalogueResult {
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return {
        ok: false,
        issues: [
          catalogueIssue(
            'malformed-json',
            'Catalogue',
            '',
            'json',
            'The text is not JSON.',
          ),
        ],
      };
    }
    const result = readSnapshot(parsed, 'catalogue');
    if (!result.ok) return { ok: false, issues: result.issues };
    return { ok: true, snapshot: result.value };
  } catch {
    return {
      ok: false,
      issues: [
        catalogueIssue(
          'malformed-json',
          'Catalogue',
          '',
          'json',
          'The catalogue JSON could not be read.',
        ),
      ],
    };
  }
}
