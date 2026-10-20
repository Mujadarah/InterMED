/** Explicit development and test fixtures; excluded from the production API. */
export {
  buildSyntheticCatalogueBundle,
  SYNTHETIC_DATASET,
  SYNTHETIC_DEFAULT_INGREDIENTS,
  SYNTHETIC_DEFAULT_PRODUCTS,
  SYNTHETIC_SOURCE_KEY,
} from './synthetic-bundle';
export type {
  SyntheticBundle,
  SyntheticBundleOptions,
  SyntheticIngredientSpec,
  SyntheticProductSpec,
} from './synthetic-bundle';
