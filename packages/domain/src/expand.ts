import type { MedicationCatalogueSnapshot } from './catalogue';
import type { ActiveIngredient, MedicationIngredient } from './entities';
import type { FieldState } from './field';
import type { MedicationProductId } from './ids';
import {
  catalogueIssue,
  type CatalogueIssue,
  type CatalogueIssueCode,
} from './issues';

export interface ExpandedComponent {
  readonly productId: MedicationProductId;
  readonly joinId: MedicationIngredient['id'];
  readonly ingredientId: MedicationIngredient['ingredientId'];
  readonly preferredName: FieldState<string>;
  readonly sourceIngredientText: string;
  readonly strengthValue: FieldState<string>;
  readonly strengthValueNormalized: FieldState<string>;
  readonly strengthUnit: MedicationIngredient['strengthUnit'];
  readonly denominatorValue: FieldState<string>;
  readonly denominatorValueNormalized: FieldState<string>;
  readonly denominatorUnit: MedicationIngredient['denominatorUnit'];
  readonly strengthOriginalText: FieldState<string>;
  readonly mappingStatus: MedicationIngredient['mappingStatus'];
  readonly mappingVersion: string;
}

export interface CombinationExpansion {
  readonly productId: MedicationProductId;
  readonly components: readonly ExpandedComponent[];
  readonly structuralCoverage: 'complete' | 'incomplete';
  readonly issues: readonly CatalogueIssue[];
}

const STRUCTURAL: ReadonlySet<CatalogueIssueCode> = new Set([
  'product-not-found',
  'no-ingredients',
  'unresolved-mapping',
  'confirmed-mapping-missing-ingredient',
  'dangling-ingredient',
  'malformed-snapshot',
]);

function malformed(productId: MedicationProductId): CombinationExpansion {
  return {
    productId,
    components: [],
    structuralCoverage: 'incomplete',
    issues: [
      catalogueIssue(
        'malformed-snapshot',
        'Catalogue',
        '',
        '',
        'The catalogue snapshot could not be read.',
      ),
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasReviewedMapping(ingredient: ActiveIngredient): boolean {
  return ingredient.externalMappings.some(
    (mapping) => mapping.reviewStatus === 'reviewed',
  );
}

/**
 * Expand one product into ingredient rows and their stored strengths.
 * Rows are copied, never recalculated. structuralCoverage describes link
 * completeness only; review and unit issues stay visible beside it.
 */
export function expandProductIngredients(
  snapshot: MedicationCatalogueSnapshot,
  productId: MedicationProductId,
): CombinationExpansion {
  try {
    if (
      !isRecord(snapshot) ||
      !Array.isArray(snapshot.products) ||
      !Array.isArray(snapshot.activeIngredients) ||
      !Array.isArray(snapshot.medicationIngredients)
    )
      return malformed(productId);

    const product = snapshot.products.find(
      (item) => isRecord(item) && item.id === productId,
    );
    if (!product)
      return {
        productId,
        components: [],
        structuralCoverage: 'incomplete',
        issues: [
          catalogueIssue(
            'product-not-found',
            'MedicationProduct',
            String(productId),
            'id',
            'No product with this canonical id is in the snapshot.',
          ),
        ],
      };

    const ingredients = new Map(
      snapshot.activeIngredients
        .filter((item) => isRecord(item) && typeof item.id === 'string')
        .map((item) => [item.id, item]),
    );
    const joins = snapshot.medicationIngredients.filter(
      (item) => isRecord(item) && item.productId === productId,
    );
    const issues: CatalogueIssue[] = [];
    if (joins.length === 0)
      issues.push(
        catalogueIssue(
          'no-ingredients',
          'MedicationProduct',
          String(productId),
          'medicationIngredients',
          'The product has no ingredient rows.',
        ),
      );

    const components = joins.map((item) => {
      const row = item;
      let preferredName: FieldState<string> = { status: 'missing' };
      if (row.mappingStatus === 'unresolved')
        issues.push(
          catalogueIssue(
            'unresolved-mapping',
            'MedicationIngredient',
            String(row.id),
            'mappingStatus',
            'The ingredient link is unresolved and blocks complete coverage.',
          ),
        );
      if (
        row.mappingStatus === 'confirmed' &&
        row.ingredientId.status !== 'present'
      )
        issues.push(
          catalogueIssue(
            'confirmed-mapping-missing-ingredient',
            'MedicationIngredient',
            String(row.id),
            'ingredientId',
            'A confirmed join requires an ingredient id.',
          ),
        );
      if (row.ingredientId.status === 'present') {
        const linked = ingredients.get(row.ingredientId.value);
        if (!linked)
          issues.push(
            catalogueIssue(
              'dangling-ingredient',
              'MedicationIngredient',
              String(row.id),
              'ingredientId',
              'The ingredient id is not in this snapshot.',
            ),
          );
        else {
          preferredName = { status: 'present', value: linked.preferredName };
          if (!hasReviewedMapping(linked))
            issues.push(
              catalogueIssue(
                'ingredient-mapping-unreviewed',
                'MedicationIngredient',
                String(row.id),
                'externalMappings',
                'No external mapping for this ingredient is marked reviewed.',
              ),
            );
        }
      }
      if (row.strengthUnit.status === 'invalid')
        issues.push(
          catalogueIssue(
            'invalid-unit',
            'MedicationIngredient',
            String(row.id),
            'strengthUnit',
            'The strength unit is not a recognized structural token and was not converted.',
          ),
        );
      if (
        row.strengthValueNormalized.status === 'unknown' &&
        row.strengthValueNormalized.reason === 'ambiguous-decimal'
      )
        issues.push(
          catalogueIssue(
            'ambiguous-decimal',
            'MedicationIngredient',
            String(row.id),
            'strengthValue',
            'The strength token was preserved because it is numerically ambiguous.',
          ),
        );
      return {
        productId,
        joinId: row.id,
        ingredientId: row.ingredientId,
        preferredName,
        sourceIngredientText: row.sourceIngredientText,
        strengthValue: row.strengthValue,
        strengthValueNormalized: row.strengthValueNormalized,
        strengthUnit: row.strengthUnit,
        denominatorValue: row.denominatorValue,
        denominatorValueNormalized: row.denominatorValueNormalized,
        denominatorUnit: row.denominatorUnit,
        strengthOriginalText: row.strengthOriginalText,
        mappingStatus: row.mappingStatus,
        mappingVersion: row.mappingVersion,
      };
    });

    const structuralCoverage =
      components.length > 0 &&
      !issues.some((issue) => STRUCTURAL.has(issue.code))
        ? 'complete'
        : 'incomplete';
    return { productId, components, structuralCoverage, issues };
  } catch {
    return malformed(productId);
  }
}
