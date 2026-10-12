import { expect, it } from 'vitest';
import * as interactionDomain from '@intermed/domain';
import {
  evaluateInteractions,
  mergeProviderResults,
  type CanonicalIngredientPair,
  type InteractionEvaluation,
  type InteractionEvaluationOptions,
  type InteractionSelection,
  type MergedProviderResults,
} from '@intermed/domain';
import {
  CONTRACT_INGREDIENT_A,
  CONTRACT_INGREDIENT_B,
  CONTRACT_PAIR_AB,
  CONTRACT_REQUEST,
  CONTRACT_SELECTION,
  SYNTHETIC_RETRIEVED_AT,
  THROW_TRIGGER_SELECTION,
  createDisagreementSyntheticProvider,
  createNoRecordSyntheticProvider,
  createOfflineSyntheticProvider,
  createOutdatedSyntheticProvider,
  createPartialCoverageSyntheticProvider,
  createOnlineOnlySyntheticProvider,
  createSourceUncertainSyntheticProvider,
  createSupersededAndCurrentSyntheticProvider,
  createSupersededOnlySyntheticProvider,
  createThrowingSyntheticProvider,
  createWithdrawnOnlySyntheticProvider,
  makeSyntheticSelection,
} from './synthetic-interaction-providers';

type AssessmentInput =
  | InteractionEvaluation
  | readonly InteractionEvaluation[]
  | MergedProviderResults;

interface PairAssessment {
  readonly pair: CanonicalIngredientPair;
  readonly finding: {
    readonly documentedInteraction: boolean;
    readonly affirmedNoInteraction: boolean;
    readonly sourceSeverities: readonly {
      readonly sourceId: string;
      readonly sourceVersion: string;
      readonly recordId: string;
      readonly severityTerm?: string;
      readonly normalizedSeverity?: string;
      readonly severityMappingReviewed?: boolean;
    }[];
  };
  readonly evidence: {
    readonly evidenceConflict: boolean;
    readonly positions: readonly {
      readonly sourceId: string;
      readonly sourceVersion: string;
      readonly position:
        | 'documents-interaction'
        | 'affirms-none'
        | 'no-coverage'
        | 'unavailable';
    }[];
    readonly sourceStatedUncertainty: boolean;
    readonly evidenceLevels: readonly {
      readonly sourceId: string;
      readonly recordId: string;
      readonly evidenceLevel?: string;
    }[];
  };
  readonly currency: {
    readonly currentRecordIds: readonly string[];
    readonly historicalRecordIds: readonly string[];
    readonly outdatedRecordIds: readonly string[];
  };
  readonly coverage: {
    readonly status:
      | 'covered'
      | 'not-covered'
      | 'unsupported-context'
      | 'inputs-unresolved'
      | 'unavailable'
      | 'truncated';
    readonly coverageComplete: boolean;
    readonly reasons: readonly string[];
  };
  readonly provenance: readonly {
    readonly sourceId: string;
    readonly sourceVersion: string;
    readonly recordId: string;
    readonly datasetVersionId: string;
    readonly retrievedAt?: string;
  }[];
}

type AssessmentFunction = (
  input: AssessmentInput,
  pair: CanonicalIngredientPair,
) => PairAssessment;

const EVALUATION_OPTIONS: InteractionEvaluationOptions = {
  online: false,
  timeoutMs: 20,
  now: () => SYNTHETIC_RETRIEVED_AT,
};

const CONTRACT_PAIR_SELECTION: InteractionSelection = {
  snapshot: CONTRACT_SELECTION.snapshot,
  productIds: [],
  datasetVersionId: CONTRACT_SELECTION.datasetVersionId,
  ingredientIds: [CONTRACT_INGREDIENT_A, CONTRACT_INGREDIENT_B],
};

async function evaluate(
  provider: ReturnType<typeof createOfflineSyntheticProvider>,
  selection: InteractionSelection = CONTRACT_PAIR_SELECTION,
  overrides: Partial<InteractionEvaluationOptions> = {},
): Promise<InteractionEvaluation> {
  return evaluateInteractions(selection, provider, {
    ...EVALUATION_OPTIONS,
    ...overrides,
  });
}

