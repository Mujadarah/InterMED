import type { MedicationCatalogueSnapshot } from './catalogue';
import type { ActiveIngredient, MedicationProduct } from './entities';
import type { FieldState } from './field';

export type AmbiguousIdentityReason =
  | 'same-commercial-name-different-strength-or-form'
  | 'same-commercial-name-different-source-key'
  | 'duplicate-source-product-id'
  | 'legacy-cedilla-diacritic-variant'
  | 'same-preferred-name-different-salt-or-form';

export interface AmbiguousIdentity {
  readonly state: 'ambiguous-not-merged';
  readonly reason: AmbiguousIdentityReason;
  readonly name: string;
  readonly entity: 'MedicationProduct' | 'ActiveIngredient';
  readonly entityIds: readonly string[];
  readonly retainedAsDistinct: true;
}

const CEDILLA: Readonly<Record<string, string>> = {
  '\u015F': '\u0219',
  '\u015E': '\u0218',
  '\u0163': '\u021B',
  '\u0162': '\u021A',
};

/** Map legacy Romanian cedilla letters to comma-below. This does not merge records. */
export function foldLegacyCedilla(value: string): string {
  let folded = '';
  for (const char of value.normalize('NFC')) folded += CEDILLA[char] ?? char;
  return folded;
}

function signature(field: FieldState<string>): string {
  if (field.status === 'present') return `present:${field.value}`;
  if (field.status === 'unknown') return `unknown:${field.reason}`;
  return 'missing';
}

function groupBy<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

function finding(
  reason: AmbiguousIdentityReason,
  name: string,
  entity: AmbiguousIdentity['entity'],
  entityIds: readonly string[],
): AmbiguousIdentity {
  return {
    state: 'ambiguous-not-merged',
    reason,
    name,
    entity,
    entityIds,
    retainedAsDistinct: true,
  };
}

function productFindings(
  products: readonly MedicationProduct[],
): AmbiguousIdentity[] {
  const findings: AmbiguousIdentity[] = [];
  for (const [name, group] of groupBy(products, (item) =>
    item.commercialName.normalize('NFC'),
  )) {
    if (group.length < 2) continue;
    const strengths = new Set(
      group.map((item) => signature(item.strengthText)),
    );
    const forms = new Set(group.map((item) => signature(item.dosageFormId)));
    if (strengths.size > 1 || forms.size > 1)
      findings.push(
        finding(
          'same-commercial-name-different-strength-or-form',
          name,
          'MedicationProduct',
          group.map((item) => item.id),
        ),
      );
    for (const byStrength of groupBy(group, (item) =>
      signature(item.strengthText),
    ).values()) {
      for (const partition of groupBy(byStrength, (item) =>
        signature(item.dosageFormId),
      ).values()) {
        if (partition.length < 2) continue;
        const sourceKeys = new Set(
          partition.map(
            (item) => `${item.sourceId}\u001f${item.sourceProductId}`,
          ),
        );
        if (sourceKeys.size > 1)
          findings.push(
            finding(
              'same-commercial-name-different-source-key',
              name,
              'MedicationProduct',
              partition.map((item) => item.id),
            ),
          );
      }
    }
  }

  for (const group of groupBy(
    products,
    (item) => `${item.sourceId}\u001f${item.sourceProductId}`,
  ).values()) {
    if (group.length < 2) continue;
    const names = new Set(
      group.map((item) => item.commercialName.normalize('NFC')),
    );
    const first = group[0];
    if (!first) continue;
    findings.push(
      finding(
        'duplicate-source-product-id',
        names.size === 1
          ? first.commercialName.normalize('NFC')
          : first.sourceProductId,
        'MedicationProduct',
        group.map((item) => item.id),
      ),
    );
  }

  for (const [name, group] of groupBy(products, (item) =>
    foldLegacyCedilla(item.commercialName),
  )) {
    const distinct = new Set(
      group.map((item) => item.commercialName.normalize('NFC')),
    );
    if (distinct.size < 2) continue;
    findings.push(
      finding(
        'legacy-cedilla-diacritic-variant',
        name,
        'MedicationProduct',
        group.map((item) => item.id),
      ),
    );
  }
  return findings;
}

function ingredientFindings(
  ingredients: readonly ActiveIngredient[],
): AmbiguousIdentity[] {
  const findings: AmbiguousIdentity[] = [];
  for (const [name, group] of groupBy(ingredients, (item) =>
    item.preferredName.normalize('NFC'),
  )) {
    if (group.length < 2) continue;
    const salts = new Set(group.map((item) => signature(item.saltOrForm)));
    if (salts.size < 2) continue;
    findings.push(
      finding(
        'same-preferred-name-different-salt-or-form',
        name,
        'ActiveIngredient',
        group.map((item) => item.id),
      ),
    );
  }
  return findings;
}

/**
 * Report identity collisions that must stay unresolved.
 * The snapshot is not modified and rows are not merged.
 */
export function findAmbiguousIdentities(
  snapshot: MedicationCatalogueSnapshot,
): readonly AmbiguousIdentity[] {
  try {
    if (!snapshot || !Array.isArray(snapshot.products)) return [];
    const ingredients = Array.isArray(snapshot.activeIngredients)
      ? snapshot.activeIngredients
      : [];
    return [
      ...productFindings(snapshot.products),
      ...ingredientFindings(ingredients),
    ].sort(
      (left, right) =>
        left.reason.localeCompare(right.reason) ||
        left.name.localeCompare(right.name) ||
        left.entityIds
          .join('\u001f')
          .localeCompare(right.entityIds.join('\u001f')),
    );
  } catch {
    return [];
  }
}
