import { expandProductIngredients } from '../expand';
import type { MedicationCatalogueSnapshot } from '../catalogue';
import type {
  ActiveIngredientId,
  MedicationIngredientId,
  MedicationProductId,
} from '../ids';
import type {
  DuplicateExposure,
  InteractionProductIngredientMapping,
  InteractionSelection,
  UnresolvedInteractionInput,
  UnresolvedInteractionInputReason,
} from './types';
import { compareStrings } from './pairs';

export interface ExpandedSelection {
  readonly mappings: readonly InteractionProductIngredientMapping[];
  readonly ingredientIds: readonly ActiveIngredientId[];
  readonly directIngredientIds: readonly ActiveIngredientId[];
  readonly hasDirectInput: boolean;
  readonly unresolvedInputs: readonly UnresolvedInteractionInput[];
  readonly duplicateExposure: readonly DuplicateExposure[];
  readonly datasetVersionPresent: boolean;
}

const EXPANSION_CODE_TO_REASON: Readonly<
  Record<string, UnresolvedInteractionInputReason>
> = {
  'product-not-found': 'product-not-found',
  'no-ingredients': 'no-ingredients',
  'unresolved-mapping': 'unresolved-mapping',
  'confirmed-mapping-missing-ingredient':
    'confirmed-mapping-missing-ingredient',
  'dangling-ingredient': 'dangling-ingredient',
  'malformed-snapshot': 'malformed-snapshot',
  'ingredient-mapping-unreviewed': 'unreviewed-ingredient-mapping',
};

