import type {
  ActiveIngredient,
  ATCCode,
  DataSource,
  DatasetRecordCounts,
  DatasetVersion,
  DosageForm,
  FavoriteEntry,
  LocalDatasetGeneration,
  Manufacturer,
  MarketingAuthorizationHolder,
  MedicationIngredient,
  MedicationProduct,
  ProductStatus,
  ProductTombstone,
  RecentSearchEntry,
  RegulatoryDocument,
} from '@intermed/domain';
import Dexie, { type Table, type Transaction } from 'dexie';

/**
 * Physical schema for the local dataset store.
 *
 * The schema generation is versioned independently from content datasets and
 * application releases (R76). Every future schema change must raise
 * {@link LOCAL_DATASET_SCHEMA_GENERATION} and add its own Dexie `version()`;
 * a database carrying a larger generation is refused as `unsupported-schema`
 * with all data left untouched.
 */

/** Database name used by the browser composition root. */
export const LOCAL_DATASET_DB_NAME = 'intermed-local';

/** Logical schema generation written to the meta record at first open. */
export const LOCAL_DATASET_SCHEMA_GENERATION = 1;

/** Web Locks name enforcing a single dataset writer across tabs. */
export const WRITER_LOCK_NAME = 'intermed-dataset-update';

/** BroadcastChannel name used to notify other tabs of an activation. */
export const DATASET_EVENTS_CHANNEL = 'intermed-dataset-events';

/** Envelope for one immutable catalogue row of one generation. */
export interface EntityRow<T> {
  readonly generationId: string;
  readonly id: string;
  readonly entity: T;
}

export type ProductRow = EntityRow<MedicationProduct> & {
  readonly nameFolded: string;
  readonly dciFolded: string;
  readonly status: ProductStatus;
  /** `${generationId}${UNIT}${atcId}` values for the multi-entry ATC index. */
  readonly atcKeys: readonly string[];
};

export type IngredientRow = EntityRow<ActiveIngredient> & {
  readonly nameFolded: string;
  readonly dciFolded: string;
};

export type ProductIngredientRow = EntityRow<MedicationIngredient> & {
  readonly productId: string;
  readonly ingredientIdValue: string | null;
};

export type AtcRow = EntityRow<ATCCode> & { readonly code: string };

export type DosageFormRow = EntityRow<DosageForm> & {
  readonly nameFolded: string;
};

export type ManufacturerRow = EntityRow<Manufacturer> & {
  readonly nameFolded: string;
};

export type HolderRow = EntityRow<MarketingAuthorizationHolder> & {
  readonly nameFolded: string;
};

export type DocumentRow = EntityRow<RegulatoryDocument> & {
  readonly productId: string;
  readonly type: string;
};

export type SourceRow = EntityRow<DataSource>;

export type DatasetVersionRow = EntityRow<DatasetVersion>;

/** Lifecycle of one local generation row. Staged rows are never readable. */
export interface GenerationRecord {
  readonly generationId: string;
  readonly dataset: string;
  readonly version: string;
  readonly schemaVersion: string;
  readonly sourceIds: readonly string[];
  readonly publishedAt: string | null;
  readonly importedAt: string;
  readonly downloadedAt: string;
  readonly checksum: string;
  readonly coverage: string;
  readonly recordCounts: Readonly<Record<string, number>>;
  readonly synthetic: boolean;
  /**
   * Lifecycle of one local generation row.
   *
   * `staging` records are incomplete: their catalogue rows may be half
   * written and they are never readable or activatable. `staged` records are
   * complete and verified against their published counts, ready for
   * activation; `ready` records have been active at least once.
   */
  readonly status: 'staging' | 'staged' | 'ready';
  readonly stagedAt: string;
  /** First time this generation became readable after staging. Never moves. */
  readonly readyAt: string | null;
  /**
   * Retention anchor: the last time this generation was activated, either
   * directly or by a rollback. `collect()` measures its cross-tab retention
   * window from here, so re-activating a generation restarts that window.
   * `readyAt` deliberately keeps the original staging-to-ready time for
   * diagnostics (Codex review fix #3).
   */
  readonly lastUsedAt: string | null;
}

