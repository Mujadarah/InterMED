import {
  MEDICATION_CATALOGUE_SCHEMA_VERSION,
  MISSING,
  deriveStableId,
  fingerprint,
  presentField,
  sealCatalogue,
  serializeCatalogue,
  type ActiveIngredient,
  type ATCCode,
  type DataSource,
  type DatasetRecordCounts,
  type DatasetVersion,
  type DatasetVersionId,
  type DosageForm,
  type EntityKind,
  type IdByKind,
  type Manufacturer,
  type MarketingAuthorizationHolder,
  type MedicationCatalogueSnapshot,
  type MedicationIngredient,
  type MedicationProductId,
  type MedicationProduct,
  type PublishedBundleDescriptor,
  type PublishedDatasetManifest,
  type RegulatoryDocument,
} from '@intermed/domain';

/**
 * Synthetic bundle builder for the local dataset store.
 *
 * Everything it produces is fictional development data ("Fictivol",
 * "Placebex", "Synthetica", "Placebo Holding") carrying no clinical fact. It
 * is test/development tooling: the browser test harness uses it to stage
 * generations without any network access, and the Vitest suites use it for
 * every update scenario.
 *
 * Product ids derive from the stable source record key and therefore survive
 * generation changes; display names carry the generation label so tests can
 * tell two generations apart and observe renames.
 */

/** Stable data-source key of the synthetic fixture material. */
export const SYNTHETIC_SOURCE_KEY = 'source.synthetic';

/** Namespace used when deriving the synthetic DataSource id. */
const SYNTHETIC_SOURCE_NAMESPACE = 'intermed';

/** Dataset key used by synthetic bundles. */
export const SYNTHETIC_DATASET = 'synthetic-medication-catalogue';

/** Explicit UTC instant format required by domain integrity checks. */
const INSTANT = '2026-01-01T00:00:00Z';

const EMPTY_COUNTS: DatasetRecordCounts = {
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
};

export interface SyntheticIngredientSpec {
  readonly key: string;
  readonly name: string;
}

export interface SyntheticProductSpec {
  /** Stable source record key. The derived product id never changes. */
  readonly key: string;
  /** Base commercial name; the generation label is appended. */
  readonly name: string;
  /** Ingredient keys linked to this product. Defaults to one ingredient. */
  readonly ingredientKeys?: readonly string[];
}

export interface SyntheticBundleOptions {
  /** Generation label. It distinguishes generations, never identity. */
  readonly label: string;
  readonly dataset?: string;
  readonly products?: readonly SyntheticProductSpec[];
  readonly ingredients?: readonly SyntheticIngredientSpec[];
}

export interface SyntheticBundle {
  readonly manifest: PublishedDatasetManifest;
  readonly descriptor: PublishedBundleDescriptor;
  readonly text: string;
  readonly dataset: string;
  /** Generation id, equal to the published dataset version id. */
  readonly generationId: DatasetVersionId;
  /** Product source record key to stable product id. */
  readonly productIds: Readonly<Record<string, MedicationProductId>>;
}

/** Two fictional products: one single-ingredient, one three-ingredient. */
export const SYNTHETIC_DEFAULT_PRODUCTS: readonly SyntheticProductSpec[] = [
  {
    key: 'SP-FICTIVOL',
    name: 'Fictivol',
    ingredientKeys: ['AI-FICTIVOLINUM'],
  },
  {
    key: 'SP-PLACEBEX',
    name: 'Placebex',
    ingredientKeys: ['AI-PLACEBEXIUM', 'AI-SYNTHETINUM', 'AI-FICTOVOL'],
  },
];

/** Fictional ingredients for the default products. */
export const SYNTHETIC_DEFAULT_INGREDIENTS: readonly SyntheticIngredientSpec[] =
  [
    { key: 'AI-FICTIVOLINUM', name: 'Fictivolinum' },
    { key: 'AI-PLACEBEXIUM', name: 'Placebexium' },
    { key: 'AI-SYNTHETINUM', name: 'Synthetinum' },
    { key: 'AI-FICTOVOL', name: 'Fictovolol' },
  ];

function mustId<K extends EntityKind>(
  kind: K,
  sourceId: string,
  sourceRecordKey: string,
): IdByKind[K] {
  const result = deriveStableId(kind, sourceId, sourceRecordKey);
  if (!result.ok) throw new Error(`Synthetic ${kind} id was rejected`);
  return result.id;
}

/** UTF-8 byte length of a bundle text, as reported by a publisher's byteSize. */
export function bundleByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Build one sealed, serialized synthetic catalogue bundle and its manifest.
 * The bundle passes domain deserialization, referential integrity and the
 * update pipeline's checksum, identity and count checks.
 */
