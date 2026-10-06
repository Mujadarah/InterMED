import type { BootstrapInfoProvider } from '@intermed/domain';

export const mockBootstrapProvider: BootstrapInfoProvider = {
  getInfo: () => ({
    label: 'Contributor mock mode',
    referenceData: 'unavailable',
  }),
};

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
