import { expect, it } from 'vitest';
import {
  assessInteractionPair,
  INTERACTION_ASSESSMENT_LOGIC_VERSION,
  mergeProviderResults,
  type ProviderResult,
} from '@intermed/domain';
import { mustId, SOURCE_NAMESPACE } from './builders';
import {
  CONTRACT_PAIR_AB,
  CONTRACT_REQUEST,
  createDisagreementSyntheticProvider,
  createNoRecordSyntheticProvider,
  createOfflineSyntheticProvider,
} from './synthetic-interaction-providers';
import type { CanonicalIngredientPair, DataSourceId } from '@intermed/domain';

const SOURCE_S1 = mustId('DataSource', SOURCE_NAMESPACE, 'source.synthetic-s1');
const SOURCE_S2 = mustId('DataSource', SOURCE_NAMESPACE, 'source.synthetic-s2');

function requestForPair(pair: CanonicalIngredientPair) {
  return {
    ...CONTRACT_REQUEST,
    ingredientIds: pair,
    pairs: [pair],
  };
}

function cloneResult(
  base: ProviderResult,
  overrides: {
    providerId?: string;
    sourceId?: DataSourceId;
    sourceVersion?: string;
    severity?: string;
  },
): ProviderResult {
  const sourceId = overrides.sourceId ?? base.sourceId;
  const sourceVersion = overrides.sourceVersion ?? base.sourceVersion;
  return {
    ...base,
    providerId: overrides.providerId ?? base.providerId,
    sourceId,
    sourceVersion,
    records: base.records.map((record) => ({
      ...record,
      sourceId,
      sourceVersion,
      ...(overrides.severity !== undefined
        ? { severity: overrides.severity }
        : {}),
    })),
    evidence: base.evidence.map((item) => ({
      ...item,
      sourceId,
      sourceVersion,
    })),
  };
}

function wordingGuard(value: unknown): void {
  expect(JSON.stringify(value)).not.toMatch(/\bsafe\b|\bno interaction\b/i);
  expect(JSON.stringify(value)).not.toMatch(/affirm/i);
}

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every(isDeeplyFrozen);
}

it('same sourceId via two providers with different severity terms is within-source, not an evidence conflict', async () => {
  const request = requestForPair(CONTRACT_PAIR_AB);
  const base = await createOfflineSyntheticProvider().evaluate(request);
  const first = cloneResult(base, {
    providerId: 'synthetic-samesource-first',
    sourceId: SOURCE_S1,
    sourceVersion: 'synthetic-s1-v1',
    severity: 'source-band-amber',
  });
  const second = cloneResult(base, {
    providerId: 'synthetic-samesource-second',
    sourceId: SOURCE_S1,
    sourceVersion: 'synthetic-s1-v1',
    severity: 'source-band-crimson',
  });
  const merged = mergeProviderResults([first, second]);
  const result = assessInteractionPair(merged, CONTRACT_PAIR_AB);

  expect(result.finding.documentedInteraction).toBe(true);
  expect(result.evidence.evidenceConflict).toBe(false);
  expect(result.evidence.coverageDiscrepancy).toBe(false);
  expect(merged.disagreements).toEqual([]);
  expect(result.evidence.withinSourceInconsistencies).toContainEqual(
    expect.objectContaining({
      sourceId: SOURCE_S1,
      reasons: expect.arrayContaining(['severity-terms-differ']),
    }),
  );
  const mergedEntry = merged.withinSourceInconsistencies.find(
    (item) => item.sourceId === SOURCE_S1,
  );
  expect(mergedEntry?.reasons).toContain('severity-terms-differ');
  expect(mergedEntry?.entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        providerId: 'synthetic-samesource-first',
        sourceId: SOURCE_S1,
        severity: 'source-band-amber',
      }),
      expect.objectContaining({
        providerId: 'synthetic-samesource-second',
        sourceId: SOURCE_S1,
        severity: 'source-band-crimson',
      }),
    ]),
  );
  wordingGuard(result);
  wordingGuard(merged);
  expect(result.logicVersion).toBe('4.0.0');
  expect(isDeeplyFrozen(merged)).toBe(true);
  expect(isDeeplyFrozen(result)).toBe(true);
});

