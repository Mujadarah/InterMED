import { describe, expect, it } from 'vitest';
import {
  canonicalPair,
  evaluateInteractions,
  type DrugInteractionProvider,
  type ProviderRequest,
} from '@intermed/domain';
import {
  CONTRACT_CONTEXT,
  CONTRACT_INGREDIENT_A,
  CONTRACT_INGREDIENT_B,
  CONTRACT_REQUEST,
  CONTRACT_SELECTION,
  SYNTHETIC_RETRIEVED_AT,
  pairKeyForTest,
} from './synthetic-interaction-providers';

const EVALUATION_OPTIONS = {
  online: true,
  context: CONTRACT_CONTEXT,
  timeoutMs: 20,
  now: () => SYNTHETIC_RETRIEVED_AT,
};

export function describeProviderContract(
  name: string,
  factory: () => DrugInteractionProvider,
): void {
  describe('provider contract: ' + name, () => {
    it('describes a stable provider, source, availability, capability, and rights status', () => {
      const descriptor = factory().describe();
      expect(descriptor.providerId).toBeTruthy();
      expect(descriptor.sourceId).toBeTruthy();
      expect(descriptor.sourceVersion).toBeTruthy();
      expect(['offline-licensed', 'online-only']).toContain(
        descriptor.availability,
      );
      expect(descriptor.capabilities.evaluableContextLimitations).toEqual(
        expect.any(Array),
      );
      expect(['permitted', 'not-permitted', 'unknown']).toContain(
        descriptor.rightsStatus,
      );
    });

    it('returns coverage for each canonical requested pair and no outside pair', async () => {
      const provider = factory();
      const result = await provider.evaluate(CONTRACT_REQUEST);
      const requested = new Set(CONTRACT_REQUEST.pairs.map(pairKeyForTest));
      expect(result.retrievedAt).toBe(SYNTHETIC_RETRIEVED_AT);
      expect(['available', 'unavailable']).toContain(result.status);
      expect(result.pairCoverage).toHaveLength(CONTRACT_REQUEST.pairs.length);
      expect(
        result.pairCoverage.map((coverage) => pairKeyForTest(coverage.pair)),
      ).toEqual(CONTRACT_REQUEST.pairs.map(pairKeyForTest));
      for (const coverage of result.pairCoverage)
        expect(requested.has(pairKeyForTest(coverage.pair))).toBe(true);
      for (const record of result.records) {
        const pair = canonicalPair(record.ingredientAId, record.ingredientBId);
        expect(requested.has(pairKeyForTest(pair))).toBe(true);
        expect(pair).toEqual([record.ingredientAId, record.ingredientBId]);
      }
    });

    it('preserves source severity terms and leaves absent source fields absent', async () => {
      const provider = factory();
      const result = await provider.evaluate(CONTRACT_REQUEST);
      const sourceRecord = result.records[0];

      const evaluated = await evaluateInteractions(
        CONTRACT_SELECTION,
        provider,
        EVALUATION_OPTIONS,
      );
      const evaluatedRecord = evaluated.interactions[0];
      if (sourceRecord) {
        expect(sourceRecord.severity).toMatch(/^source-band-|^tier-/);
        expect(evaluatedRecord?.severity).toBe(sourceRecord.severity);
      } else expect(evaluated.interactions).toEqual([]);
      for (const key of [
        'normalizedSeverity',
        'severityMappingVersion',
        'severityMappingReviewed',
        'clinicalEffect',
        'mechanism',
        'evidenceLevel',
        'management',
        'monitoring',
        'alternatives',
        'sourceInteractionId',
        'upstreamUpdatedAt',
      ])
        expect(Object.hasOwn(sourceRecord ?? {}, key)).toBe(false);
      for (const key of [
        'sourceReferenceId',
        'title',
        'organization',
        'publicationDate',
        'urlOrDoi',
        'evidenceLevel',
        'sourceTerminology',
      ])
        expect(Object.hasOwn(result.evidence[0] ?? {}, key)).toBe(false);
    });

    it('links every evidence identifier to its interaction record', async () => {
      const result = await factory().evaluate(CONTRACT_REQUEST);
      const evidenceById = new Map(
        result.evidence.map((item) => [item.id, item]),
      );
      for (const record of result.records) {
        for (const evidenceId of record.evidenceIds)
          expect(evidenceById.get(evidenceId)?.interactionId).toBe(record.id);
      }
      for (const evidence of result.evidence)
        expect(
          result.records.some((record) => record.id === evidence.interactionId),
        ).toBe(true);
    });

    it('uses canonical pairs independent of argument order', () => {
      expect(
        canonicalPair(CONTRACT_INGREDIENT_A, CONTRACT_INGREDIENT_B),
      ).toEqual(canonicalPair(CONTRACT_INGREDIENT_B, CONTRACT_INGREDIENT_A));
    });

    it('maps provider errors and timeouts to unavailable results', async () => {
      const descriptor = factory().describe();
      const throwingProvider: DrugInteractionProvider = {
        describe: () => descriptor,
        evaluate: () => Promise.reject(new Error('synthetic failure detail')),
      };
      const thrown = await evaluateInteractions(
        CONTRACT_SELECTION,
        throwingProvider,
        EVALUATION_OPTIONS,
      );
      expect(thrown.status).toBe('unavailable');
      expect(thrown.unavailableReason).toBe('provider-error');
      expect(JSON.stringify(thrown)).not.toContain('synthetic failure detail');

      const waitingProvider: DrugInteractionProvider = {
        describe: () => descriptor,
        evaluate: () => new Promise(() => {}),
      };
      const timedOut = await evaluateInteractions(
        CONTRACT_SELECTION,
        waitingProvider,
        { ...EVALUATION_OPTIONS, timeoutMs: 1 },
      );
      expect(timedOut.status).toBe('unavailable');
      expect(timedOut.unavailableReason).toBe('provider-timeout');
    });

    it('respects offline provider availability', async () => {
      const provider = factory();
      const descriptor = provider.describe();
      const result = await evaluateInteractions(CONTRACT_SELECTION, provider, {
        ...EVALUATION_OPTIONS,
        online: false,
      });
      if (descriptor.availability === 'online-only') {
        expect(result.status).toBe('unavailable');
        expect(result.unavailableReason).toBe('online-required');
      } else expect(result.status).not.toBe('unavailable');
    });

    it('receives canonical ingredient ids, context, online mode, and the pinned dataset version', async () => {
      let observed: ProviderRequest | undefined;
      const provider = factory();
      const wrapper: DrugInteractionProvider = {
        describe: () => provider.describe(),
        evaluate: (request) => {
          observed = request;
          return provider.evaluate(request);
        },
      };
      await evaluateInteractions(
        CONTRACT_SELECTION,
        wrapper,
        EVALUATION_OPTIONS,
      );
      expect(observed?.ingredientIds).toHaveLength(3);
      expect(observed?.pairs).toHaveLength(3);
      expect(observed?.datasetVersionId).toBe(
        CONTRACT_SELECTION.datasetVersionId,
      );
      expect(observed?.context).toEqual(CONTRACT_CONTEXT);
      expect(observed?.online).toBe(true);
      expect(observed?.signal?.aborted).toBe(false);
    });

    it('exposes explicit coverage completeness on every evaluation', async () => {
      const evaluated = await evaluateInteractions(
        CONTRACT_SELECTION,
        factory(),
        EVALUATION_OPTIONS,
      );
      expect(typeof evaluated.coverageComplete).toBe('boolean');
      if (evaluated.status === 'no-reported-record')
        expect(evaluated.coverageComplete).toBe(true);
      if (
        evaluated.status === 'unavailable' ||
        evaluated.status === 'incomplete'
      )
        expect(evaluated.coverageComplete).toBe(false);
      if (evaluated.coverageComplete) {
        expect(evaluated.incompleteReasons).toEqual([]);
        expect(evaluated.evaluatedPairCoverage.length).toBeGreaterThan(0);
        for (const coverage of evaluated.evaluatedPairCoverage)
          expect(['reported', 'covered-no-record']).toContain(coverage.status);
      }
    });
  });
}
