/**
 * Retention and readers: in-tab pins, the cross-tab retention window, the
 * completeness check a generation must pass before it is trusted, and the
 * deletion of one generation's rows (Greptile review fixes G2, G3, G7).
 */
import type {
  GenerationReader,
  MedicationProductDetail,
  MedicationSearchRecord,
} from '@intermed/domain';
import Dexie, { type Transaction } from 'dexie';
import { foldForIndex } from './fold';
import type { MaintenanceTask } from './maintenance';
import type { DatasetWriterLock } from './locks';
import { atcKey } from './rows';
import {
  CATALOGUE_STORE_NAMES,
  catalogueTable,
  catalogueTables,
  scopedCatalogueTable,
  RECORD_COUNT_COLLECTIONS,
  toLocalGeneration,
  type AnyCatalogueTable,
  type CatalogueStoreName,
  type GenerationRecord,
  type LocalDatasetDatabase,
} from './schema';

/** Everything retention needs from the rest of the store. */
export interface RetentionDeps {
  readonly now: () => number;
  /** Cross-tab retention window for ready generations. */
  readonly retainReadyForMs: number;
  /** Grace period before an abandoned staged generation is collected. */
  readonly staleStagingMs: number;
  readonly database: () => LocalDatasetDatabase | null;
  readonly requireDatabase: () => LocalDatasetDatabase;
  /** Diagnostics/test seam invoked at the start of a collection run. */
  readonly onMaintenance?:
    ((task: MaintenanceTask) => void | Promise<void>) | undefined;
  /** Run fire-and-forget work whose failure becomes a diagnostic. */
  readonly background: (label: string, work: () => Promise<unknown>) => void;
  /** The writer lease, or null when the store cannot write. */
  readonly writerLock: () => DatasetWriterLock | null;
}

export interface Retention {
  createReader(record: GenerationRecord): GenerationReader;
  pinnedReader(record: GenerationRecord): Promise<GenerationReader>;
  openPinned(generationId: string): Promise<GenerationReader | null>;
  countsMatch(
    record: GenerationRecord,
    table: (name: CatalogueStoreName) => AnyCatalogueTable,
  ): Promise<boolean>;
  deleteGenerationRows(generationId: string): Promise<void>;
  deleteGenerationRowsIn(
    transaction: Transaction,
    generationId: string,
  ): Promise<void>;
  collectGenerations(): Promise<readonly string[]>;
  collectUnderLock(): Promise<readonly string[]>;
  cleanupIncompleteStaging(): Promise<void>;
}