it('different sourceId values with different severity terms stay a cross-source evidence conflict', async () => {
  const request = requestForPair(CONTRACT_PAIR_AB);
  const base = await createOfflineSyntheticProvider().evaluate(request);
  const first = cloneResult(base, {
    providerId: 'synthetic-cross-first',
    sourceId: SOURCE_S1,
    severity: 'source-band-amber',
  });
  const secondBase =
    await createDisagreementSyntheticProvider().evaluate(request);
  const second = cloneResult(secondBase, {
    sourceId: SOURCE_S2,
    severity: 'source-band-crimson',
  });
  const merged = mergeProviderResults([first, second]);
  const result = assessInteractionPair(merged, CONTRACT_PAIR_AB);

  expect(result.finding.documentedInteraction).toBe(true);
  expect(result.evidence.evidenceConflict).toBe(true);
  expect(merged.disagreements).toHaveLength(1);
  expect(merged.disagreements[0]?.reasons).toContain('severity-terms-differ');
  wordingGuard(result);
  expect(result.logicVersion).toBe('4.0.0');
});

it('same sourceId with one reporting and one no-record provider is within-source, not a coverage discrepancy', async () => {
  const request = requestForPair(CONTRACT_PAIR_AB);
  const documentedBase =
    await createOfflineSyntheticProvider().evaluate(request);
  const documented = cloneResult(documentedBase, {
    providerId: 'synthetic-samesource-doc',
    sourceId: SOURCE_S1,
    sourceVersion: 'synthetic-s1-v1',
  });
  const noRecordBase =
    await createNoRecordSyntheticProvider().evaluate(request);
  const noRecord = cloneResult(noRecordBase, {
    providerId: 'synthetic-samesource-norec',
    sourceId: SOURCE_S1,
    sourceVersion: 'synthetic-s1-v1',
  });
  const merged = mergeProviderResults([documented, noRecord]);
  const result = assessInteractionPair(merged, CONTRACT_PAIR_AB);

  expect(result.finding.documentedInteraction).toBe(true);
  expect(result.evidence.coverageDiscrepancy).toBe(false);
  expect(result.evidence.evidenceConflict).toBe(false);
  expect(merged.coverageDiscrepancies).toEqual([]);
  expect(result.evidence.withinSourceInconsistencies).toContainEqual(
    expect.objectContaining({
      sourceId: SOURCE_S1,
      reasons: expect.arrayContaining(['reported-vs-covered-no-record']),
    }),
  );
  wordingGuard(result);
  expect(result.logicVersion).toBe('4.0.0');
});

it('different sourceId values with one documenting and one no-record source stay a coverage discrepancy', async () => {
  const request = requestForPair(CONTRACT_PAIR_AB);
  const documentedBase =
    await createOfflineSyntheticProvider().evaluate(request);
  const documented = cloneResult(documentedBase, {
    providerId: 'synthetic-cross-doc',
    sourceId: SOURCE_S1,
  });
  const noRecordBase =
    await createNoRecordSyntheticProvider().evaluate(request);
  const noRecord = cloneResult(noRecordBase, {
    providerId: 'synthetic-cross-norec',
    sourceId: SOURCE_S2,
  });
  const merged = mergeProviderResults([documented, noRecord]);
  const result = assessInteractionPair(merged, CONTRACT_PAIR_AB);

  expect(result.finding.documentedInteraction).toBe(true);
  expect(result.evidence.coverageDiscrepancy).toBe(true);
  expect(result.evidence.evidenceConflict).toBe(false);
  expect(merged.coverageDiscrepancies).toHaveLength(1);
  wordingGuard(result);
  expect(result.logicVersion).toBe('4.0.0');
});

it('mixed: S1 documents and has no record via two providers plus S2 no record gives a cross-source discrepancy and an S1 within-source entry', async () => {
  const request = requestForPair(CONTRACT_PAIR_AB);
  const documentedBase =
    await createOfflineSyntheticProvider().evaluate(request);
  const s1Documented = cloneResult(documentedBase, {
    providerId: 'synthetic-mixed-s1-doc',
    sourceId: SOURCE_S1,
    sourceVersion: 'synthetic-s1-v1',
  });
  const noRecordBase =
    await createNoRecordSyntheticProvider().evaluate(request);
  const s1NoRecord = cloneResult(noRecordBase, {
    providerId: 'synthetic-mixed-s1-norec',
    sourceId: SOURCE_S1,
    sourceVersion: 'synthetic-s1-v1',
  });
  const s2NoRecord = cloneResult(noRecordBase, {
    providerId: 'synthetic-mixed-s2-norec',
    sourceId: SOURCE_S2,
    sourceVersion: 'synthetic-s2-v1',
  });
  const merged = mergeProviderResults([s1Documented, s1NoRecord, s2NoRecord]);
  const result = assessInteractionPair(merged, CONTRACT_PAIR_AB);

  expect(result.finding.documentedInteraction).toBe(true);
  expect(result.evidence.coverageDiscrepancy).toBe(true);
  expect(result.evidence.evidenceConflict).toBe(false);
  expect(merged.coverageDiscrepancies).toHaveLength(1);
  const discrepancy = merged.coverageDiscrepancies[0];
  expect(discrepancy?.documentingSources.map((s) => s.sourceId)).toEqual([
    SOURCE_S1,
  ]);
  expect(discrepancy?.noRecordSources.map((s) => s.sourceId)).toEqual([
    SOURCE_S2,
  ]);
  expect(result.evidence.withinSourceInconsistencies).toContainEqual(
    expect.objectContaining({
      sourceId: SOURCE_S1,
      reasons: expect.arrayContaining(['reported-vs-covered-no-record']),
    }),
  );
  wordingGuard(result);
  expect(result.logicVersion).toBe('4.0.0');
});

