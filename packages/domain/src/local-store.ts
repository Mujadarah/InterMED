/**
 * Vendor-neutral contracts for local dataset storage.
 *
 * This module holds pure types only. The concrete IndexedDB/Dexie adapters and
 * the update pipeline live in `@intermed/local-store`, which the application
 * composition root injects. No storage vendor, browser global or network
 * identifier appears here (enforced by scripts/check-boundaries.mjs).
 */

import type {
  ActiveIngredient,
  MedicationIngredient,
  MedicationProduct,
} from './entities';
import type {
  ActiveIngredientId,
  DatasetVersionId,
  MedicationProductId,
} from './ids';
import type {
  PublishedBundleDescriptor,
  PublishedDatasetAbsentReason,
  PublishedDatasetManifest,
  PublishedDatasetUnavailableReason,
} from './published-dataset';

/**
 * One locally stored dataset generation: the immutable rows of one published
 * bundle plus the provenance shown in diagnostics and status output.
 */
export interface LocalDatasetGeneration {
  /** Local generation key. Equal to the published dataset version id. */
  readonly generationId: string;
  /** Dataset key identifying the published reference collection. */
  readonly dataset: string;
  /** InterMED publication version of this generation. */
  readonly version: string;
  /** Data schema version this generation follows. */
  readonly schemaVersion: string;
  /** Source identifiers whose material this generation derives from. */
  readonly sourceIds: readonly string[];
  /** InterMED publication time, when the publisher supplied one. */
  readonly publishedAt: string | null;
  /** InterMED import time of the source material behind this generation. */
  readonly importedAt: string;
  /** Local time the bundle finished downloading. Age is measured from here. */
  readonly downloadedAt: string;
  /** Bundle integrity checksum recorded at publication. A corruption check. */
  readonly checksum: string;
  /** Source-supplied coverage summary preserved verbatim. */
  readonly coverage: string;
  /** Published record counts per entity. */
  readonly recordCounts: Readonly<Record<string, number>>;
  /**
   * Whether the generation derives from synthetic development fixtures only.
   * Synthetic generations must be labelled "not for clinical use" in any UI.
   */
  readonly synthetic: boolean;
}

/** A published generation that is not active locally. Used by update states. */
export interface LocalDatasetCandidate {
  readonly generationId: string;
  readonly version: string;
  readonly publishedAt: string | null;
}

/**
 * Why an update was rejected or could not run. A failed update always keeps
 * the previously active generation; nothing is cleared to make room.
 */
export type DatasetUpdateFailureReason =
  | 'manifest-unavailable'
  | 'invalid-manifest'
  | 'incompatible-schema'
  | 'bundle-unavailable'
  | 'invalid-bundle'
  | 'checksum-mismatch'
  | 'integrity-failed'
  | 'count-mismatch'
  | 'interrupted'
  | 'writer-busy';

/**
 * Visible local dataset state. It is deliberately explicit: a missing dataset,
 * a restricted store and an evicted store are different situations with
 * different recovery paths, and none of them may be shown as an empty
 * catalogue.
 */
