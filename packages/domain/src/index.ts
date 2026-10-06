export interface BootstrapInfo {
  readonly label: string;
  readonly referenceData: 'unavailable';
}

export interface BootstrapInfoProvider {
  getInfo(): BootstrapInfo;
}

export type {
  PublishedBundleDescriptor,
  PublishedDatasetAbsent,
  PublishedDatasetAbsentReason,
  PublishedDatasetManifest,
  PublishedDatasetRead,
  PublishedDatasetReader,
  PublishedDatasetUnavailable,
  PublishedDatasetUnavailableReason,
} from './published-dataset';