export function stableUnique<T extends string>(values: readonly T[]): T[] {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSnapshot(value: unknown): value is MedicationCatalogueSnapshot {
  return (
    isRecord(value) &&
    Array.isArray(value.datasetVersions) &&
    Array.isArray(value.products) &&
    Array.isArray(value.activeIngredients) &&
    Array.isArray(value.medicationIngredients)
  );
}

function pushUnresolved(
  target: UnresolvedInteractionInput[],
  input: UnresolvedInteractionInput,
): void {
  const duplicate = target.some(
    (item) =>
      item.productId === input.productId &&
      item.joinId === input.joinId &&
      item.ingredientId === input.ingredientId &&
      item.reason === input.reason,
  );
  if (!duplicate) target.push(input);
}

function dedupeSelectionInputs(selection: InteractionSelection): {
  readonly productIds: MedicationProductId[];
  readonly rawDirectIds: ActiveIngredientId[];
  readonly hasDirectInput: boolean;
} {
  const productIds = stableUnique(selection.productIds ?? []);
  const rawDirectIds = stableUnique(selection.ingredientIds ?? []);
  return { productIds, rawDirectIds, hasDirectInput: rawDirectIds.length > 0 };
}

function malformedSnapshotExpansion(
  productIds: readonly MedicationProductId[],
  hasDirectInput: boolean,
  unresolvedInputs: readonly UnresolvedInteractionInput[],
): ExpandedSelection {
  return {
    mappings: productIds.map((productId) => ({
      productId,
      ingredientIds: [],
    })),
    ingredientIds: [],
    directIngredientIds: [],
    hasDirectInput,
    unresolvedInputs,
    duplicateExposure: [],
    datasetVersionPresent: false,
  };
}

function pinSnapshotToVersion(
  snapshot: MedicationCatalogueSnapshot,
  datasetVersionId: InteractionSelection['datasetVersionId'],
): MedicationCatalogueSnapshot {
  return {
    ...snapshot,
    products: snapshot.products.filter(
      (item) => isRecord(item) && item.datasetVersionId === datasetVersionId,
    ),
    activeIngredients: snapshot.activeIngredients.filter(
      (item) => isRecord(item) && item.datasetVersionId === datasetVersionId,
    ),
    medicationIngredients: snapshot.medicationIngredients.filter(
      (item) => isRecord(item) && item.datasetVersionId === datasetVersionId,
    ),
  };
}

function hasCorruptSnapshotItem(
  snapshot: MedicationCatalogueSnapshot,
): boolean {
  return (
    snapshot.products.some((item) => !isRecord(item)) ||
    snapshot.activeIngredients.some((item) => !isRecord(item)) ||
    snapshot.medicationIngredients.some((item) => !isRecord(item))
  );
}

function resolveDirectIngredients(
  pinnedSnapshot: MedicationCatalogueSnapshot,
  rawDirectIds: readonly ActiveIngredientId[],
  unresolvedInputs: UnresolvedInteractionInput[],
): ActiveIngredientId[] {
  const directIngredientIds: ActiveIngredientId[] = [];
  for (const ingredientId of rawDirectIds) {
    const linked = pinnedSnapshot.activeIngredients.find(
      (item) => isRecord(item) && item.id === ingredientId,
    );
    if (linked) directIngredientIds.push(ingredientId);
    else
      pushUnresolved(unresolvedInputs, {
        ingredientId,
        reason: 'unknown-ingredient',
      });
  }
  return stableUnique(directIngredientIds).sort(compareStrings);
}

function expandSingleProduct(
  snapshot: MedicationCatalogueSnapshot,
  pinnedSnapshot: MedicationCatalogueSnapshot,
  datasetVersionId: InteractionSelection['datasetVersionId'],
  productId: MedicationProductId,
  mappings: InteractionProductIngredientMapping[],
  unresolvedInputs: UnresolvedInteractionInput[],
): void {
  const selectedProduct = snapshot.products.find(
    (item) => isRecord(item) && item.id === productId,
  );
  if (!selectedProduct) {
    pushUnresolved(unresolvedInputs, {
      productId,
      reason: 'product-not-found',
    });
    mappings.push({ productId, ingredientIds: [] });
    return;
  }
  if (selectedProduct.datasetVersionId !== datasetVersionId) {
    pushUnresolved(unresolvedInputs, {
      productId,
      reason: 'dataset-version-mismatch',
    });
    mappings.push({ productId, ingredientIds: [] });
    return;
  }

  for (const join of snapshot.medicationIngredients) {
    if (!isRecord(join)) continue;
    if (
      join.productId === productId &&
      join.datasetVersionId !== datasetVersionId
    )
      pushUnresolved(unresolvedInputs, {
        productId,
        joinId: join.id,
        reason: 'dataset-version-mismatch',
      });
  }

  const expansion = expandProductIngredients(pinnedSnapshot, productId);
  for (const issue of expansion.issues) {
    // An unreviewed or rejected crosswalk still leaves the ingredient
    // evaluated so any reported record is shown, but the unresolved input
    // blocks complete coverage (DATA_MODEL: an unresolved crosswalk blocks
    // complete interaction coverage).
    const reason = EXPANSION_CODE_TO_REASON[issue.code];
    if (reason === undefined) continue;
    pushUnresolved(
      unresolvedInputs,
      issue.entity === 'MedicationIngredient'
        ? {
            productId,
            joinId: issue.entityId as MedicationIngredientId,
            reason,
          }
        : { productId, reason },
    );
  }

  const ingredientIds: ActiveIngredientId[] = [];
  for (const component of expansion.components) {
    const ingredientState = component.ingredientId;
    if (
      component.mappingStatus !== 'confirmed' ||
      ingredientState.status !== 'present'
    )
      continue;
    const linked = pinnedSnapshot.activeIngredients.find(
      (item) => isRecord(item) && item.id === ingredientState.value,
    );
    if (linked) ingredientIds.push(ingredientState.value);
  }
  mappings.push({
    productId,
    ingredientIds: stableUnique(ingredientIds),
  });
}

function expandSelectedProducts(
  snapshot: MedicationCatalogueSnapshot,
  pinnedSnapshot: MedicationCatalogueSnapshot,
  datasetVersionId: InteractionSelection['datasetVersionId'],
  productIds: readonly MedicationProductId[],
  unresolvedInputs: UnresolvedInteractionInput[],
): InteractionProductIngredientMapping[] {
  const mappings: InteractionProductIngredientMapping[] = [];
  for (const productId of productIds)
    expandSingleProduct(
      snapshot,
      pinnedSnapshot,
      datasetVersionId,
      productId,
      mappings,
      unresolvedInputs,
    );
  return mappings;
}

function computeIngredientUnion(
  mappings: readonly InteractionProductIngredientMapping[],
  resolvedDirectIds: readonly ActiveIngredientId[],
): {
  readonly allIngredientIds: ActiveIngredientId[];
  readonly duplicateExposure: DuplicateExposure[];
} {
  const productIdsByIngredient = new Map<
    ActiveIngredientId,
    MedicationProductId[]
  >();
  for (const mapping of mappings) {
    for (const ingredientId of mapping.ingredientIds) {
      const products = productIdsByIngredient.get(ingredientId) ?? [];
      products.push(mapping.productId);
      productIdsByIngredient.set(ingredientId, products);
    }
  }
  const directIdSet = new Set<ActiveIngredientId>(resolvedDirectIds);
  const allIngredientIds = stableUnique([
    ...[...productIdsByIngredient.keys()],
    ...resolvedDirectIds,
  ]).sort(compareStrings);
  const duplicateExposure = allIngredientIds
    .filter((ingredientId) => {
      const selectedProducts = productIdsByIngredient.get(ingredientId) ?? [];
      if (selectedProducts.length > 1) return true;
      return selectedProducts.length >= 1 && directIdSet.has(ingredientId);
    })
    .map((ingredientId) => ({
      ingredientId,
      productIds: productIdsByIngredient.get(ingredientId) ?? [],
      directInput: directIdSet.has(ingredientId),
    }))
    .sort((left, right) =>
      compareStrings(left.ingredientId, right.ingredientId),
    );
  return { allIngredientIds, duplicateExposure };
}

export function expandSelection(
  selection: InteractionSelection,
): ExpandedSelection {
  const { productIds, rawDirectIds, hasDirectInput } =
    dedupeSelectionInputs(selection);
  const unresolvedInputs: UnresolvedInteractionInput[] = [];
  if (productIds.length === 0 && !hasDirectInput)
    pushUnresolved(unresolvedInputs, { reason: 'no-products-selected' });

  if (!isSnapshot(selection.snapshot)) {
    pushUnresolved(unresolvedInputs, { reason: 'malformed-snapshot' });
    for (const ingredientId of rawDirectIds)
      pushUnresolved(unresolvedInputs, {
        ingredientId,
        reason: 'unknown-ingredient',
      });
    return malformedSnapshotExpansion(
      productIds,
      hasDirectInput,
      unresolvedInputs,
    );
  }

  const snapshot = selection.snapshot;
  const datasetVersionPresent = snapshot.datasetVersions.some(
    (version) => isRecord(version) && version.id === selection.datasetVersionId,
  );
  if (!datasetVersionPresent)
    pushUnresolved(unresolvedInputs, { reason: 'dataset-version-missing' });
  if (hasCorruptSnapshotItem(snapshot))
    pushUnresolved(unresolvedInputs, { reason: 'malformed-snapshot' });

  const pinnedSnapshot = pinSnapshotToVersion(
    snapshot,
    selection.datasetVersionId,
  );
  const resolvedDirectIds = resolveDirectIngredients(
    pinnedSnapshot,
    rawDirectIds,
    unresolvedInputs,
  );
  const mappings = expandSelectedProducts(
    snapshot,
    pinnedSnapshot,
    selection.datasetVersionId,
    productIds,
    unresolvedInputs,
  );
  const { allIngredientIds, duplicateExposure } = computeIngredientUnion(
    mappings,
    resolvedDirectIds,
  );

  return {
    mappings,
    ingredientIds: allIngredientIds,
    directIngredientIds: resolvedDirectIds,
    hasDirectInput,
    unresolvedInputs,
    duplicateExposure,
    datasetVersionPresent,
  };
}