export function createRetention(deps: RetentionDeps): Retention {
  const pins = new Map<string, number>();

  function addPin(generationId: string): void {
    pins.set(generationId, (pins.get(generationId) ?? 0) + 1);
  }

  function removePin(generationId: string): void {
    const count = (pins.get(generationId) ?? 0) - 1;
    if (count > 0) pins.set(generationId, count);
    else pins.delete(generationId);
  }

  function createReader(record: GenerationRecord): GenerationReader {
    const generationId = record.generationId;
    const generation = toLocalGeneration(record);
    addPin(generationId);
    let released = false;
    return {
      generationId,
      generation,
      product: async (id) =>
        (await deps.requireDatabase().products.get([generationId, id]))
          ?.entity ?? null,
      ingredient: async (id) =>
        (await deps.requireDatabase().ingredients.get([generationId, id]))
          ?.entity ?? null,
      productIngredients: async (productId) => {
        const rows = await deps
          .requireDatabase()
          .productIngredients.where('[generationId+productId]')
          .equals([generationId, productId])
          .toArray();
        return rows.map((row) => row.entity);
      },
      productDetail: async (
        productId,
      ): Promise<MedicationProductDetail | null> => {
        const db = deps.requireDatabase();
        const productRow = await db.products.get([generationId, productId]);
        if (!productRow) return null;
        const product = productRow.entity;
        const [
          ingredientRows,
          atcRows,
          dosageFormRow,
          manufacturerRows,
          holderRow,
          documentRows,
          sourceRow,
          datasetVersionRow,
        ] = await Promise.all([
          db.productIngredients
            .where('[generationId+productId]')
            .equals([generationId, productId])
            .toArray(),
          Promise.all(
            product.atcCodeIds.map((id) => db.atcCodes.get([generationId, id])),
          ),
          product.dosageFormId.status === 'present'
            ? db.dosageForms.get([generationId, product.dosageFormId.value])
            : Promise.resolve(undefined),
          Promise.all(
            product.manufacturerIds.map((id) =>
              db.manufacturers.get([generationId, id]),
            ),
          ),
          product.marketingAuthorizationHolderId.status === 'present'
            ? db.holders.get([
                generationId,
                product.marketingAuthorizationHolderId.value,
              ])
            : Promise.resolve(undefined),
          Promise.all(
            product.regulatoryDocumentIds.map((id) =>
              db.documents.get([generationId, id]),
            ),
          ),
          db.sources.get([generationId, product.sourceId]),
          db.datasetVersions.get([generationId, product.datasetVersionId]),
        ]);
        const ingredients = await Promise.all(
          ingredientRows.map(async (row) => {
            const medicationIngredient = row.entity;
            const activeIngredient =
              medicationIngredient.ingredientId.status === 'present'
                ? ((
                    await db.ingredients.get([
                      generationId,
                      medicationIngredient.ingredientId.value,
                    ])
                  )?.entity ?? null)
                : null;
            return { medicationIngredient, activeIngredient };
          }),
        );

        return {
          generation,
          product,
          ingredients,
          dosageForm: dosageFormRow?.entity ?? null,
          atcCodes: atcRows.flatMap((row) => (row ? [row.entity] : [])),
          manufacturers: manufacturerRows.flatMap((row) =>
            row ? [row.entity] : [],
          ),
          marketingAuthorizationHolder: holderRow?.entity ?? null,
          regulatoryDocuments: documentRows.flatMap((row) =>
            row ? [row.entity] : [],
          ),
          dataSource: sourceRow?.entity ?? null,
          datasetVersion: datasetVersionRow?.entity ?? null,
        };
      },
      productsByNamePrefix: async (prefix) => {
        const folded = foldForIndex(prefix);
        const rows = await deps
          .requireDatabase()
          .products.where('[generationId+nameFolded]')
          .between(
            [generationId, folded],
            [generationId, `${folded}\uffff`],
            true,
            true,
          )
          .toArray();
        return rows.map((row) => row.entity);
      },
      ingredientsByDciPrefix: async (prefix) => {
        const folded = foldForIndex(prefix);
        const rows = await deps
          .requireDatabase()
          .ingredients.where('[generationId+dciFolded]')
          .between(
            [generationId, folded],
            [generationId, `${folded}\uffff`],
            true,
            true,
          )
          .toArray();
        return rows.map((row) => row.entity);
      },
      productsByAtcCode: async (code) => {
        const db = deps.requireDatabase();
        const atcRows = await db.atcCodes
          .where('[generationId+code]')
          .equals([generationId, code])
          .toArray();
        const products = [];
        for (const atc of atcRows) {
          const rows = await db.products
            .where('atcKeys')
            .equals(atcKey(generationId, atc.id))
            .toArray();
          for (const row of rows) products.push(row.entity);
        }
        return products;
      },
      productIds: async () => {
        const rows = await deps
          .requireDatabase()
          .products.where('generationId')
          .equals(generationId)
          .toArray();
        return rows.map((row) => row.entity.id).sort();
      },
      searchRecords: async () => {
        const db = deps.requireDatabase();
        const [
          products,
          ingredients,
          links,
          atcCodes,
          dosageForms,
          manufacturers,
        ] = await Promise.all([
          db.products.where('generationId').equals(generationId).toArray(),
          db.ingredients.where('generationId').equals(generationId).toArray(),
          db.productIngredients
            .where('generationId')
            .equals(generationId)
            .toArray(),
          db.atcCodes.where('generationId').equals(generationId).toArray(),
          db.dosageForms.where('generationId').equals(generationId).toArray(),
          db.manufacturers.where('generationId').equals(generationId).toArray(),
        ]);
        const ingredientById = new Map(
          ingredients.map((row) => [row.id, row.entity]),
        );
        const linksByProduct = new Map<string, typeof links>();
        for (const link of links) {
          const productLinks = linksByProduct.get(link.productId);
          if (productLinks) productLinks.push(link);
          else linksByProduct.set(link.productId, [link]);
        }
        const atcById = new Map(
          atcCodes.map((row) => [row.id, row.entity.code]),
        );
        const dosageFormById = new Map(
          dosageForms.map((row) => [row.id, row.entity.displayName]),
        );
        const manufacturerById = new Map(
          manufacturers.map((row) => [row.id, row.entity.name]),
        );

        const documents: MedicationSearchRecord[] = products.map((row) => {
          const product = row.entity;
          const ingredientNames = new Set<string>();
          if (product.originalDciText.status === 'present')
            ingredientNames.add(product.originalDciText.value);
          for (const link of linksByProduct.get(product.id) ?? []) {
            if (link.entity.sourceIngredientText.trim())
              ingredientNames.add(link.entity.sourceIngredientText);
            if (link.entity.ingredientId.status !== 'present') continue;
            const ingredient = ingredientById.get(
              link.entity.ingredientId.value,
            );
            if (!ingredient) continue;
            ingredientNames.add(ingredient.preferredName);
            if (ingredient.dci.status === 'present')
              ingredientNames.add(ingredient.dci.value);
          }

          return {
            product,
            ingredientNames: [...ingredientNames],
            atcCodes: product.atcCodeIds.flatMap((id) => {
              const code = atcById.get(id);
              return code === undefined ? [] : [code];
            }),
            dosageFormName:
              product.dosageFormId.status === 'present'
                ? (dosageFormById.get(product.dosageFormId.value) ?? null)
                : null,
            manufacturerNames: product.manufacturerIds.flatMap((id) => {
              const name = manufacturerById.get(id);
              return name === undefined ? [] : [name];
            }),
          };
        });
        return documents;
      },
      release: () => {
        if (released) return;
        released = true;
        removePin(generationId);
      },
    };
  }

  async function pinnedReader(
    record: GenerationRecord,
  ): Promise<GenerationReader> {
    // Pin before anything else: a generation someone is reading keeps its
    // cross-tab retention window, so the pin also refreshes the retention
    // anchor (Greptile review fix G2). Pin bookkeeping never joins another
    // in-flight transaction: it must run whatever else is writing.
    const reader = createReader(record);
    await Dexie.ignoreTransaction(() =>
      deps
        .requireDatabase()
        .generations.update(record.generationId, {
          lastUsedAt: new Date(deps.now()).toISOString(),
        })
        .catch((error: unknown) =>
          // Diagnostics only; the pin itself already protects the generation.
          deps.background('pin retention refresh', () => Promise.reject(error)),
        ),
    );
    return reader;
  }

  /**
   * Pin one generation of this database. The pin is taken before the reader
   * is validated and handed over to it, so a collection that runs right now
   * already sees it (Greptile review fix G2); a generation that turns out
   * unusable gives the pin back and reports no reader (Greptile review fix G7).
   */
  async function openPinned(
    generationId: string,
  ): Promise<GenerationReader | null> {
    addPin(generationId);
    let held = true;
    const unwind = (): null => {
      if (held) {
        held = false;
        removePin(generationId);
      }
      return null;
    };
    try {
      const db = deps.requireDatabase();
      const record = await Dexie.ignoreTransaction(() =>
        db.generations.get(generationId),
      );
      if (!record || record.status !== 'ready') return unwind();
      if (!(await countsMatch(record, (name) => catalogueTable(db, name))))
        return unwind();
      unwind();
      return pinnedReader(record);
    } catch (error) {
      unwind();
      throw error;
    }
  }

  /**
   * Whether the stored rows of one generation match the counts its record
   * promises (Greptile review fixes G3 and G7). Runs outside any ambient
   * transaction unless its tables come from one.
   */
  async function countsMatch(
    record: GenerationRecord,
    table: (name: CatalogueStoreName) => AnyCatalogueTable,
  ): Promise<boolean> {
    return Dexie.ignoreTransaction(async () => {
      for (const [key, name] of Object.entries(RECORD_COUNT_COLLECTIONS)) {
        const expected = record.recordCounts[key];
        // A count the record does not declare is not asserted: published
        // manifests may declare only some counts (Greptile round 2 finding 3).
        if (expected === undefined) continue;
        const actual = await table(name)
          .where('generationId')
          .equals(record.generationId)
          .count();
        if (actual !== expected) return false;
      }
      return true;
    });
  }

  async function deleteGenerationRows(generationId: string): Promise<void> {
    const db = deps.requireDatabase();
    for (const name of CATALOGUE_STORE_NAMES)
      await catalogueTable(db, name)
        .where('generationId')
        .equals(generationId)
        .delete();
    await db.generations.delete(generationId);
  }

  /** The same deletion, on one already open transaction. */
  async function deleteGenerationRowsIn(
    transaction: Transaction,
    generationId: string,
  ): Promise<void> {
    for (const name of CATALOGUE_STORE_NAMES)
      await scopedCatalogueTable(transaction, name)
        .where('generationId')
        .equals(generationId)
        .delete();
    await transaction.table('generations').delete(generationId);
  }

  async function collectGenerations(): Promise<readonly string[]> {
    await deps.onMaintenance?.({ kind: 'generation-gc' });
    const db = deps.database();
    if (!db) return [];
    const meta = await db.meta.get('dataset-state');
    const keep = new Set<string>();
    if (meta?.activeGenerationId) keep.add(meta.activeGenerationId);
    if (meta?.previousGenerationId) keep.add(meta.previousGenerationId);
    for (const [generationId, count] of pins)
      if (count > 0) keep.add(generationId);
    const candidates: GenerationRecord[] = [];
    for (const record of await db.generations.toArray()) {
      if (keep.has(record.generationId)) continue;
      const abandonedStaging =
        record.status !== 'ready' &&
        deps.now() - Date.parse(record.stagedAt) >= deps.staleStagingMs;
      // Retention is measured from the last activation (or rollback, or pin),
      // never from the original staging time (Codex review fix #3).
      const retainedAt = record.lastUsedAt ?? record.readyAt;
      const expiredReady =
        record.status === 'ready' &&
        retainedAt !== null &&
        deps.now() - Date.parse(retainedAt) >= deps.retainReadyForMs;
      if (abandonedStaging || expiredReady) candidates.push(record);
    }
    const removed: string[] = [];
    for (const record of candidates) {
      // The decision is taken again inside the deleting transaction: a pointer
      // switch or a pin that happened after the snapshot protects the
      // generation it targets (Greptile review fix G2).
      const deleted = await db.transaction(
        'rw',
        [db.generations, db.meta, ...catalogueTables(db)],
        async (transaction) => {
          const current = await transaction.meta.get('dataset-state');
          if (current?.activeGenerationId === record.generationId) return false;
          if (current?.previousGenerationId === record.generationId)
            return false;
          if ((pins.get(record.generationId) ?? 0) > 0) return false;
          const staged = await transaction.generations.get(record.generationId);
          if (!staged) return false;
          await deleteGenerationRowsIn(transaction, record.generationId);
          return true;
        },
      );
      if (deleted) removed.push(record.generationId);
    }
    return removed;
  }

  /**
   * Run collection under the writer lease. It is refused - nothing is
   * collected - while another tab stages or activates (Greptile G2).
   */
  async function collectUnderLock(): Promise<readonly string[]> {
    const writerLock = deps.writerLock();
    if (!writerLock) return [];
    const outcome = await writerLock.withExclusiveUpdate(async () =>
      collectGenerations(),
    );
    return outcome.ok ? outcome.value : [];
  }

  /**
   * Remove staging generations whose writer crashed mid-write (Greptile G3).
   * Only leftovers past the grace period are touched, and the lease is claimed
   * only when there is something to clean. Every candidate is re-checked
   * inside the deleting transaction: the scan happens before the claim, and a
   * writer can complete and activate in between (Greptile round 2 finding 2).
   */
  async function cleanupIncompleteStaging(): Promise<void> {
    const db = deps.database();
    const writerLock = deps.writerLock();
    if (!db || !writerLock) return;
    const leftovers = (await db.generations.toArray()).filter(
      (record) =>
        record.status === 'staging' &&
        deps.now() - Date.parse(record.stagedAt) >= deps.staleStagingMs,
    );
    if (leftovers.length === 0) return;
    await writerLock.withExclusiveUpdate(async () => {
      for (const record of leftovers) {
        await db.transaction(
          'rw',
          [db.generations, db.meta, ...catalogueTables(db)],
          async (transaction) => {
            const current = await transaction.meta.get('dataset-state');
            if (current?.activeGenerationId === record.generationId) return;
            if (current?.previousGenerationId === record.generationId) return;
            if ((pins.get(record.generationId) ?? 0) > 0) return;
            const staged = await transaction.generations.get(
              record.generationId,
            );
            if (!staged || staged.status !== 'staging') return;
            await deleteGenerationRowsIn(transaction, record.generationId);
          },
        );
      }
      return true;
    });
  }

  return {
    createReader,
    pinnedReader,
    openPinned,
    countsMatch,
    deleteGenerationRows,
    deleteGenerationRowsIn,
    collectGenerations,
    collectUnderLock,
    cleanupIncompleteStaging,
  };
}
