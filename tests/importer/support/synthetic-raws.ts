import type { SyntheticMedicationSource } from '@intermed/data-access';
import type { CanonicalImporterConfig } from '../../../packages/importer/src/core';

/**
 * Synthetic raw snapshot builders for importer tests.
 *
 * Every row is SYNTHETIC and uses obviously fictional names (Fictivol,
 * Placebex, Vacantol, Synthetica). Nothing here is a clinical fact.
 *
 * The builders produce `anmdmr-synthetic` envelope documents whose entity rows
 * match `validateSyntheticSource`'s strict raw schemas so the real domain
 * validator, serializer and deserializer can run unmocked.
 */

type RawSource = SyntheticMedicationSource;
type RawProduct = RawSource['products'][number];
type RawIngredient = RawSource['activeIngredients'][number];
type RawJoin = RawSource['medicationIngredients'][number];
type RawForm = RawSource['dosageForms'][number];
type StringField = RawSource['datasetVersion']['upstreamVersion'];

export const SYNTHETIC_SOURCE_KEY = 'source.fictivol';
export const RAW_VERSION_KEY = 'synthetic-fictivol-v1';
export const SEEN_INSTANT = '2026-10-06T00:00:00Z';

/** Wrap synthetic source text in the domain present-field state. */
export function present(value: string): StringField {
  return { status: 'present', value };
}

export const missing: StringField = { status: 'missing' };

export interface IngredientSpec {
  /** Stable ingredient record key; becomes the ActiveIngredient row key. */
  key: string;
  /** Preserved source text of the ingredient. */
  text: string;
  /** Stable join record key; becomes the MedicationIngredient row key. */
  joinKey: string;
  value?: string;
  unit?: string;
}

export interface ProductSpec {
  sourceProductId: string;
  commercialName: string;
  status?: 'active' | 'removed' | 'unresolved';
  strengthText?: string;
  dosageFormKey?: string;
  ingredients?: IngredientSpec[];
}

export interface RawOptions {
  products: ProductSpec[];
  version?: string;
  datasetVersionKey?: string;
  previousVersionKey?: string;
  completeness?: 'full' | 'partial';
  /** Declared counts. Omitted counts are computed from the actual rows. */
  recordCounts?: Record<string, number>;
  schemaVersion?: string;
  sourceKey?: string;
}

export interface RawEnvelopeDocument extends RawSource {
  format: 'anmdmr-synthetic';
  schemaVersion: string;
  completeness: 'full' | 'partial';
  recordCounts: Record<string, number>;
  sourceKey: string;
  datasetVersionKey?: string;
}

/** Preserve supplied strength text or mark an omitted value as missing. */
function strengthField(value: string | undefined): StringField {
  return value === undefined ? missing : present(value);
}

/** Build synthetic strength fields while retaining the supplied value and unit text. */
function joinStrength(
  value: string | undefined,
  unit: string | undefined,
): RawJoin['strength'] {
  const original =
    value === undefined
      ? missing
      : present(unit === undefined ? value : `${value} ${unit}`);
  return {
    value: strengthField(value),
    unit: strengthField(unit),
    originalText: original,
    denominatorValue: missing,
    denominatorUnit: missing,
  };
}

/** Return an explicitly fictional dosage-form label for the fixture key. */
function formName(key: string): string {
  if (key === 'DF-TABLET') return 'fictional tablet';
  if (key === 'DF-CAPSULE') return 'fictional capsule';
  return `synthetic form ${key}`;
}