/** Persisted slice of DATA_MODEL's LocalDatasetState. */
export interface DatasetStateRecord {
  readonly key: 'dataset-state';
  readonly schemaGeneration: number;
  readonly activeGenerationId: string | null;
  readonly previousGenerationId: string | null;
  readonly lastSuccessfulCheckAt: string | null;
  readonly updateStatus: string;
  readonly failureReason: string | null;
  /**
   * Generation the local favorites were last reconciled against. When it
   * differs from `activeGenerationId`, a crash interrupted the post-commit
   * reconciliation and the next open runs it again.
   */
  readonly reconciledGenerationId: string | null;
  /**
   * Bumped by every completed clear-all. An update captures it when it starts
   * and stops quietly when it changed: a completed clear can never be undone
   * by work that was already in flight (Greptile review fix G4).
   */
  readonly clearEpoch: number;
}

/** Cross-tab writer marker used when the Web Locks API is unavailable. */
export interface WriterLockRecord {
  readonly key: 'writer-lock';
  readonly owner: string;
  readonly expiresAt: number;
}

/**
 * Dexie schema version 1.
 *
 * Catalogue stores are keyed by `[generationId+id]` so a staged generation can
 * be written, read and deleted without ever touching another generation. The
 * preference stores (favorites, recent searches, tombstones) deliberately have
 * no generation component: they survive catalogue replacement and migrations.
 */
export const LOCAL_DATASET_SCHEMA_V1: Readonly<Record<string, string>> = {
  generations: 'generationId, status, readyAt',
  products:
    '&[generationId+id], generationId, [generationId+nameFolded], [generationId+dciFolded], [generationId+status], *atcKeys',
  ingredients:
    '&[generationId+id], generationId, [generationId+nameFolded], [generationId+dciFolded]',
  productIngredients:
    '&[generationId+id], generationId, [generationId+productId], [generationId+ingredientIdValue]',
  atcCodes: '&[generationId+id], generationId, [generationId+code]',
  dosageForms: '&[generationId+id], generationId, [generationId+nameFolded]',
  manufacturers: '&[generationId+id], generationId, [generationId+nameFolded]',
  holders: '&[generationId+id], generationId, [generationId+nameFolded]',
  documents:
    '&[generationId+id], generationId, [generationId+productId], [generationId+type]',
  sources: '&[generationId+id], generationId',
  datasetVersions: '&[generationId+id], generationId',
  meta: 'key',
  writerLock: 'key',
  favorites: 'productId, status',
  recentSearches: 'id, occurredAt',
  tombstones: 'productId, removedAt',
};

/**
 * Test-only schema generation 2 used to prove migrations: it adds one index to
 * `favorites` and bumps the meta schema generation. Production code never opens
 * it; it exists so a v1 database can be upgraded in front of the tests.
 */
export const LOCAL_DATASET_SCHEMA_V2_DELTA: Readonly<Record<string, string>> = {
  favorites: 'productId, status, createdAt',
};

export const LOCAL_DATASET_SCHEMA_GENERATION_2 = 2;

/** Composite key parts of every `[generationId+id]` catalogue store. */
export type RowKey = [string, string];

/** The shared row envelope of every catalogue table. */
export type AnyCatalogueTable = Table<
  { generationId: string; id: string },
  RowKey
>;

/** One catalogue table of a database, by store name. */
export function catalogueTable(
  database: LocalDatasetDatabase,
  name: CatalogueStoreName,
): AnyCatalogueTable {
  // Every catalogue table carries the same row envelope, so staging and
  // deletion can iterate store names without repeating per-store code.
  return database[name] as unknown as AnyCatalogueTable;
}

/** The same table, bound to one open transaction instead of the ambient one. */
export function scopedCatalogueTable(
  transaction: Transaction,
  name: CatalogueStoreName,
): AnyCatalogueTable {
  return transaction.table(name) as unknown as AnyCatalogueTable;
}

