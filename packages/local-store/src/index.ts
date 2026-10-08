/**
 * Public boundary of `@intermed/local-store`: the IndexedDB/Dexie adapters and
 * the dataset update pipeline for the local catalog.
 *
 * Only the application composition root (`apps/web/src/Bootstrap.tsx`) and the
 * test-only browser harness (`apps/web/src/dev/**`) may import this package;
 * scripts/check-boundaries.mjs enforces that. Nothing here leaks a Dexie type:
 * the contracts consumed by the application live in `@intermed/domain`.
 */

export {
  createLocalDatasetStore,
  DEFAULT_DATASET_KEY,
  RETAIN_READY_FOR_MS,
  STALE_STAGING_MS,
} from './store';
export type {
  LocalDatasetStore,
  LocalDatasetStoreOptions,
  MaintenanceDiagnostics,
  MaintenanceFailure,
  MaintenanceStatus,
  MaintenanceTask,
  StagingProgress,
} from './store';
export {
  LOCAL_DATASET_DB_NAME,
  LOCAL_DATASET_SCHEMA_GENERATION,
} from './schema';
export type { CatalogueStoreName } from './schema';
export {
  createBroadcastEventBus,
  createDefaultEventBus,
  createMemoryEventBus,
  createNoopEventBus,
} from './events';
export type { DatasetEventBus, DatasetStoreEvent } from './events';
export { createMarkerWriterLock, createWebWriterLock } from './locks';
export type {
  DatasetWriterLock,
  LockManagerLike,
  MarkerLockOptions,
  WriterLease,
  WriterLockOutcome,
} from './locks';
export { MARKER_RENEW_MS, MARKER_TTL_MS } from './locks';
export { attachConnectionLifecycle } from './lifecycle';
export type { ConnectionLifecycle } from './lifecycle';
export { openSchemaUpgradeProbe } from './probe';
export type { ProbeFavorite, SchemaUpgradeProbe } from './probe';
export {
  bundleByteLength,
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
export {
  checkBundle,
  checkManifest,
  decodeBundleBytes,
  isClientCompatible,
  LOCAL_CLIENT_VERSION,
  NON_FATAL_DATA_QUALITY_CODES,
  SUPPORTED_MANIFEST_SCHEMA_VERSIONS,
} from './validate';
export type { BundleValidation } from './validate';
export { foldFieldForIndex, foldForIndex } from './fold';