export function buildSyntheticCatalogueBundle(
  options: SyntheticBundleOptions,
): SyntheticBundle {
  const dataset = options.dataset ?? SYNTHETIC_DATASET;
  const { label } = options;
  const products = options.products ?? SYNTHETIC_DEFAULT_PRODUCTS;
  const ingredients = options.ingredients ?? SYNTHETIC_DEFAULT_INGREDIENTS;
  const sourceId = mustId(
    'DataSource',
    SYNTHETIC_SOURCE_NAMESPACE,
    SYNTHETIC_SOURCE_KEY,
  );
  const datasetVersionId = mustId(
    'DatasetVersion',
    SYNTHETIC_SOURCE_KEY,
    `synthetic-${label}`,
  );

  const dataSource: DataSource = {
    id: sourceId,
    sourceKey: SYNTHETIC_SOURCE_KEY,
    name: 'Synthetic development catalogue',
    authority: 'Fictional Test Authority',
    jurisdiction: presentField('fictional'),
    url: 'https://example.invalid/intermed/synthetic-medication-catalogue',
    licenseOrPermissionReference: presentField('synthetic-no-rights-granted'),
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
    permissionExpiresAt: MISSING,
    attributionRequirements: presentField(
      'Synthetic development data. Not for clinical use.',
    ),
    expectedUpdateCadence: MISSING,
    importMethod: 'synthetic-inline',
    coverageDescription:
      'Fictional products for automated tests. Not for clinical use.',
    reviewOwner: 'none',
    reviewedAt: INSTANT,
  };

  const datasetVersion: DatasetVersion = {
    id: datasetVersionId,
    dataset,
    sourceIds: [sourceId],
    upstreamVersion: MISSING,
    version: `synthetic-${label}`,
    publishedAt: presentField(INSTANT),
    upstreamPublishedAt: MISSING,
    importedAt: INSTANT,
    checksum: '',
    schemaVersion: MEDICATION_CATALOGUE_SCHEMA_VERSION,
    minimumClientVersion: '0.0.0',
    recordCounts: EMPTY_COUNTS,
    coverage: 'Synthetic development fixture. Not for clinical use.',
    rightsApprovalReference: 'not-approved',
    clinicalReviewReference: 'not-reviewed',
    previousVersionId: MISSING,
    status: 'published',
  };

  const dosageForm: DosageForm = {
    id: mustId('DosageForm', SYNTHETIC_SOURCE_KEY, 'DF-TABLET'),
    displayName: `fictional tablet ${label}`,
    originalSourceText: `fictional tablet ${label}`,
    externalCode: MISSING,
    sourceId: dataSource.id,
    datasetVersionId: datasetVersion.id,
    sourceRecordKey: 'DF-TABLET',
  };

  const manufacturer: Manufacturer = {
    id: mustId('Manufacturer', SYNTHETIC_SOURCE_KEY, 'MF-SYNTHETICA'),
    name: 'Synthetica Laboratories',
    country: MISSING,
    sourceId: dataSource.id,
    sourceEntityId: MISSING,
    datasetVersionId: datasetVersion.id,
    sourceRecordKey: 'MF-SYNTHETICA',
  };

  const holder: MarketingAuthorizationHolder = {
    id: mustId(
      'MarketingAuthorizationHolder',
      SYNTHETIC_SOURCE_KEY,
      'MAH-PLACEBO',
    ),
    name: 'Placebo Holding',
    country: MISSING,
    sourceId: dataSource.id,
    sourceEntityId: MISSING,
    datasetVersionId: datasetVersion.id,
    sourceRecordKey: 'MAH-PLACEBO',
  };

  const ingredientRows: ActiveIngredient[] = ingredients.map((spec) => ({
    id: mustId('ActiveIngredient', SYNTHETIC_SOURCE_KEY, spec.key),
    preferredName: `${spec.name} ${label}`,
    originalNames: [`${spec.name} ${label}`],
    dci: presentField(`${spec.name} ${label}`),
    saltOrForm: MISSING,
    synonyms: [],
    externalMappings: [
      {
        sourceId: dataSource.id,
        sourceIngredientId: `MAP-${spec.key}`,
        mappingVersion: 'synthetic-1',
        reviewStatus: 'unreviewed',
      },
    ],
    sourceId: dataSource.id,
    sourceVersion: 'synthetic-1',
    datasetVersionId: datasetVersion.id,
    sourceRecordKey: spec.key,
  }));
  const ingredientByKey = new Map(
    ingredientRows.map((row) => [row.sourceRecordKey, row]),
  );

  const productRows: MedicationProduct[] = [];
  const joinRows: MedicationIngredient[] = [];
  const atcRows: ATCCode[] = [];
  const documentRows: RegulatoryDocument[] = [];
  const productIds: Record<string, MedicationProductId> = {};

  for (const spec of products) {
    const productId = mustId(
      'MedicationProduct',
      SYNTHETIC_SOURCE_KEY,
      spec.key,
    );
    productIds[spec.key] = productId;
    const atcId = mustId('AtcCode', SYNTHETIC_SOURCE_KEY, `ATC-${spec.key}`);
    const documentId = mustId(
      'RegulatoryDocument',
      SYNTHETIC_SOURCE_KEY,
      `RD-${spec.key}`,
    );
    atcRows.push({
      id: atcId,
      code: `SYN-${spec.key}`,
      codeSystem: 'synthetic-illustrative',
      illustrative: true,
      displayName: presentField(`Synthetic illustrative class ${label}`),
      classificationVersion: MISSING,
      sourceId: dataSource.id,
      datasetVersionId: datasetVersion.id,
      sourceRecordKey: `ATC-${spec.key}`,
    });
    documentRows.push({
      id: documentId,
      productId,
      type: 'other',
      title: presentField(`Fictional ${spec.name} note`),
      url: 'https://example.invalid/intermed/synthetic-document',
      language: presentField('ro'),
      documentVersion: MISSING,
      publishedAt: MISSING,
      retrievedAt: MISSING,
      lastCheckedAt: INSTANT,
      sourceId: dataSource.id,
      sourceVersion: 'synthetic-1',
      datasetVersionId: datasetVersion.id,
      cachedContentReference: MISSING,
      cacheRightsStatus: 'not-assessed',
      checksum: MISSING,
      sourceRecordKey: `RD-${spec.key}`,
    });
    productRows.push({
      id: productId,
      sourceId: dataSource.id,
      sourceProductId: spec.key,
      cim: MISSING,
      commercialName: `${spec.name} ${label}`,
      originalDciText: MISSING,
      strengthText: presentField('500 mg'),
      dosageFormId: presentField(dosageForm.id),
      route: presentField('oral-fictional'),
      atcCodeIds: [atcId],
      manufacturerIds: [manufacturer.id],
      marketingAuthorizationHolderId: presentField(holder.id),
      authorizationNumber: presentField(`AUTH-SYN-${spec.key}`),
      authorizationDate: MISSING,
      authorizationStatus: MISSING,
      presentationOrPackDescription: MISSING,
      regulatoryDocumentIds: [documentId],
      sourceVersion: 'synthetic-1',
      datasetVersionId: datasetVersion.id,
      firstSeenAt: INSTANT,
      lastSeenAt: INSTANT,
      status: 'active',
    });
    const ingredientKeys = spec.ingredientKeys ?? [];
    for (const ingredientKey of ingredientKeys) {
      const ingredient = ingredientByKey.get(ingredientKey);
      if (!ingredient)
        throw new Error(`Synthetic ingredient ${ingredientKey} is not defined`);
      joinRows.push({
        id: mustId(
          'MedicationIngredient',
          SYNTHETIC_SOURCE_KEY,
          `${spec.key}+${ingredientKey}`,
        ),
        productId,
        ingredientId: presentField(ingredient.id),
        sourceIngredientText: ingredient.preferredName,
        strengthValue: presentField('500'),
        strengthValueNormalized: presentField('500'),
        strengthUnit: { status: 'present', sourceText: 'mg' },
        denominatorValue: MISSING,
        denominatorValueNormalized: MISSING,
        denominatorUnit: MISSING,
        strengthOriginalText: presentField('500 mg'),
        mappingStatus: 'confirmed',
        mappingVersion: 'synthetic-1',
        sourceId: dataSource.id,
        datasetVersionId: datasetVersion.id,
        sourceRecordKey: `${spec.key}+${ingredientKey}`,
      });
    }
  }

  const snapshot: MedicationCatalogueSnapshot = {
    dataSources: [dataSource],
    datasetVersions: [datasetVersion],
    products: productRows,
    activeIngredients: ingredientRows,
    medicationIngredients: joinRows,
    atcCodes: atcRows,
    dosageForms: [dosageForm],
    manufacturers: [manufacturer],
    marketingAuthorizationHolders: [holder],
    regulatoryDocuments: documentRows,
  };
  const sealed = sealCatalogue(snapshot);
  const text = serializeCatalogue(sealed);
  const version = sealed.datasetVersions[0];
  if (!version) throw new Error('Synthetic bundle has no dataset version');
  const manifest: PublishedDatasetManifest = {
    dataset,
    datasetVersionId: version.id,
    version: version.version,
    sourceIds: version.sourceIds,
    upstreamVersion: `SYNTHETIC-UPSTREAM-${label.toUpperCase()}`,
    upstreamPublishedAt: null,
    publishedAt: INSTANT,
    importedAt: version.importedAt,
    checksum: fingerprint(text),
    schemaVersion: version.schemaVersion,
    minimumClientVersion: version.minimumClientVersion,
    recordCounts: Object.fromEntries(Object.entries(version.recordCounts)),
    coverage: version.coverage,
    rightsApprovalReference: version.rightsApprovalReference,
    clinicalReviewReference: version.clinicalReviewReference,
    previousVersionId: null,
  };
  const descriptor: PublishedBundleDescriptor = {
    id: `synthetic-bundle-${label}`,
    datasetVersionId: version.id,
    fileName: `synthetic-bundle-${label}.json`,
    contentType: 'application/json',
    byteSize: bundleByteLength(text),
    checksum: manifest.checksum,
    url: `https://fixtures.invalid/synthetic-bundle-${label}.json`,
  };
  return {
    manifest,
    descriptor,
    text,
    dataset,
    generationId: version.id,
    productIds,
  };
}
