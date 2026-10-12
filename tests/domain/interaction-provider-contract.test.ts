import { describeProviderContract } from './interaction-provider-contract';
import {
  createNoRecordSyntheticProvider,
  createOfflineSyntheticProvider,
  createOnlineOnlySyntheticProvider,
  createPartialCoverageSyntheticProvider,
  createSecondVocabularySyntheticProvider,
  createThrowingSyntheticProvider,
  createTimeoutSyntheticProvider,
} from './synthetic-interaction-providers';

describeProviderContract('offline licensed', createOfflineSyntheticProvider);
describeProviderContract('online only', createOnlineOnlySyntheticProvider);
describeProviderContract(
  'partial coverage',
  createPartialCoverageSyntheticProvider,
);
describeProviderContract('provider errors', createThrowingSyntheticProvider);
describeProviderContract('provider timeouts', createTimeoutSyntheticProvider);
describeProviderContract(
  'second source severity vocabulary',
  createSecondVocabularySyntheticProvider,
);
describeProviderContract(
  'covered pair without a record',
  createNoRecordSyntheticProvider,
);
