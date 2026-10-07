import type { MedicationCatalogueSnapshot } from '@intermed/domain';
import { foldFieldForIndex, foldForIndex } from './fold';
import type {
  AtcRow,
  CatalogueRows,
  DatasetVersionRow,
  DocumentRow,
  DosageFormRow,
  HolderRow,
  IngredientRow,
  ManufacturerRow,
  ProductIngredientRow,
  ProductRow,
  SourceRow,
} from './schema';

const UNIT = '\u001f';

/** Multi-entry index key binding one ATC id to its generation. */
export function atcKey(generationId: string, atcId: string): string {
  return `${generationId}${UNIT}${atcId}`;
}

/**
 * Split one validated snapshot into immutable rows keyed by `[generationId+id]`.
 * Derived fields are index keys only; `entity` keeps the domain record exactly
 * as published and is what readers return.
 */
export function toCatalogueRows(
  generationId: string,
  snapshot: MedicationCatalogueSnapshot,
): CatalogueRows {
  const products: ProductRow[] = snapshot.products.map((entity) => ({
    generationId,
    id: entity.id,
    entity,
    nameFolded: foldForIndex(entity.commercialName),
    dciFolded: foldFieldForIndex(entity.originalDciText),
    status: entity.status,
    atcKeys: entity.atcCodeIds.map((id) => atcKey(generationId, id)),
  }));
  const ingredients: IngredientRow[] = snapshot.activeIngredients.map(
    (entity) => ({
      generationId,
      id: entity.id,
      entity,
      nameFolded: foldForIndex(entity.preferredName),
      dciFolded: foldFieldForIndex(entity.dci),
    }),
  );
  const productIngredients: ProductIngredientRow[] =
    snapshot.medicationIngredients.map((entity) => ({
      generationId,
      id: entity.id,
      entity,
      productId: entity.productId,
      ingredientIdValue:
        entity.ingredientId.status === 'present'
          ? entity.ingredientId.value
          : null,
    }));
  const atcCodes: AtcRow[] = snapshot.atcCodes.map((entity) => ({
    generationId,
    id: entity.id,
    entity,
    code: entity.code,
  }));
  const dosageForms: DosageFormRow[] = snapshot.dosageForms.map((entity) => ({
    generationId,
    id: entity.id,
    entity,
    nameFolded: foldForIndex(entity.displayName),
  }));
  const manufacturers: ManufacturerRow[] = snapshot.manufacturers.map(
    (entity) => ({
      generationId,
      id: entity.id,
      entity,
      nameFolded: foldForIndex(entity.name),
    }),
  );
  const holders: HolderRow[] = snapshot.marketingAuthorizationHolders.map(
    (entity) => ({
      generationId,
      id: entity.id,
      entity,
      nameFolded: foldForIndex(entity.name),
    }),
  );
  const documents: DocumentRow[] = snapshot.regulatoryDocuments.map(
    (entity) => ({
      generationId,
      id: entity.id,
      entity,
      productId: entity.productId,
      type: entity.type,
    }),
  );
  const sources: SourceRow[] = snapshot.dataSources.map((entity) => ({
    generationId,
    id: entity.id,
    entity,
  }));
  const datasetVersions: DatasetVersionRow[] = snapshot.datasetVersions.map(
    (entity) => ({ generationId, id: entity.id, entity }),
  );
  return {
    products,
    ingredients,
    productIngredients,
    atcCodes,
    dosageForms,
    manufacturers,
    holders,
    documents,
    sources,
    datasetVersions,
  };
}