function assess(
  input: AssessmentInput,
  pair: CanonicalIngredientPair,
): PairAssessment {
  const implementation = Reflect.get(
    interactionDomain,
    'assessInteractionPair',
  );
  if (typeof implementation !== 'function')
    throw new Error('assessInteractionPair export is required');
  return (implementation as AssessmentFunction)(input, pair);
}

function requestForPair(pair: CanonicalIngredientPair) {
  return {
    ...CONTRACT_REQUEST,
    ingredientIds: pair,
    pairs: [pair],
  };
}

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every(isDeeplyFrozen);
}

it('scenario 1: a current finding stays visible beside disagreeing source positions', async () => {
  const request = requestForPair(CONTRACT_PAIR_AB);
  const firstResult = await createOfflineSyntheticProvider({
    severity: 'source-stated-serious-term-alpha',
  }).evaluate(request);
  const secondResult =
    await createDisagreementSyntheticProvider().evaluate(request);
  const merged = mergeProviderResults([firstResult, secondResult]);
  const result = assess(merged, CONTRACT_PAIR_AB);

  expect(result.finding).toMatchObject({
    documentedInteraction: true,
    affirmedNoInteraction: false,
  });
  expect(result.evidence.evidenceConflict).toBe(true);
  expect(result.evidence.positions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sourceId: firstResult.sourceId,
        position: 'documents-interaction',
      }),
      expect.objectContaining({
        sourceId: secondResult.sourceId,
        position: 'documents-interaction',
      }),
    ]),
  );
  expect(result.finding.sourceSeverities).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sourceId: firstResult.sourceId,
        severityTerm: 'source-stated-serious-term-alpha',
      }),
      expect.objectContaining({
        sourceId: secondResult.sourceId,
        severityTerm: 'source-band-crimson',
      }),
    ]),
  );
  expect(
    result.finding.sourceSeverities.every(
      (severity) => severity.normalizedSeverity === undefined,
    ),
  ).toBe(true);

  const unreviewedEvaluation = await evaluate(
    createOfflineSyntheticProvider({ severity: 'source-band-amber' }),
    CONTRACT_PAIR_SELECTION,
    {
      severityMapping: {
        mappingVersion: 'synthetic-unreviewed-map-v1',
        reviewed: false,
        map: { 'source-band-amber': 'synthetic-tier-1' },
      },
    },
  );
  const unreviewedAssessment = assess(unreviewedEvaluation, CONTRACT_PAIR_AB);
  expect(unreviewedAssessment.finding.sourceSeverities).toContainEqual(
    expect.objectContaining({
      severityTerm: 'source-band-amber',
      severityMappingReviewed: false,
    }),
  );
  expect(
    unreviewedAssessment.finding.sourceSeverities[0]?.normalizedSeverity,
  ).toBeUndefined();

  const reviewedEvaluation = await evaluate(
    createOfflineSyntheticProvider({ severity: 'source-band-amber' }),
    CONTRACT_PAIR_SELECTION,
    {
      severityMapping: {
        mappingVersion: 'synthetic-reviewed-map-v1',
        reviewed: true,
        map: { 'source-band-amber': 'synthetic-tier-1' },
      },
    },
  );
  expect(
    assess(reviewedEvaluation, CONTRACT_PAIR_AB).finding.sourceSeverities,
  ).toContainEqual(
    expect.objectContaining({
      severityTerm: 'source-band-amber',
      normalizedSeverity: 'synthetic-tier-1',
      severityMappingReviewed: true,
    }),
  );
});

it('scenario 2: a withdrawn record remains history beside a current record', async () => {
  const evaluation = await evaluate(
    createSupersededAndCurrentSyntheticProvider(),
  );
  const currentRecord = evaluation.interactions[0];
  const historicalRecord = evaluation.inactiveRecords[0]?.record;
  if (!currentRecord || !historicalRecord)
    throw new Error('synthetic lifecycle records are missing');

  const result = assess(evaluation, CONTRACT_PAIR_AB);

  expect(result.finding.documentedInteraction).toBe(true);
  expect(result.currency.currentRecordIds).toContain(currentRecord.id);
  expect(result.currency.historicalRecordIds).toContain(historicalRecord.id);
  expect(result.currency.currentRecordIds).not.toContain(historicalRecord.id);
});

