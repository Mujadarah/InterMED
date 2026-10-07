import type {
  DatasetVersionId,
  MedicationProductId,
  ProductTombstone,
} from '@intermed/domain';
import type { Table } from 'dexie';
import Dexie from 'dexie';
import {
  LOCAL_DATASET_SCHEMA_GENERATION_2,
  LOCAL_DATASET_SCHEMA_V1,
  LOCAL_DATASET_SCHEMA_V2_DELTA,
  type DatasetStateRecord,
} from './schema';

/**
 * Migration test tooling.
 *
 * Schema generation 2 is a *test* schema: it adds one index to `favorites` and
 * bumps the meta schema generation. Production code never opens it. It exists
 * so a real v1 database (favorites plus an active generation) can be upgraded
 * in front of the migration tests, and so browser tests can drive a real
 * `versionchange` at an old tab.
 */

export interface ProbeFavorite {
  readonly productId: MedicationProductId;
  readonly createdAt: string;
  readonly lastKnownDisplayName: string;
  readonly lastKnownDatasetVersionId: DatasetVersionId | null;
  readonly status: 'available' | 'removed' | 'unresolved';
}

export interface SchemaUpgradeProbe {
  readonly status: 'upgraded';
  readonly schemaGeneration: number;
  readonly favorites: readonly ProbeFavorite[];
  readonly tombstones: readonly string[];
  readonly activeGenerationId: string | null;
  readonly previousGenerationId: string | null;
  close(): void;
}

class TestSchemaDatabase extends Dexie {
  declare favorites: Table<ProbeFavorite, string>;
  declare tombstones: Table<ProductTombstone, string>;
  declare meta: Table<DatasetStateRecord, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({ ...LOCAL_DATASET_SCHEMA_V1 });
    this.version(2)
      .stores({ ...LOCAL_DATASET_SCHEMA_V2_DELTA })
      .upgrade(async (transaction) => {
        const meta = transaction.table<DatasetStateRecord, string>('meta');
        const record = await meta.get('dataset-state');
        if (record)
          await meta.put({
            ...record,
            schemaGeneration: LOCAL_DATASET_SCHEMA_GENERATION_2,
          });
      });
  }
}

/**
 * Open the same database with the test schema generation 2, migrating it when
 * it is still on generation 1. Returns the preference and pointer state after
 * the upgrade so callers can prove that migrations preserve them.
 */
export async function openSchemaUpgradeProbe(
  name: string,
): Promise<SchemaUpgradeProbe> {
  const db = new TestSchemaDatabase(name);
  await db.open();
  const favorites = (await db.favorites.toArray()).map((row) => ({
    productId: row.productId,
    createdAt: row.createdAt,
    lastKnownDisplayName: row.lastKnownDisplayName,
    lastKnownDatasetVersionId: row.lastKnownDatasetVersionId,
    status: row.status,
  }));
  const tombstones = (await db.tombstones.toArray()).map(
    (row) => row.productId as string,
  );
  const record = await db.meta.get('dataset-state');
  return {
    status: 'upgraded',
    schemaGeneration:
      record?.schemaGeneration ?? LOCAL_DATASET_SCHEMA_GENERATION_2,
    favorites,
    tombstones,
    activeGenerationId: record?.activeGenerationId ?? null,
    previousGenerationId: record?.previousGenerationId ?? null,
    close: () => {
      db.close();
    },
  };
}
