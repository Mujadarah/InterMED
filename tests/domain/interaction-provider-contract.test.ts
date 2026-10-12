import { expect, it } from 'vitest';
import { evaluateInteractions } from '@intermed/domain';
import { describeProviderContract } from './interaction-provider-contract';
import {
  CONTRACT_REQUEST,
  CONTRACT_SELECTION,
  createNoRecordSyntheticProvider,
  createOfflineSyntheticProvider,
  createOnlineOnlySyntheticProvider,
  createPartialCoverageSyntheticProvider,
  createOutdatedSyntheticProvider,
  createDisagreementSyntheticProvider,
  createSecondVocabularySyntheticProvider,
  createThrowingSyntheticProvider,
  createTimeoutSyntheticProvider,
  SYNTHETIC_RETRIEVED_AT,
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
  'disagreement source',
  createDisagreementSyntheticProvider,
);
describeProviderContract(
  'covered pair without a record',
  createNoRecordSyntheticProvider,
);

it('flags record source versions that differ from the provider descriptor', async () => {
  const provider = createOutdatedSyntheticProvider();
  const descriptor = provider.describe();
  const providerResult = await provider.evaluate(CONTRACT_REQUEST);
  const sourceRecord = providerResult.records[0];
  expect(sourceRecord).toBeDefined();
  expect(sourceRecord?.sourceVersion).not.toBe(descriptor.sourceVersion);

  const evaluation = await evaluateInteractions(CONTRACT_SELECTION, provider, {
    online: true,
    timeoutMs: 20,
    now: () => SYNTHETIC_RETRIEVED_AT,
  });

  expect(evaluation.coverageComplete).toBe(false);
  expect(evaluation.incompleteReasons).toContain(
    'outdated-record-source-version',
  );
  expect(evaluation.interactions[0]).toMatchObject({
    recordStatus: 'current',
    isOutdated: true,
    sourceVersion: sourceRecord?.sourceVersion,
  });
});