it('scenario 3: withdrawn and superseded records alone are history, not findings or negative findings', async () => {
  for (const provider of [
    createWithdrawnOnlySyntheticProvider(),
    createSupersededOnlySyntheticProvider(),
  ]) {
    const evaluation = await evaluate(provider);
    const historicalRecord = evaluation.inactiveRecords[0]?.record;
    if (!historicalRecord)
      throw new Error('synthetic historical record is missing');

    const result = assess(evaluation, CONTRACT_PAIR_AB);

    expect(result.finding.documentedInteraction).toBe(false);
    expect(result.finding.affirmedNoInteraction).toBe(false);
    expect(result.currency.currentRecordIds).toEqual([]);
    expect(result.currency.historicalRecordIds).toContain(historicalRecord.id);
    expect(result.coverage.status).toBe('not-covered');
    expect(result.coverage.coverageComplete).toBe(false);
  }
});

it('scenario 4: complete covered-no-record evidence supports a source-attributed negative position', async () => {
  const evaluation = await evaluate(createNoRecordSyntheticProvider());
  const result = assess(evaluation, CONTRACT_PAIR_AB);

  expect(result.finding.affirmedNoInteraction).toBe(true);
  expect(result.finding.documentedInteraction).toBe(false);
  expect(result.coverage).toMatchObject({
    status: 'covered',
    coverageComplete: true,
  });
  expect(result.evidence.positions).toHaveLength(1);
  expect(result.evidence.positions[0]?.position).toBe('affirms-none');
});

it('scenario 5: a source negative position never cancels another source current finding', async () => {
  const request = requestForPair(CONTRACT_PAIR_AB);
  const noRecordResult =
    await createNoRecordSyntheticProvider().evaluate(request);
  const documentedResult =
    await createDisagreementSyntheticProvider().evaluate(request);
  const merged = mergeProviderResults([noRecordResult, documentedResult]);
  const result = assess(merged, CONTRACT_PAIR_AB);

  expect(result.finding).toMatchObject({
    affirmedNoInteraction: false,
    documentedInteraction: true,
  });
  expect(result.evidence.evidenceConflict).toBe(true);
  expect(result.evidence.positions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sourceId: noRecordResult.sourceId,
        position: 'affirms-none',
      }),
      expect.objectContaining({
        sourceId: documentedResult.sourceId,
        position: 'documents-interaction',
      }),
    ]),
  );
});

it('scenario 6: incomplete, unresolved, unsupported, unavailable, offline, rights-blocked, and truncated coverage cannot affirm none', async () => {
  const partial = await evaluate(
    createPartialCoverageSyntheticProvider(),
    CONTRACT_SELECTION,
  );
  const missingPair = partial.evaluatedPairCoverage.find(
    (coverage) => coverage.status === 'not-covered',
  )?.pair;
  if (!missingPair) throw new Error('synthetic uncovered pair is missing');

  const unresolvedSelection = makeSyntheticSelection([
    {
      sourceProductId: 'SP-DIMENSION-A',
      displayName: 'Fictivol',
      ingredients: [
        {
          sourceIngredientId: 'AI-CONTRACT-FICTIVOLINUM',
          displayName: 'Fictivolinum',
        },
      ],
    },
    {
      sourceProductId: 'SP-DIMENSION-B',
      displayName: 'Synthetica',
      ingredients: [
        {
          sourceIngredientId: 'AI-CONTRACT-SYNTHETINIX',
          displayName: 'Synthetinix',
        },
      ],
    },
    {
      sourceProductId: 'SP-DIMENSION-UNRESOLVED',
      displayName: 'Unresolvedex',
      ingredients: [
        {
          sourceIngredientId: 'AI-UNRESOLVED-SYNTHETIC',
          displayName: 'Unresolvedium',
          mappingStatus: 'unresolved',
        },
      ],
    },
  ]);
  const unresolved = await evaluate(
    createNoRecordSyntheticProvider(),
    unresolvedSelection,
  );
  const unsupported = await evaluate(
    createNoRecordSyntheticProvider(),
    CONTRACT_SELECTION,
    {
      context: {
        requiredContextLimitations: ['synthetic-unsupported-context'],
      },
    },
  );
  const unavailableSelection: InteractionSelection = THROW_TRIGGER_SELECTION;
  const unavailable = await evaluate(
    createThrowingSyntheticProvider(),
    unavailableSelection,
  );
  const unavailablePair = unavailable.evaluatedPairCoverage[0]?.pair;
  if (!unavailablePair)
    throw new Error('synthetic unavailable pair is missing');
  const offline = await evaluate(createOnlineOnlySyntheticProvider());
  const rightsBlocked = await evaluate(
    createOfflineSyntheticProvider({ rightsStatus: 'unknown' }),
  );
  const truncated = await evaluate(
    createNoRecordSyntheticProvider(),
    CONTRACT_SELECTION,
    {
      maxPairs: 0,
    },
  );

  const cases: readonly {
    readonly evaluation: InteractionEvaluation;
    readonly pair: CanonicalIngredientPair;
    readonly status: PairAssessment['coverage']['status'];
    readonly reason?: string;
  }[] = [
    { evaluation: partial, pair: missingPair, status: 'not-covered' },
    {
      evaluation: unresolved,
      pair: CONTRACT_PAIR_AB,
      status: 'inputs-unresolved',
    },
    {
      evaluation: unsupported,
      pair: CONTRACT_PAIR_AB,
      status: 'unsupported-context',
    },
    {
      evaluation: unavailable,
      pair: unavailablePair,
      status: 'unavailable',
      reason: 'provider-error',
    },
    {
      evaluation: offline,
      pair: CONTRACT_PAIR_AB,
      status: 'unavailable',
      reason: 'online-required',
    },
    {
      evaluation: rightsBlocked,
      pair: CONTRACT_PAIR_AB,
      status: 'unavailable',
      reason: 'rights-not-permitted',
    },
    {
      evaluation: truncated,
      pair: CONTRACT_PAIR_AB,
      status: 'truncated',
      reason: 'pair-limit-exceeded',
    },
  ];

  for (const item of cases) {
    const result = assess(item.evaluation, item.pair);
    expect(result.finding.affirmedNoInteraction).toBe(false);
    expect(result.coverage.status).toBe(item.status);
    expect(result.coverage.coverageComplete).toBe(false);
    if (item.reason) expect(result.coverage.reasons).toContain(item.reason);
  }
});