it('same sourceId with different sourceVersion values is the same source', async () => {
  const request = requestForPair(CONTRACT_PAIR_AB);
  const base = await createOfflineSyntheticProvider().evaluate(request);
  const first = cloneResult(base, {
    providerId: 'synthetic-version-first',
    sourceId: SOURCE_S1,
    sourceVersion: 'synthetic-s1-v1',
    severity: 'source-band-amber',
  });
  const second = cloneResult(base, {
    providerId: 'synthetic-version-second',
    sourceId: SOURCE_S1,
    sourceVersion: 'synthetic-s1-v2',
    severity: 'source-band-crimson',
  });
  const merged = mergeProviderResults([first, second]);
  const result = assessInteractionPair(merged, CONTRACT_PAIR_AB);

  expect(result.evidence.evidenceConflict).toBe(false);
  expect(merged.disagreements).toEqual([]);
  expect(result.evidence.withinSourceInconsistencies).toContainEqual(
    expect.objectContaining({ sourceId: SOURCE_S1 }),
  );

  const noRecordBase =
    await createNoRecordSyntheticProvider().evaluate(request);
  const noRecord = cloneResult(noRecordBase, {
    providerId: 'synthetic-version-norec',
    sourceId: SOURCE_S1,
    sourceVersion: 'synthetic-s1-v2',
  });
  const documentedV1 = cloneResult(base, {
    providerId: 'synthetic-version-doc',
    sourceId: SOURCE_S1,
    sourceVersion: 'synthetic-s1-v1',
  });
  const versionMerged = mergeProviderResults([documentedV1, noRecord]);
  const versionResult = assessInteractionPair(versionMerged, CONTRACT_PAIR_AB);
  expect(versionResult.evidence.coverageDiscrepancy).toBe(false);
  expect(versionMerged.coverageDiscrepancies).toEqual([]);
  wordingGuard(result);
  wordingGuard(versionResult);
  expect(result.logicVersion).toBe('4.0.0');
  expect(versionResult.logicVersion).toBe('4.0.0');
});

it('provider order never changes source-identity results', async () => {
  const request = requestForPair(CONTRACT_PAIR_AB);
  const base = await createOfflineSyntheticProvider().evaluate(request);
  const s1a = cloneResult(base, {
    providerId: 'synthetic-order-a',
    sourceId: SOURCE_S1,
    severity: 'source-band-amber',
  });
  const s1b = cloneResult(base, {
    providerId: 'synthetic-order-b',
    sourceId: SOURCE_S1,
    severity: 'source-band-crimson',
  });
  const noRecordBase =
    await createNoRecordSyntheticProvider().evaluate(request);
  const s2 = cloneResult(noRecordBase, {
    providerId: 'synthetic-order-s2',
    sourceId: SOURCE_S2,
  });
  const forward = mergeProviderResults([s1a, s1b, s2]);
  const reversed = mergeProviderResults([s2, s1b, s1a]);
  expect(reversed.disagreements).toEqual(forward.disagreements);
  expect(reversed.coverageDiscrepancies).toEqual(forward.coverageDiscrepancies);
  expect(reversed.withinSourceInconsistencies).toEqual(
    forward.withinSourceInconsistencies,
  );
  const forwardAssessment = assessInteractionPair(forward, CONTRACT_PAIR_AB);
  const reversedAssessment = assessInteractionPair(reversed, CONTRACT_PAIR_AB);
  expect(reversedAssessment).toEqual(forwardAssessment);
  expect(forwardAssessment.logicVersion).toBe('4.0.0');
  expect(isDeeplyFrozen(forward.withinSourceInconsistencies)).toBe(true);
  expect(isDeeplyFrozen(forwardAssessment)).toBe(true);
});

