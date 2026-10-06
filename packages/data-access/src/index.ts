import type { BootstrapInfoProvider } from '@intermed/domain';

export const mockBootstrapProvider: BootstrapInfoProvider = {
  getInfo: () => ({
    label: 'Contributor mock mode',
    referenceData: 'unavailable',
  }),
};

export {
  syntheticMedicationFixture,
  syntheticSwapFixture,
} from './synthetic-fixture';
export { createInMemoryMedicationCatalogueSource } from './in-memory-catalogue-source';
export { validateSyntheticSource } from './validate-synthetic-source';
export type {
  SourceValidationIssue,
  SyntheticMedicationSource,
  SyntheticValidationResult,
} from './validate-synthetic-source';
export {
  mockPublishedDatasetReader,
  syntheticPublishedBundleDescriptor,
  syntheticPublishedDatasetManifest,
} from './published-dataset-mock';
export { createAppwritePublishedDatasetReader } from './appwrite-published-dataset-reader';
export type {
  AppwritePublishedDatasetReaderOptions,
  FetchLike,
  FetchLikeOptions,
  FetchLikeResponse,
} from './appwrite-published-dataset-reader';