/** Build one complete synthetic raw envelope document. */
export function buildRawDocument(options: RawOptions): RawEnvelopeDocument {
  const sourceKey = options.sourceKey ?? SYNTHETIC_SOURCE_KEY;
  const version = options.version ?? RAW_VERSION_KEY;
  const products: RawProduct[] = [];
  const activeIngredients: RawIngredient[] = [];
  const medicationIngredients: RawJoin[] = [];
  const dosageForms: RawForm[] = [];
  const formKeys = new Set<string>();
  const ingredientKeys = new Set<string>();

  for (const spec of options.products) {
    products.push({
      sourceKey,
      datasetVersionKey: version,
      sourceProductId: spec.sourceProductId,
      cim: missing,
      commercialName: spec.commercialName,
      originalDciText: missing,
      strengthText: strengthField(spec.strengthText),
      dosageFormKey:
        spec.dosageFormKey === undefined
          ? missing
          : present(spec.dosageFormKey),
      route: missing,
      atcKeys: [],
      manufacturerKeys: [],
      marketingAuthorizationHolderKey: missing,
      authorizationNumber: missing,
      authorizationDate: missing,
      authorizationStatus: missing,
      presentationOrPackDescription: missing,
      regulatoryDocumentKeys: [],
      sourceVersion: 'synthetic-1',
      firstSeenAt: SEEN_INSTANT,
      lastSeenAt: SEEN_INSTANT,
      status: spec.status ?? 'active',
    });
    if (spec.dosageFormKey !== undefined) {
      formKeys.add(spec.dosageFormKey);
    }
    for (const ingredient of spec.ingredients ?? []) {
      ingredientKeys.add(ingredient.key);
      medicationIngredients.push({
        sourceKey,
        datasetVersionKey: version,
        sourceRecordKey: ingredient.joinKey,
        productSourceKey: spec.sourceProductId,
        productSourceKeySource: sourceKey,
        ingredientKey: present(ingredient.key),
        sourceIngredientText: ingredient.text,
        strength: joinStrength(ingredient.value, ingredient.unit),
        mappingStatus: 'confirmed',
        mappingVersion: 'synthetic-1',
      });
    }
  }

  for (const key of formKeys) {
    dosageForms.push({
      sourceKey,
      datasetVersionKey: version,
      sourceRecordKey: key,
      displayName: formName(key),
      originalSourceText: formName(key),
      externalCode: missing,
    });
  }
  for (const key of ingredientKeys) {
    activeIngredients.push({
      sourceKey,
      datasetVersionKey: version,
      sourceRecordKey: key,
      preferredName: `Syntheticinum ${key}`,
      originalNames: [`Syntheticinum ${key}`],
      dci: missing,
      saltOrForm: missing,
      synonyms: [],
      externalMappings: [
        {
          sourceKey,
          sourceIngredientId: `MAP-${key}`,
          mappingVersion: 'synthetic-1',
          reviewStatus: 'unreviewed',
        },
      ],
      sourceVersion: 'synthetic-1',
    });
  }

  const counts = {
    products: products.length,
    activeIngredients: activeIngredients.length,
    medicationIngredients: medicationIngredients.length,
    atcCodes: 0,
    dosageForms: dosageForms.length,
    manufacturers: 0,
    marketingAuthorizationHolders: 0,
    regulatoryDocuments: 0,
  };

  return {
    format: 'anmdmr-synthetic',
    schemaVersion: options.schemaVersion ?? 'synthetic-raw-1',
    completeness: options.completeness ?? 'full',
    recordCounts: options.recordCounts ?? counts,
    sourceKey,
    synthetic: true,
    dataSource: {
      sourceKey,
      name: 'Synthetic Fictivol catalogue',
      authority: 'Fictional Test Authority',
      jurisdiction: present('fictional'),
      url: 'https://example.invalid/synthetic-fictivol-catalogue',
      licenseOrPermissionReference: present('synthetic-no-rights-granted'),
      rightsStatus: 'unresolved',
      allowedUses: ['automated-test'],
      prohibitedUses: ['retrieval', 'commercial-use'],
      permissionExpiresAt: missing,
      attributionRequirements: present(
        'Synthetic fixture. Not for clinical use.',
      ),
      expectedUpdateCadence: missing,
      importMethod: 'synthetic-inline',
      coverageDescription:
        'Fictional products for tests. Not for clinical use.',
      reviewOwner: 'none',
      reviewedAt: SEEN_INSTANT,
    },
    datasetVersion: {
      dataset: 'synthetic-fictivol-catalogue',
      version,
      upstreamVersion: missing,
      publishedAt: missing,
      upstreamPublishedAt: missing,
      importedAt: SEEN_INSTANT,
      schemaVersion: 'medication-catalogue-1',
      minimumClientVersion: '0.0.0',
      coverage: 'Fictional coverage only. Not for clinical use.',
      rightsApprovalReference: 'synthetic-rights-not-approved',
      clinicalReviewReference: 'synthetic-review-not-conducted',
      previousVersionKey:
        options.previousVersionKey === undefined
          ? missing
          : present(options.previousVersionKey),
      status: 'staging',
    },
    products,
    activeIngredients,
    medicationIngredients,
    atcCodes: [],
    dosageForms,
    manufacturers: [],
    marketingAuthorizationHolders: [],
    regulatoryDocuments: [],
    ...(options.datasetVersionKey === undefined
      ? {}
      : { datasetVersionKey: options.datasetVersionKey }),
  };
}

