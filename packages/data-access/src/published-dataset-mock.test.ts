import { describe, expect, it } from 'vitest';
import {
  mockPublishedDatasetReader,
  syntheticPublishedBundleDescriptor,
  syntheticPublishedDatasetManifest,
} from './published-dataset-mock';

const syntheticIdentityFields = [
  syntheticPublishedDatasetManifest.dataset,
  syntheticPublishedDatasetManifest.datasetVersionId,
  syntheticPublishedDatasetManifest.version,
  syntheticPublishedDatasetManifest.schemaVersion,
  syntheticPublishedDatasetManifest.checksum,
  syntheticPublishedDatasetManifest.coverage,
  syntheticPublishedDatasetManifest.rightsApprovalReference,
  syntheticPublishedDatasetManifest.clinicalReviewReference,
  syntheticPublishedDatasetManifest.upstreamVersion,
  ...syntheticPublishedDatasetManifest.sourceIds,
  ...Object.keys(syntheticPublishedDatasetManifest.recordCounts),
  syntheticPublishedBundleDescriptor.id,
  syntheticPublishedBundleDescriptor.datasetVersionId,
  syntheticPublishedBundleDescriptor.fileName,
  syntheticPublishedBundleDescriptor.checksum,
];

describe('synthetic published dataset mock', () => {
  it('flags every fixture identity as synthetic', () => {
    for (const value of syntheticIdentityFields)
      expect(value).toMatch(/synthetic/i);
  });

  it('points at an unresolvable fixture location', () => {
    expect(syntheticPublishedBundleDescriptor.url).toBe(
      'https://fixtures.invalid/synthetic-fixture-bundle.json',
    );
  });

  it('serves the synthetic manifest and bundle descriptor', async () => {
    expect(
      await mockPublishedDatasetReader.getManifest('synthetic-fixture-demo'),
    ).toEqual({
      status: 'available',
      value: syntheticPublishedDatasetManifest,
    });
    expect(
      await mockPublishedDatasetReader.getBundleDescriptor(
        'synthetic-fixture-version-0',
      ),
    ).toEqual({
      status: 'available',
      value: syntheticPublishedBundleDescriptor,
    });
  });

  it('reports unknown datasets as absent instead of inventing data', async () => {
    expect(
      await mockPublishedDatasetReader.getManifest('unknown-demo'),
    ).toEqual({
      status: 'absent',
      reason: 'not-published',
    });
    expect(
      await mockPublishedDatasetReader.getBundleDescriptor('unknown'),
    ).toEqual({
      status: 'absent',
      reason: 'not-found',
    });
  });
});
