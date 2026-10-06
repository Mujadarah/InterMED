import type {
  PublishedBundleDescriptor,
  PublishedDatasetManifest,
  PublishedDatasetReader,
} from '@intermed/domain';

/**
 * Synthetic contributor fixture: obviously fictional identity strings, an
 * unresolvable fixture location and checksums that are explicitly not digests.
 * This is not reference data and carries no clinical fact.
 */
export const syntheticPublishedDatasetManifest: PublishedDatasetManifest = {
  dataset: 'synthetic-fixture-demo',
  datasetVersionId: 'synthetic-fixture-version-0',
  version: '0.0.0-synthetic',
  sourceIds: ['synthetic-fixture-source'],
  upstreamVersion: 'SYNTHETIC-UPSTREAM-VERSION',
  upstreamPublishedAt: null,
  publishedAt: '2026-01-02T00:00:00.000Z',
  importedAt: '2026-01-01T00:00:00.000Z',
  checksum: 'SYNTHETIC-CHECKSUM-NOT-A-REAL-DIGEST',
  schemaVersion: '0.0.0-synthetic',
  minimumClientVersion: '0.0.0',
  recordCounts: { syntheticFixtureRows: 1 },
  coverage: 'SYNTHETIC-COVERAGE-NOTE-NOT-A-CLINICAL-CLAIM',
  rightsApprovalReference: 'SYNTHETIC-RIGHTS-REFERENCE-NOT-A-PERMISSION',
  clinicalReviewReference: 'SYNTHETIC-REVIEW-REFERENCE-NOT-A-REVIEW',
  previousVersionId: null,
};

/** Synthetic contributor fixture matching the synthetic manifest above. */
export const syntheticPublishedBundleDescriptor: PublishedBundleDescriptor = {
  id: 'synthetic-fixture-bundle-0',
  datasetVersionId: 'synthetic-fixture-version-0',
  fileName: 'synthetic-fixture-bundle.json',
  contentType: 'application/json',
  byteSize: 0,
  checksum: 'SYNTHETIC-CHECKSUM-NOT-A-REAL-DIGEST',
  url: 'https://fixtures.invalid/synthetic-fixture-bundle.json',
};

/**
 * Contributor-mode reader that serves only the synthetic fixture above and
 * reports everything else as absent. It never fabricates reference content.
 */
export const mockPublishedDatasetReader: PublishedDatasetReader = {
  getManifest: async (dataset) =>
    dataset === syntheticPublishedDatasetManifest.dataset
      ? { status: 'available', value: syntheticPublishedDatasetManifest }
      : { status: 'absent', reason: 'not-published' },
  getBundleDescriptor: async (datasetVersionId) =>
    datasetVersionId === syntheticPublishedBundleDescriptor.datasetVersionId
      ? { status: 'available', value: syntheticPublishedBundleDescriptor }
      : { status: 'absent', reason: 'not-found' },
};