/** Serialize a synthetic raw document to compact UTF-8 JSON bytes. */
export function rawBytes(document: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(document));
}

/** Canonical importer config for tests, overridable per scenario. */
export function testConfig(
  overrides: Partial<CanonicalImporterConfig> = {},
): CanonicalImporterConfig {
  return {
    sourceKey: SYNTHETIC_SOURCE_KEY,
    sourceVersion: 'synthetic-1',
    schemaVersion: 'synthetic-raw-1',
    importerVersion: 'm5-test',
    parserVersion: 'm5-test',
    parserEncoding: 'utf-8',
    syntheticAllowlist: [SYNTHETIC_SOURCE_KEY],
    largeRemovalCount: 3,
    largeRemovalPercent: 50,
    maxRawBytes: 1_000_000,
    maxRows: 1000,
    ...overrides,
  };
}

const WINDOWS_1250: Readonly<Record<string, number>> = {
  '\u015E': 0xaa, // legacy Ş
  '\u015F': 0xba, // legacy ş
  '\u0162': 0xde, // legacy Ţ
  '\u0163': 0xfe, // legacy ţ
  '\u0102': 0xc3, // Ă
  '\u0103': 0xe3, // ă
  '\u00C2': 0xc2, // Â
  '\u00E2': 0xe2, // â
  '\u00CE': 0xce, // Î
  '\u00EE': 0xee, // î
};

/** Minimal windows-1250 encoder covering the Romanian test alphabet. */
export function encodeWindows1250(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) {
      bytes.push(code);
      continue;
    }
    const mapped = WINDOWS_1250[char];
    if (mapped === undefined) {
      throw new Error('char not representable in windows-1250');
    }
    bytes.push(mapped);
  }
  return new Uint8Array(bytes);
}

/** Synthetic product with one fictional ingredient link. */
export function fictivolProduct(): ProductSpec {
  return {
    sourceProductId: 'SP-FICTIVOL',
    commercialName: 'Fictivol',
    strengthText: '500 mg',
    dosageFormKey: 'DF-TABLET',
    ingredients: [
      {
        key: 'AI-FICTIVOLINUM',
        text: 'Fictivolinum',
        joinKey: 'MI-FICTIVOL',
        value: '500',
        unit: 'mg',
      },
    ],
  };
}

/** Build the fictional Placebex product with one synthetic ingredient link. */
export function placebexProduct(): ProductSpec {
  return {
    sourceProductId: 'SP-PLACEBEX',
    commercialName: 'Placebex',
    strengthText: '20 mg',
    dosageFormKey: 'DF-CAPSULE',
    ingredients: [
      {
        key: 'AI-PLACEBEXIUM',
        text: 'Placebexium',
        joinKey: 'MI-PLACEBEX',
        value: '20',
        unit: 'mg',
      },
    ],
  };
}

/** Build the fictional Vacantol product without optional ingredient or strength fields. */
export function vacantolProduct(): ProductSpec {
  return {
    sourceProductId: 'SP-VACANTOL',
    commercialName: 'Vacantol',
  };
}

/** Same semantic content, different raw bytes (pretty printed). */
export function rawBytesPretty(document: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(document, null, 2));
}

/** Recompute declared counts from the actual entity rows. */
export function withActualCounts(
  document: RawEnvelopeDocument,
): RawEnvelopeDocument {
  return {
    ...document,
    recordCounts: {
      products: document.products.length,
      activeIngredients: document.activeIngredients.length,
      medicationIngredients: document.medicationIngredients.length,
      atcCodes: document.atcCodes.length,
      dosageForms: document.dosageForms.length,
      manufacturers: document.manufacturers.length,
      marketingAuthorizationHolders:
        document.marketingAuthorizationHolders.length,
      regulatoryDocuments: document.regulatoryDocuments.length,
    },
  };
}