it('merge level keeps same-source differences out of cross-source lists', async () => {
  const request = requestForPair(CONTRACT_PAIR_AB);
  const base = await createOfflineSyntheticProvider().evaluate(request);
  const first = cloneResult(base, {
    providerId: 'synthetic-merge-first',
    sourceId: SOURCE_S1,
    severity: 'source-band-amber',
  });
  const second = cloneResult(base, {
    providerId: 'synthetic-merge-second',
    sourceId: SOURCE_S1,
    severity: 'source-band-crimson',
  });
  const noRecordBase =
    await createNoRecordSyntheticProvider().evaluate(request);
  const noRecord = cloneResult(noRecordBase, {
    providerId: 'synthetic-merge-norec',
    sourceId: SOURCE_S1,
  });
  const merged = mergeProviderResults([first, second, noRecord]);

  expect(merged.disagreements).toEqual([]);
  expect(merged.coverageDiscrepancies).toEqual([]);
  expect(merged.withinSourceInconsistencies).toHaveLength(1);
  const entry = merged.withinSourceInconsistencies[0];
  expect(entry?.sourceId).toBe(SOURCE_S1);
  expect(entry?.reasons).toEqual(
    expect.arrayContaining([
      'severity-terms-differ',
      'reported-vs-covered-no-record',
    ]),
  );
  for (const disagreement of merged.disagreements) {
    const ids = disagreement.severityTerms.map((term) => term.sourceId);
    expect(new Set(ids).size).toBeGreaterThan(1);
  }
  wordingGuard(merged);
  expect(INTERACTION_ASSESSMENT_LOGIC_VERSION).toBe('4.0.0');
});

it('a merged within-source entry is reported only when the validated evidence for the pair shows it', async () => {
  const request = requestForPair(CONTRACT_PAIR_AB);
  const documented = cloneResult(
    await createDisagreementSyntheticProvider().evaluate(request),
    { sourceId: SOURCE_S1 },
  );
  const noRecord = cloneResult(
    await createNoRecordSyntheticProvider().evaluate(request),
    { sourceId: SOURCE_S2 },
  );
  const merged = mergeProviderResults([documented, noRecord]);
  expect(merged.withinSourceInconsistencies).toEqual([]);

  // A merge-level entry for a present source that the validated records and
  // positions do not support must not surface in the assessment.
  const tampered = {
    ...merged,
    withinSourceInconsistencies: [
      {
        pair: CONTRACT_PAIR_AB,
        sourceId: SOURCE_S1,
        reasons: ['severity-terms-differ' as const],
        entries: [
          {
            providerId: documented.providerId,
            sourceId: SOURCE_S1,
            sourceVersion: documented.sourceVersion,
            status: 'reported' as const,
            severity: 'stale-term',
          },
        ],
      },
    ],
  };
  const result = assessInteractionPair(tampered, CONTRACT_PAIR_AB);

  expect(result.evidence.withinSourceInconsistencies).toEqual([]);
  expect(result.finding.documentedInteraction).toBe(true);
  expect(result.evidence.coverageDiscrepancy).toBe(true);
  wordingGuard(result);
});

it('merge counts a current record without a coverage row as reporting for within-source checks', async () => {
  const request = requestForPair(CONTRACT_PAIR_AB);
  const documented = cloneResult(
    await createDisagreementSyntheticProvider().evaluate(request),
    { providerId: 'synthetic-s1-adapter-a', sourceId: SOURCE_S1 },
  );
  const recordOnly = { ...documented, pairCoverage: [] };
  const noRecord = cloneResult(
    await createNoRecordSyntheticProvider().evaluate(request),
    { providerId: 'synthetic-s1-adapter-b', sourceId: SOURCE_S1 },
  );

  for (const merged of [
    mergeProviderResults([recordOnly, noRecord]),
    mergeProviderResults([noRecord, recordOnly]),
  ]) {
    const result = assessInteractionPair(merged, CONTRACT_PAIR_AB);
    const mergeReasons = merged.withinSourceInconsistencies.flatMap(
      (entry) => entry.reasons,
    );
    const assessmentReasons =
      result.evidence.withinSourceInconsistencies.flatMap(
        (entry) => entry.reasons,
      );
    expect(assessmentReasons.includes('reported-vs-covered-no-record')).toBe(
      mergeReasons.includes('reported-vs-covered-no-record'),
    );
    expect(result.evidence.coverageDiscrepancy).toBe(false);
    wordingGuard(result);
  }
});