it('scenario 7: source-version-mismatched records are flagged outdated and not current findings', async () => {
  const evaluation = await evaluate(createOutdatedSyntheticProvider());
  const outdatedRecord = evaluation.interactions[0];
  if (!outdatedRecord) throw new Error('synthetic outdated record is missing');

  const result = assess(evaluation, CONTRACT_PAIR_AB);

  expect(result.finding.documentedInteraction).toBe(false);
  expect(result.currency.currentRecordIds).not.toContain(outdatedRecord.id);
  expect(result.currency.outdatedRecordIds).toContain(outdatedRecord.id);
  expect(result.finding.affirmedNoInteraction).toBe(false);
});

it('scenario 8: source-stated uncertainty and evidence levels are preserved without inference', async () => {
  const uncertain = await evaluate(createSourceUncertainSyntheticProvider());
  const uncertainResult = assess(uncertain, CONTRACT_PAIR_AB);
  const record = uncertain.interactions[0];
  if (!record) throw new Error('synthetic uncertain record is missing');
  expect(uncertainResult.evidence.sourceStatedUncertainty).toBe(true);
  expect(uncertainResult.evidence.evidenceLevels).toContainEqual({
    sourceId: record.sourceId,
    recordId: record.id,
    evidenceLevel: 'source-stated-evidence-level-alpha',
  });

  const noRecord = await evaluate(createNoRecordSyntheticProvider());
  expect(
    assess(noRecord, CONTRACT_PAIR_AB).evidence.sourceStatedUncertainty,
  ).toBe(false);
});

it('scenario 9: the assessment has no safety or no-interaction wording', async () => {
  const evaluation = await evaluate(createNoRecordSyntheticProvider());
  const result = assess(evaluation, CONTRACT_PAIR_AB);

  expect(JSON.stringify(result)).not.toMatch(/\bsafe\b|\bno interaction\b/i);
});

it('scenario 10: repeated assessment is deterministic and deeply frozen', async () => {
  const evaluation = await evaluate(createNoRecordSyntheticProvider());
  const first = assess(evaluation, CONTRACT_PAIR_AB);
  const second = assess(evaluation, CONTRACT_PAIR_AB);

  expect(second).toEqual(first);
  expect(isDeeplyFrozen(first)).toBe(true);
});

it('removes the rejected single-category precedence API', () => {
  expect(
    Reflect.get(interactionDomain, 'categorizeInteractionOutcomes'),
  ).toBeUndefined();
});
