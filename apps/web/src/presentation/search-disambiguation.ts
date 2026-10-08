import type { MedicationSearchMatch } from '@intermed/domain';

const NOT_PROVIDED = 'Not provided by source';

export interface DisambiguatedSearchResult {
  readonly match: MedicationSearchMatch;
  readonly ingredients: string;
  readonly strength: string;
  readonly dosageForm: string;
  readonly route: string;
  readonly authorization: string;
  readonly manufacturer: string;
  readonly pack: string;
  readonly cim: string;
  readonly catalogueStatus: string;
  readonly sourceProductIdSuffix: string | null;
  readonly productIdSuffix: string | null;
}

function fieldValue(field: {
  readonly status: string;
  readonly value?: string;
}) {
  return field.status === 'present' && field.value?.trim()
    ? field.value
    : NOT_PROVIDED;
}

function ingredientsFor(match: MedicationSearchMatch): string {
  const sourceNames = match.record.ingredientNames.filter((name) =>
    name.trim(),
  );
  const names = sourceNames.length
    ? sourceNames
    : match.record.product.originalDciText.status === 'present' &&
        match.record.product.originalDciText.value.trim()
      ? [match.record.product.originalDciText.value]
      : [];
  return names.length ? [...names].sort().join(', ') : NOT_PROVIDED;
}

function catalogueStatus(match: MedicationSearchMatch): string {
  switch (match.record.product.status) {
    case 'active':
      return 'Present in local dataset';
    case 'removed':
      return 'Removed from dataset';
    case 'unresolved':
      return 'Unresolved product record';
  }
}

function baseVisibleText(row: DisambiguatedSearchResult): readonly string[] {
  const product = row.match.record.product;
  return [
    product.commercialName,
    row.ingredients,
    row.strength,
    row.dosageForm,
    row.route,
    row.authorization,
    row.manufacturer,
    row.pack,
    row.cim,
    row.catalogueStatus,
  ];
}

function countBy<T>(values: readonly T[], keyFor: (value: T) => string) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = keyFor(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Prepare source-faithful candidate details and resolve any visible collisions. */
export function createDisambiguatedSearchResults(
  matches: readonly MedicationSearchMatch[],
): readonly DisambiguatedSearchResult[] {
  const rows: DisambiguatedSearchResult[] = matches.map((match) => {
    const record = match.record;
    const product = record.product;
    const manufacturers = record.manufacturerNames.filter((name) =>
      name.trim(),
    );
    return {
      match,
      ingredients: ingredientsFor(match),
      strength: fieldValue(product.strengthText),
      dosageForm: record.dosageFormName?.trim() || NOT_PROVIDED,
      route: fieldValue(product.route),
      authorization: fieldValue(product.authorizationStatus),
      manufacturer: manufacturers.length
        ? manufacturers.join(', ')
        : NOT_PROVIDED,
      pack: fieldValue(product.presentationOrPackDescription),
      cim: fieldValue(product.cim),
      catalogueStatus: catalogueStatus(match),
      sourceProductIdSuffix: null,
      productIdSuffix: null,
    };
  });

  const baseCounts = countBy(rows, (row) =>
    JSON.stringify(baseVisibleText(row)),
  );
  const withSourceIds = rows.map((row) =>
    (baseCounts.get(JSON.stringify(baseVisibleText(row))) ?? 0) > 1
      ? {
          ...row,
          sourceProductIdSuffix: row.match.record.product.sourceProductId,
        }
      : row,
  );
  const sourceCounts = countBy(withSourceIds, (row) =>
    JSON.stringify([...baseVisibleText(row), row.sourceProductIdSuffix]),
  );

  return withSourceIds.map((row) =>
    (sourceCounts.get(
      JSON.stringify([...baseVisibleText(row), row.sourceProductIdSuffix]),
    ) ?? 0) > 1
      ? { ...row, productIdSuffix: row.match.record.product.id }
      : row,
  );
}
