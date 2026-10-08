import type {
  DatasetRecordCounts,
  MedicationCatalogueSnapshot,
  MedicationIngredient,
  MedicationProduct,
} from '@intermed/domain';
import { deepEqual } from './deep-equal';
import { compareKeys } from './keys';
import type { DiffSummary } from './core';

export interface LargeRemovalThresholds {
  largeRemovalCount: number;
  largeRemovalPercent: number;
}

export interface ProductDiff {
  diff: DiffSummary;
  largeRemovalRequired: boolean;
}

/**
 * Fields that only describe the generation the row was imported in. They are
 * rewritten for every generation and are excluded from change detection, so an
 * unchanged next generation is never reported as all changed.
 */
const GENERATION_PROVENANCE_FIELDS: readonly string[] = ['datasetVersionId'];

function semanticRow(row: object): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...row };
  for (const field of GENERATION_PROVENANCE_FIELDS) delete copy[field];
  return copy;
}

/** Stable product key: source key plus source product id. */
export function productKey(product: MedicationProduct): string {
  return `${product.sourceId}\u001f${product.sourceProductId}`;
}

function joinsByProduct(
  joins: readonly MedicationIngredient[],
): Map<string, MedicationIngredient[]> {
  const grouped = new Map<string, MedicationIngredient[]>();
  for (const join of joins) {
    const group = grouped.get(join.productId);
    if (group) group.push(join);
    else grouped.set(join.productId, [join]);
  }
  return grouped;
}

function productSignature(
  product: MedicationProduct,
  joins: readonly MedicationIngredient[],
): unknown {
  const links = joins
    .map((join) => semanticRow(join))
    .sort((a, b) =>
      compareKeys(
        String(a.sourceRecordKey ?? ''),
        String(b.sourceRecordKey ?? ''),
      ),
    );
  return { product: semanticRow(product), ingredientLinks: links };
}

/**
 * Product diff between the baseline catalogue and the candidate generation.
 *
 * Products are matched on source key plus source product id. A product counts
 * as renamed when only its commercial name differs, as changed when its
 * semantic fields or its related ingredient links differ, and the remainder is
 * added or removed. A large removal requires explicit threshold approval.
 */
export function diffProducts(
  baseline: MedicationCatalogueSnapshot | undefined,
  candidate: MedicationCatalogueSnapshot,
  thresholds: LargeRemovalThresholds,
): ProductDiff {
  const previousProducts = new Map(
    (baseline?.products ?? []).map((product) => [productKey(product), product]),
  );
  const previousJoins = joinsByProduct(baseline?.medicationIngredients ?? []);
  const candidateJoins = joinsByProduct(candidate.medicationIngredients);
  const previousCount = previousProducts.size;

  let added = 0;
  let changed = 0;
  let renamed = 0;
  let removed = 0;
  const seen = new Set<string>();

  for (const product of candidate.products) {
    const key = productKey(product);
    seen.add(key);
    const before = previousProducts.get(key);
    if (!before) {
      added += 1;
      continue;
    }
    const unchanged = deepEqual(
      productSignature(
        { ...product, commercialName: before.commercialName },
        candidateJoins.get(product.id) ?? [],
      ),
      productSignature(before, previousJoins.get(before.id) ?? []),
    );
    if (!unchanged) changed += 1;
    else if (product.commercialName !== before.commercialName) renamed += 1;
  }

  for (const key of previousProducts.keys()) {
    if (!seen.has(key)) removed += 1;
  }

  const largeRemovalRequired =
    removed > 0 &&
    (removed >= thresholds.largeRemovalCount ||
      (previousCount > 0 &&
        (removed / previousCount) * 100 >= thresholds.largeRemovalPercent));

  return {
    diff: {
      added,
      changed,
      renamed,
      removed,
      netProducts: candidate.products.length,
    },
    largeRemovalRequired,
  };
}

/** Actual row counts of one sealed catalogue, used as counts provenance. */
export function catalogueCounts(
  snapshot: MedicationCatalogueSnapshot,
): DatasetRecordCounts {
  return {
    dataSources: snapshot.dataSources.length,
    datasetVersions: snapshot.datasetVersions.length,
    products: snapshot.products.length,
    activeIngredients: snapshot.activeIngredients.length,
    medicationIngredients: snapshot.medicationIngredients.length,
    atcCodes: snapshot.atcCodes.length,
    dosageForms: snapshot.dosageForms.length,
    manufacturers: snapshot.manufacturers.length,
    marketingAuthorizationHolders:
      snapshot.marketingAuthorizationHolders.length,
    regulatoryDocuments: snapshot.regulatoryDocuments.length,
  };
}