export type DatasetUpdateState =
  /** The local database is being opened. */
  | { readonly status: 'opening' }
  /** No compatible dataset has ever been downloaded into this browser. */
  | { readonly status: 'never-downloaded' }
  /** A generation is active and readable. */
  | { readonly status: 'ready'; readonly generation: LocalDatasetGeneration }
  /** A background manifest check is running. The active generation stays usable. */
  | {
      readonly status: 'checking';
      readonly generation: LocalDatasetGeneration | null;
    }
  /** A newer compatible generation was published and is not downloaded yet. */
  | {
      readonly status: 'update-available';
      readonly generation: LocalDatasetGeneration | null;
      readonly candidate: LocalDatasetCandidate;
    }
  /** A candidate bundle is downloading. The active generation stays usable. */
  | {
      readonly status: 'downloading';
      readonly generation: LocalDatasetGeneration | null;
      readonly candidate: LocalDatasetCandidate;
    }
  /** A downloaded bundle is being staged. Not active until the pointer switch. */
  | {
      readonly status: 'staging';
      readonly generation: LocalDatasetGeneration | null;
      readonly candidate: LocalDatasetCandidate;
    }
  /** The update was rejected or interrupted. The previous generation is kept. */
  | {
      readonly status: 'update-failed';
      readonly reason: DatasetUpdateFailureReason;
      readonly generation: LocalDatasetGeneration | null;
    }
  /** This browser exposes no usable local database API. */
  | { readonly status: 'storage-unavailable' }
  /** The database API exists but this browser/profile refuses to use it. */
  | { readonly status: 'storage-restricted' }
  /** A write hit the storage quota. Staging was aborted; the active data is kept. */
  | {
      readonly status: 'storage-quota';
      readonly generation: LocalDatasetGeneration | null;
    }
  /** The active pointer exists but its rows are gone (evicted or deleted). */
  | { readonly status: 'evicted'; readonly generationId: string }
  /** The stored database was written by a newer, unsupported schema. */
  | { readonly status: 'unsupported-schema' }
  /** Another tab or app version changed the database under this connection. */
  | { readonly status: 'reload-required' };