/** Every catalogue table, for transactions that span a whole generation. */
export function catalogueTables(
  database: LocalDatasetDatabase,
): readonly AnyCatalogueTable[] {
  return CATALOGUE_STORE_NAMES.map((name) => catalogueTable(database, name));
}

/** The public projection of one stored generation. */
export function toLocalGeneration(
  record: GenerationRecord,
): LocalDatasetGeneration {
  return {
    generationId: record.generationId,
    dataset: record.dataset,
    version: record.version,
    schemaVersion: record.schemaVersion,
    sourceIds: record.sourceIds,
    publishedAt: record.publishedAt,
    importedAt: record.importedAt,
    downloadedAt: record.downloadedAt,
    checksum: record.checksum,
    coverage: record.coverage,
    recordCounts: record.recordCounts,
    synthetic: record.synthetic,
  };
}

/** The persisted state record a fresh database starts from. */
export function emptyMeta(): DatasetStateRecord {
  return {
    key: 'dataset-state',
    schemaGeneration: LOCAL_DATASET_SCHEMA_GENERATION,
    activeGenerationId: null,
    previousGenerationId: null,
    lastSuccessfulCheckAt: null,
    updateStatus: 'never-downloaded',
    failureReason: null,
    reconciledGenerationId: null,
    clearEpoch: 0,
  };
}

/** The Dexie database of the local dataset store. */
export class LocalDatasetDatabase extends Dexie {
  declare generations: Table<GenerationRecord, string>;
  declare products: Table<ProductRow, RowKey>;
  declare ingredients: Table<IngredientRow, RowKey>;
  declare productIngredients: Table<ProductIngredientRow, RowKey>;
  declare atcCodes: Table<AtcRow, RowKey>;
  declare dosageForms: Table<DosageFormRow, RowKey>;
  declare manufacturers: Table<ManufacturerRow, RowKey>;
  declare holders: Table<HolderRow, RowKey>;
  declare documents: Table<DocumentRow, RowKey>;
  declare sources: Table<SourceRow, RowKey>;
  declare datasetVersions: Table<DatasetVersionRow, RowKey>;
  declare meta: Table<DatasetStateRecord, string>;
  declare writerLock: Table<WriterLockRecord, string>;
  declare favorites: Table<FavoriteEntry, string>;
  declare recentSearches: Table<RecentSearchEntry, string>;
  declare tombstones: Table<ProductTombstone, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({ ...LOCAL_DATASET_SCHEMA_V1 });
  }
}

/** Union of the per-generation catalogue row types, keyed by store name. */
export interface CatalogueRows {
  readonly products: readonly ProductRow[];
  readonly ingredients: readonly IngredientRow[];
  readonly productIngredients: readonly ProductIngredientRow[];
  readonly atcCodes: readonly AtcRow[];
  readonly dosageForms: readonly DosageFormRow[];
  readonly manufacturers: readonly ManufacturerRow[];
  readonly holders: readonly HolderRow[];
  readonly documents: readonly DocumentRow[];
  readonly sources: readonly SourceRow[];
  readonly datasetVersions: readonly DatasetVersionRow[];
}

export type CatalogueStoreName = keyof CatalogueRows;

/** Store names in the order they are staged. */
export const CATALOGUE_STORE_NAMES: readonly CatalogueStoreName[] = [
  'datasetVersions',
  'sources',
  'dosageForms',
  'manufacturers',
  'holders',
  'atcCodes',
  'ingredients',
  'products',
  'productIngredients',
  'documents',
];

/** Count keys of a published manifest mapped onto their snapshot collection. */
export const RECORD_COUNT_COLLECTIONS: Readonly<
  Record<keyof DatasetRecordCounts, keyof CatalogueRows>
> = {
  dataSources: 'sources',
  datasetVersions: 'datasetVersions',
  products: 'products',
  activeIngredients: 'ingredients',
  medicationIngredients: 'productIngredients',
  atcCodes: 'atcCodes',
  dosageForms: 'dosageForms',
  manufacturers: 'manufacturers',
  marketingAuthorizationHolders: 'holders',
  regulatoryDocuments: 'documents',
};
