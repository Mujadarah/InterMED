/**
 * Vendor-neutral, read-only contract for published reference dataset metadata.
 *
 * This module holds pure types only. The domain package stays dependency-free
 * and must not mention network, storage or vendor identifiers (enforced by
 * scripts/check-boundaries.mjs). Concrete readers are injected from
 * `@intermed/data-access`; contributor tests use the synthetic mock reader.
 */

/** Immutable descriptor of one published dataset bundle. */
export interface PublishedBundleDescriptor {
  /** Stable opaque identifier of the bundle record. */
  readonly id: string;
  /** Published dataset generation this bundle belongs to. */
  readonly datasetVersionId: string;
  /** File name reported by the publisher. */
  readonly fileName: string;
  /** Media type of the bundle bytes. */
  readonly contentType: string;
  /** Exact bundle size in bytes. */
  readonly byteSize: number;
  /** Publisher checksum of the bundle bytes, algorithm-prefixed. */
  readonly checksum: string;
  /** Absolute https location of the immutable bundle bytes. */
  readonly url: string;
}

/**
 * Published metadata of one dataset generation: the manifest a client needs
 * before downloading and activating a bundle.
 */
export interface PublishedDatasetManifest {
  /** Dataset key identifying the published reference collection. */
  readonly dataset: string;
  /** Stable opaque identifier of this generation. */
  readonly datasetVersionId: string;
  /** InterMED publication version of this generation. */
  readonly version: string;
  /** Source identifiers whose material this generation derives from. */
  readonly sourceIds: readonly string[];
  /** Upstream version when the source reports one. */
  readonly upstreamVersion: string | null;
  /** Upstream publication time when the source reports one. */
  readonly upstreamPublishedAt: string | null;
  /** InterMED publication time; never substituted by an upstream date. */
  readonly publishedAt: string | null;
  /** InterMED import time of the source material behind this generation. */
  readonly importedAt: string;
  /** Bundle integrity checksum required before client activation. */
  readonly checksum: string;
  /** Version of the data schema this generation follows. */
  readonly schemaVersion: string;
  /** Oldest client version able to consume this generation. */
  readonly minimumClientVersion: string;
  /** Published record counts per entity. */
  readonly recordCounts: Readonly<Record<string, number>>;
  /** Source-supplied coverage summary preserved verbatim, never widened. */
  readonly coverage: string;
  /** Rights approval reference required before publication. */
  readonly rightsApprovalReference: string;
  /** Clinical content review reference required before publication. */
  readonly clinicalReviewReference: string;
  /** Previous generation, used for rollback and lineage. */
  readonly previousVersionId: string | null;
}

/** Nothing is published here (yet). */
export interface PublishedDatasetAbsent {
  readonly status: 'absent';
  readonly reason: PublishedDatasetAbsentReason;
}

/** The reader could not establish what is published. */
export interface PublishedDatasetUnavailable {
  readonly status: 'unavailable';
  readonly reason: PublishedDatasetUnavailableReason;
}

export type PublishedDatasetAbsentReason = 'not-found' | 'not-published';

export type PublishedDatasetUnavailableReason =
  'denied' | 'invalid-response' | 'transport-error';

/**
 * Result of a published-dataset read: availability is explicit so callers can
 * never mistake "unknown" for "nothing to download" or for empty data.
 */
export type PublishedDatasetRead<T> =
  | { readonly status: 'available'; readonly value: T }
  | PublishedDatasetAbsent
  | PublishedDatasetUnavailable;

/** Read-only access to published reference dataset metadata. */
export interface PublishedDatasetReader {
  /** Manifest of the current published generation of a dataset. */
  getManifest(
    dataset: string,
  ): Promise<PublishedDatasetRead<PublishedDatasetManifest>>;
  /** Bundle descriptor of one dataset generation. */
  getBundleDescriptor(
    datasetVersionId: string,
  ): Promise<PublishedDatasetRead<PublishedBundleDescriptor>>;
}