/** Read access to the state of the local dataset store. */
export interface DatasetStateSource {
  /** Current state. The identity is stable until the store changes. */
  getState(): DatasetUpdateState;
  /** Subscribe to state changes and return an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/**
 * Reader pinned to exactly one generation for its lifetime. Search, detail and
 * interaction evaluation must use one pinned reader so a pointer switch in the
 * middle of an evaluation can never mix two generations.
 */
export interface GenerationReader {
  /** The generation this reader is pinned to. */
  readonly generationId: string;
  /** Provenance of the pinned generation. */
  readonly generation: LocalDatasetGeneration;
  /** One product of the pinned generation, or null when absent. */
  product(id: MedicationProductId): Promise<MedicationProduct | null>;
  /** One active ingredient of the pinned generation, or null when absent. */
  ingredient(id: ActiveIngredientId): Promise<ActiveIngredient | null>;
  /** Product-to-ingredient links of one product of the pinned generation. */
  productIngredients(
    productId: MedicationProductId,
  ): Promise<readonly MedicationIngredient[]>;
  /** Generation-scoped name lookup. Prefix is matched on a folded name. */
  productsByNamePrefix(prefix: string): Promise<readonly MedicationProduct[]>;
  /** Generation-scoped DCI lookup. Prefix is matched on a folded DCI token. */
  ingredientsByDciPrefix(prefix: string): Promise<readonly ActiveIngredient[]>;
  /** Products carrying one ATC code in the pinned generation. */
  productsByAtcCode(code: string): Promise<readonly MedicationProduct[]>;
  /** Product ids of the pinned generation, in stable id order. */
  productIds(): Promise<readonly MedicationProductId[]>;
  /**
   * Release the retention pin this reader holds on its generation. Optional:
   * an unreleased pin only retains data longer, never less.
   */
  release(): void;
}

/** Local generations: pinning, rollback and safe retention/garbage collection. */
export interface DatasetGenerationRepository {
  /**
   * Pin the active generation and return a reader for it. Returns null when no
   * generation is active, the active generation was evicted, or storage is in
   * one of the unavailable states.
   */
  openReader(): Promise<GenerationReader | null>;
  /** Pin one specific generation. Returns null when it is not readable. */
  openPinnedReader(generationId: string): Promise<GenerationReader | null>;
  /**
   * Switch the active pointer back to the retained previous generation.
   * Returns false when no previous generation is retained.
   */
  rollback(): Promise<boolean>;
  /**
   * Delete staged leftovers and ready generations that are neither active,
   * previous, pinned here, nor inside the cross-tab retention window.
   * Returns the removed generation ids. Never removes the active generation.
   */
  collect(): Promise<readonly string[]>;
}

/** Reason a favorite is or is not resolvable in the active generation. */
export type FavoriteStatus = 'available' | 'removed' | 'unresolved';

/**
 * A local favorite. The stable product identifier is the identity: a catalogue
 * replacement may mark it removed, but never remaps it to a similar product.
 */
export interface FavoriteEntry {
  readonly productId: MedicationProductId;
  readonly createdAt: string;
  readonly lastKnownDisplayName: string;
  readonly lastKnownDatasetVersionId: DatasetVersionId | null;
  readonly status: FavoriteStatus;
}

/** One locally retained search query. Query text is never logged or sent. */
export interface RecentSearchEntry {
  readonly id: string;
  readonly query: string;
  readonly occurredAt: string;
  readonly lastKnownDatasetVersionId: DatasetVersionId | null;
}

/** Tombstone for a favorited product that a later generation no longer has. */
export interface ProductTombstone {
  readonly productId: MedicationProductId;
  readonly lastKnownDisplayName: string;
  readonly removedAt: string;
}

/**
 * Local preferences. They live outside dataset generations, use stable product
 * identifiers and migrate independently of catalogue replacement.
 */
export interface LocalPreferencesStore {
  listFavorites(): Promise<readonly FavoriteEntry[]>;
  addFavorite(input: {
    readonly productId: MedicationProductId;
    readonly lastKnownDisplayName: string;
    readonly lastKnownDatasetVersionId: DatasetVersionId | null;
  }): Promise<FavoriteEntry>;
  removeFavorite(productId: MedicationProductId): Promise<void>;
  listRecentSearches(): Promise<readonly RecentSearchEntry[]>;
  addRecentSearch(input: {
    readonly query: string;
    readonly lastKnownDatasetVersionId: DatasetVersionId | null;
  }): Promise<RecentSearchEntry>;
  clearRecentSearches(): Promise<void>;
  listProductTombstones(): Promise<readonly ProductTombstone[]>;
  /** Delete every local dataset and preference record. Explicit user action. */
  clearAllLocalData(): Promise<void>;
}

/**
 * Background check, download and activation of published generations.
 * `stageBundle` takes the bundle payload directly so tests and the test-only
 * browser harness can drive the pipeline without any network access.
 */
export interface DatasetUpdatePipeline {
  /** Check the published manifest only. Never downloads a bundle. */
  checkForUpdate(): Promise<DatasetUpdateState>;
  /** Check, download, validate, stage and activate the published generation. */
  downloadAndActivate(): Promise<DatasetUpdateState>;
  /** Validate and stage one supplied bundle. Does not change the active pointer. */
  stageBundle(
    manifest: PublishedDatasetManifest,
    bundleText: string,
  ): Promise<DatasetUpdateState>;
  /** Activate one already staged generation with a single pointer switch. */
  activate(generationId: string): Promise<DatasetUpdateState>;
  /** Stage and then activate one supplied bundle. */
  stageAndActivate(
    manifest: PublishedDatasetManifest,
    bundleText: string,
  ): Promise<DatasetUpdateState>;
}

/**
 * The whole local store: dataset generations, the update pipeline and
 * preferences. Only the application composition root constructs it.
 */
export interface LocalCatalogueStore
  extends DatasetStateSource, DatasetGenerationRepository {
  readonly updates: DatasetUpdatePipeline;
  readonly preferences: LocalPreferencesStore;
  /** Open the local database and derive the current state. Idempotent. */
  open(): Promise<DatasetUpdateState>;
  /** Close the local connection. Later calls reopen when needed. */
  close(): void;
}

/** Result of loading one published bundle's bytes as text. */
export type PublishedBundleRead =
  | { readonly status: 'available'; readonly text: string }
  | {
      readonly status: 'absent';
      readonly reason: PublishedDatasetAbsentReason;
    }
  | {
      readonly status: 'unavailable';
      readonly reason: PublishedDatasetUnavailableReason;
    };

/**
 * Vendor-neutral bundle loading. The concrete loader is injected; the update
 * pipeline never touches a network API itself.
 */
export interface PublishedBundleLoader {
  loadBundle(
    descriptor: PublishedBundleDescriptor,
  ): Promise<PublishedBundleRead>;
}
