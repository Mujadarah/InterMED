import { expect, it } from 'vitest';
import * as interactionDomain from '@intermed/domain';
import {
  evaluateInteractions,
  INTERACTION_ASSESSMENT_LOGIC_VERSION,
  mergeProviderResults,
  type CanonicalIngredientPair,
  type DrugInteractionProvider,
  type InteractionEvaluation,
  type InteractionEvaluationOptions,
  type InteractionSelection,
  type MergedProviderResults,
  type ProviderResult,
} from '@intermed/domain';
import { mustId, SOURCE_KEY, SOURCE_NAMESPACE } from './builders';
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
  createSupersededOnlySyntheticProvider,
  createThrowingSyntheticProvider,
  createWithdrawnAndCurrentSyntheticProvider,
  createWithdrawnOnlySyntheticProvider,
  makeSyntheticSelection,
} from './synthetic-interaction-providers';

type AssessmentInput =
  | InteractionEvaluation
  | readonly InteractionEvaluation[]
  | MergedProviderResults;

interface PairAssessment {
  readonly pair: CanonicalIngredientPair;
  readonly logicVersion: string;
  readonly finding: {
    readonly documentedInteraction: boolean;
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
    readonly coverageDiscrepancy: boolean;
    readonly positions: readonly {
      readonly sourceId: string;
      readonly sourceVersion: string;
      readonly position:
        | 'documents-interaction'
        | 'no-record-in-coverage'
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

it('does not flag severity differences between current records from one source', async () => {
  const evaluation = await evaluate(
    createOfflineSyntheticProvider({ severity: 'source-band-amber' }),
  );
  const [firstRecord] = evaluation.interactions;
  if (!firstRecord)
    throw new Error('synthetic current interaction record is missing');
  const secondRecord = {
    ...firstRecord,
    id: `${firstRecord.id}-context-specific`,
    severity: 'source-band-cobalt',
    contextLimitations: ['synthetic-second-context'],
    evidenceIds: [],
  };
  const evaluationWithContextRecord = {
    ...evaluation,
    interactions: [...evaluation.interactions, secondRecord],
  };

  const result = assess(evaluationWithContextRecord, CONTRACT_PAIR_AB);

  expect(result.evidence.evidenceConflict).toBe(false);
  expect(result.finding.sourceSeverities).toHaveLength(2);
  expect(result.finding.sourceSeverities).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sourceId: firstRecord.sourceId,
        recordId: firstRecord.id,
        severityTerm: 'source-band-amber',
      }),
      expect.objectContaining({
        sourceId: firstRecord.sourceId,
        recordId: secondRecord.id,
        severityTerm: 'source-band-cobalt',
      }),
    ]),
  );
});

it('flags severity differences between current records from different sources', async () => {
  const firstEvaluation = await evaluate(
    createOfflineSyntheticProvider({ severity: 'source-band-amber' }),
  );
  const secondEvaluation = await evaluate(
    createDisagreementSyntheticProvider(),
  );
  const firstRecord = firstEvaluation.interactions[0];
  const secondRecord = secondEvaluation.interactions[0];
  if (!firstRecord || !secondRecord)
    throw new Error('synthetic cross-source records are missing');
  expect(firstRecord.sourceId).not.toBe(secondRecord.sourceId);

  const result = assess([firstEvaluation, secondEvaluation], CONTRACT_PAIR_AB);

  expect(result.evidence.evidenceConflict).toBe(true);
  expect(result.finding.sourceSeverities).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sourceId: firstRecord.sourceId,
        recordId: firstRecord.id,
        severityTerm: 'source-band-amber',
      }),
      expect.objectContaining({
        sourceId: secondRecord.sourceId,
        recordId: secondRecord.id,
        severityTerm: 'source-band-crimson',
      }),
    ]),
  );
});

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
  });
  expect(result.finding).not.toHaveProperty('affirmedNoInteraction');
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
    createWithdrawnAndCurrentSyntheticProvider(),
  );
  const currentRecord = evaluation.interactions[0];
  const historicalRecord = evaluation.inactiveRecords[0]?.record;
  if (!currentRecord || !historicalRecord)
    throw new Error('synthetic lifecycle records are missing');
  expect(historicalRecord.recordStatus).toBe('withdrawn');

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
    expect(result.finding).not.toHaveProperty('affirmedNoInteraction');
    expect(result.currency.currentRecordIds).toEqual([]);
    expect(result.currency.historicalRecordIds).toContain(historicalRecord.id);
    expect(result.coverage.status).toBe('not-covered');
    expect(result.coverage.coverageComplete).toBe(false);
  }
});

it("scenario 4: complete covered-no-record coverage is reported as no record in that source's evaluated coverage, never as a negative finding", async () => {
  const evaluation = await evaluate(createNoRecordSyntheticProvider());
  const result = assess(evaluation, CONTRACT_PAIR_AB);

  expect(result.finding.documentedInteraction).toBe(false);
  expect(result.finding).not.toHaveProperty('affirmedNoInteraction');
  expect(result.coverage).toMatchObject({
    status: 'covered',
    coverageComplete: true,
  });
  expect(result.evidence.positions).toHaveLength(1);
  expect(result.evidence.positions[0]?.position).toBe('no-record-in-coverage');
});

it('scenario 5: a no-record source position never cancels another source current finding', async () => {
  const request = requestForPair(CONTRACT_PAIR_AB);
  const noRecordResult =
    await createNoRecordSyntheticProvider().evaluate(request);
  const documentedResult =
    await createDisagreementSyntheticProvider().evaluate(request);
  const merged = mergeProviderResults([noRecordResult, documentedResult]);
  const result = assess(merged, CONTRACT_PAIR_AB);

  expect(result.finding).toMatchObject({
    documentedInteraction: true,
  });
  expect(result.finding).not.toHaveProperty('affirmedNoInteraction');
  // A coverage discrepancy is not a clinical evidence conflict: absence of a
  // record in B is neutral and never evidence against A's documented finding.
  expect(result.evidence.evidenceConflict).toBe(false);
  expect(result.evidence.coverageDiscrepancy).toBe(true);
  expect(result.evidence.positions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sourceId: noRecordResult.sourceId,
        position: 'no-record-in-coverage',
      }),
      expect.objectContaining({
        sourceId: documentedResult.sourceId,
        position: 'documents-interaction',
      }),
    ]),
  );
  expect(result.provenance).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sourceId: documentedResult.sourceId,
        sourceVersion: documentedResult.sourceVersion,
      }),
    ]),
  );
  expect(merged.disagreements).toEqual([]);
  expect(merged.coverageDiscrepancies).toHaveLength(1);
  expect(merged.coverageDiscrepancies[0]?.pair).toEqual(CONTRACT_PAIR_AB);
  expect(JSON.stringify(result)).not.toMatch(/\bsafe\b|\bno interaction\b/i);
  expect(JSON.stringify(result)).not.toMatch(/affirm/i);
  expect(result.logicVersion).toBe('4.0.0');
});

it('scenario 5: two documenting sources with the same term plus a no-record source stay conflict-free', async () => {
  const request = requestForPair(CONTRACT_PAIR_AB);
  const firstDocumented = await createOfflineSyntheticProvider({
    providerId: 'synthetic-scenario5-first',
    sourceVersion: 'synthetic-scenario5-v1',
    severity: 'source-band-amber',
  }).evaluate(request);
  const secondDocumented = await createOfflineSyntheticProvider({
    providerId: 'synthetic-scenario5-second',
    sourceVersion: 'synthetic-scenario5-v1',
    severity: 'source-band-amber',
  }).evaluate(request);
  const noRecordResult = await createNoRecordSyntheticProvider({
    sourceId: mustId(
      'DataSource',
      SOURCE_NAMESPACE,
      'source.synthetic-scenario5-no-record',
    ),
  }).evaluate(request);
  const merged = mergeProviderResults([
    firstDocumented,
    secondDocumented,
    noRecordResult,
  ]);
  const result = assess(merged, CONTRACT_PAIR_AB);

  expect(result.finding.documentedInteraction).toBe(true);
  expect(result.evidence.evidenceConflict).toBe(false);
  expect(result.evidence.coverageDiscrepancy).toBe(true);
  expect(merged.disagreements).toEqual([]);
  expect(merged.coverageDiscrepancies).toHaveLength(1);
  expect(JSON.stringify(result)).not.toMatch(/\bsafe\b|\bno interaction\b/i);
  expect(JSON.stringify(result)).not.toMatch(/affirm/i);
  expect(result.logicVersion).toBe('4.0.0');
});

it('scenario 5: differing source severity terms stay a clinical conflict, with or without a no-record source', async () => {
  const request = requestForPair(CONTRACT_PAIR_AB);
  const amberResult = await createOfflineSyntheticProvider({
    severity: 'source-stated-serious-term-alpha',
  }).evaluate(request);
  const crimsonResult =
    await createDisagreementSyntheticProvider().evaluate(request);
  expect(amberResult.sourceId).not.toBe(crimsonResult.sourceId);

  const conflicting = assess(
    mergeProviderResults([amberResult, crimsonResult]),
    CONTRACT_PAIR_AB,
  );
  expect(conflicting.finding.documentedInteraction).toBe(true);
  expect(conflicting.evidence.evidenceConflict).toBe(true);
  expect(conflicting.evidence.coverageDiscrepancy).toBe(false);
  expect(conflicting.logicVersion).toBe('4.0.0');

  const noRecordResult =
    await createNoRecordSyntheticProvider().evaluate(request);
  const conflictingWithNoRecord = assess(
    mergeProviderResults([amberResult, crimsonResult, noRecordResult]),
    CONTRACT_PAIR_AB,
  );
  expect(conflictingWithNoRecord.finding.documentedInteraction).toBe(true);
  expect(conflictingWithNoRecord.evidence.evidenceConflict).toBe(true);
  expect(conflictingWithNoRecord.evidence.coverageDiscrepancy).toBe(true);
  expect(conflictingWithNoRecord.logicVersion).toBe('4.0.0');

  for (const assessment of [conflicting, conflictingWithNoRecord]) {
    expect(JSON.stringify(assessment)).not.toMatch(
      /\bsafe\b|\bno interaction\b/i,
    );
    expect(JSON.stringify(assessment)).not.toMatch(/affirm/i);
  }
});

it('scenario 5: two documenting sources without a no-record source have no coverage discrepancy', async () => {
  const request = requestForPair(CONTRACT_PAIR_AB);
  const amberResult = await createOfflineSyntheticProvider({
    severity: 'source-stated-serious-term-alpha',
  }).evaluate(request);
  const crimsonResult =
    await createDisagreementSyntheticProvider().evaluate(request);
  const merged = mergeProviderResults([amberResult, crimsonResult]);
  const result = assess(merged, CONTRACT_PAIR_AB);

  expect(result.finding.documentedInteraction).toBe(true);
  expect(result.evidence.coverageDiscrepancy).toBe(false);
  expect(result.evidence.evidenceConflict).toBe(true);
  expect(merged.coverageDiscrepancies).toEqual([]);
  expect(result.logicVersion).toBe('4.0.0');
});

it('scenario 5: coverage-only pairs never appear in clinical disagreements and order does not matter', async () => {
  const request = requestForPair(CONTRACT_PAIR_AB);
  const noRecordResult =
    await createNoRecordSyntheticProvider().evaluate(request);
  const documentedResult =
    await createDisagreementSyntheticProvider().evaluate(request);

  const forward = mergeProviderResults([noRecordResult, documentedResult]);
  const reversed = mergeProviderResults([documentedResult, noRecordResult]);
  expect(forward.disagreements).toEqual([]);
  expect(reversed.disagreements).toEqual([]);
  expect(forward.coverageDiscrepancies).toEqual(reversed.coverageDiscrepancies);
  expect(forward.coverageDiscrepancies).toHaveLength(1);
  expect(forward.coverageDiscrepancies[0]).toMatchObject({
    documentingSources: [
      {
        providerId: documentedResult.providerId,
        sourceId: documentedResult.sourceId,
        sourceVersion: documentedResult.sourceVersion,
      },
    ],
    noRecordSources: [
      {
        providerId: noRecordResult.providerId,
        sourceId: noRecordResult.sourceId,
        sourceVersion: noRecordResult.sourceVersion,
      },
    ],
  });

  const forwardAssessment = assess(forward, CONTRACT_PAIR_AB);
  const reversedAssessment = assess(reversed, CONTRACT_PAIR_AB);
  expect(reversedAssessment).toEqual(forwardAssessment);
  expect(forwardAssessment.evidence.evidenceConflict).toBe(false);
  expect(forwardAssessment.evidence.coverageDiscrepancy).toBe(true);
  expect(forwardAssessment.logicVersion).toBe('4.0.0');
  expect(Object.isFrozen(forward.coverageDiscrepancies)).toBe(true);
  expect(isDeeplyFrozen(forwardAssessment)).toBe(true);
});

const UNRESOLVED_SELECTION: InteractionSelection = makeSyntheticSelection([
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

interface Scenario6Case {
  readonly name: string;
  readonly status: PairAssessment['coverage']['status'];
  readonly reason?: string;
  readonly load: () => Promise<{
    evaluation: InteractionEvaluation;
    pair: CanonicalIngredientPair;
  }>;
}

/**
 * One row per way a pair can lack complete coverage, with the status and the
 * reason code that must accompany it.
 */
const SCENARIO_6_CASES: Scenario6Case[] = [
  {
    name: 'incomplete pair coverage',
    status: 'not-covered',
    load: async () => {
      const evaluation = await evaluate(
        createPartialCoverageSyntheticProvider(),
        CONTRACT_SELECTION,
      );
      const pair = evaluation.evaluatedPairCoverage.find(
        (coverage) => coverage.status === 'not-covered',
      )?.pair;
      if (!pair) throw new Error('synthetic uncovered pair is missing');
      return { evaluation, pair };
    },
  },
  {
    name: 'unresolved inputs',
    status: 'inputs-unresolved',
    load: async () => ({
      evaluation: await evaluate(
        createNoRecordSyntheticProvider(),
        UNRESOLVED_SELECTION,
      ),
      pair: CONTRACT_PAIR_AB,
    }),
  },
  {
    name: 'unsupported context',
    status: 'unsupported-context',
    load: async () => ({
      evaluation: await evaluate(
        createNoRecordSyntheticProvider(),
        CONTRACT_SELECTION,
        {
          context: {
            requiredContextLimitations: ['synthetic-unsupported-context'],
          },
        },
      ),
      pair: CONTRACT_PAIR_AB,
    }),
  },
  {
    name: 'provider error',
    status: 'unavailable',
    reason: 'provider-error',
    load: async () => {
      const evaluation = await evaluate(
        createThrowingSyntheticProvider(),
        THROW_TRIGGER_SELECTION,
      );
      const pair = evaluation.evaluatedPairCoverage[0]?.pair;
      if (!pair) throw new Error('synthetic unavailable pair is missing');
      return { evaluation, pair };
    },
  },
  {
    name: 'offline access',
    status: 'unavailable',
    reason: 'online-required',
    load: async () => ({
      evaluation: await evaluate(createOnlineOnlySyntheticProvider()),
      pair: CONTRACT_PAIR_AB,
    }),
  },
  {
    name: 'rights not permitted',
    status: 'unavailable',
    reason: 'rights-not-permitted',
    load: async () => ({
      evaluation: await evaluate(
        createOfflineSyntheticProvider({ rightsStatus: 'unknown' }),
      ),
      pair: CONTRACT_PAIR_AB,
    }),
  },
  {
    name: 'truncated pair limit',
    status: 'truncated',
    reason: 'pair-limit-exceeded',
    load: async () => ({
      evaluation: await evaluate(
        createNoRecordSyntheticProvider(),
        CONTRACT_SELECTION,
        { maxPairs: 0 },
      ),
      pair: CONTRACT_PAIR_AB,
    }),
  },
];

it.each(SCENARIO_6_CASES)(
  'scenario 6: $name cannot affirm none',
  async ({ load, status, reason }) => {
    const { evaluation, pair } = await load();
    const result = assess(evaluation, pair);

    expect(result.finding).not.toHaveProperty('affirmedNoInteraction');
    expect(result.coverage.status).toBe(status);
    expect(result.coverage.coverageComplete).toBe(false);
    if (reason) expect(result.coverage.reasons).toContain(reason);
  },
);

it('scenario 7: source-version-mismatched records are flagged outdated and not current findings', async () => {
  const evaluation = await evaluate(createOutdatedSyntheticProvider());
  const outdatedRecord = evaluation.interactions[0];
  if (!outdatedRecord) throw new Error('synthetic outdated record is missing');

  const result = assess(evaluation, CONTRACT_PAIR_AB);

  expect(result.finding.documentedInteraction).toBe(false);
  expect(result.currency.currentRecordIds).not.toContain(outdatedRecord.id);
  expect(result.currency.outdatedRecordIds).toContain(outdatedRecord.id);
  expect(result.finding).not.toHaveProperty('affirmedNoInteraction');
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

it('scenario 9: the assessment has no safety, no-interaction, or affirmative-negative wording', async () => {
  const noRecordEvaluation = await evaluate(createNoRecordSyntheticProvider());
  const documentedEvaluation = await evaluate(createOfflineSyntheticProvider());
  const request = requestForPair(CONTRACT_PAIR_AB);
  const noRecordResult =
    await createNoRecordSyntheticProvider().evaluate(request);
  const documentedResult =
    await createDisagreementSyntheticProvider().evaluate(request);
  const conflicting = assess(
    mergeProviderResults([noRecordResult, documentedResult]),
    CONTRACT_PAIR_AB,
  );
  const historicalEvaluation = await evaluate(
    createWithdrawnOnlySyntheticProvider(),
  );
  const unavailableEvaluation = await evaluate(
    createThrowingSyntheticProvider(),
    THROW_TRIGGER_SELECTION,
  );

  const assessments = [
    assess(noRecordEvaluation, CONTRACT_PAIR_AB),
    assess(documentedEvaluation, CONTRACT_PAIR_AB),
    conflicting,
    assess(historicalEvaluation, CONTRACT_PAIR_AB),
    assess(
      unavailableEvaluation,
      unavailableEvaluation.evaluatedPairCoverage[0]?.pair ?? CONTRACT_PAIR_AB,
    ),
  ];

  for (const assessment of assessments) {
    expect(JSON.stringify(assessment)).not.toMatch(
      /\bsafe\b|\bno interaction\b/i,
    );
    expect(JSON.stringify(assessment)).not.toMatch(/affirm/i);
    expect(assessment).not.toHaveProperty('affirmedNoInteraction');
    expect(assessment.finding).not.toHaveProperty('affirmedNoInteraction');
  }
});

it('every assessment carries the assessment logic version', async () => {
  expect(INTERACTION_ASSESSMENT_LOGIC_VERSION).toBe('4.0.0');
  const evaluation = await evaluate(createNoRecordSyntheticProvider());
  const request = requestForPair(CONTRACT_PAIR_AB);
  const documentedResult =
    await createDisagreementSyntheticProvider().evaluate(request);
  const malformed = {
    ...documentedResult,
    records: null,
  } as unknown as ProviderResult;
  const merged = mergeProviderResults([
    await createNoRecordSyntheticProvider().evaluate(request),
    documentedResult,
  ]);
  const malformedMerged = mergeProviderResults([
    malformed,
    await createOfflineSyntheticProvider().evaluate(request),
  ]);

  const assessments = [
    assess(evaluation, CONTRACT_PAIR_AB),
    assess(merged, CONTRACT_PAIR_AB),
    assess(malformedMerged, CONTRACT_PAIR_AB),
  ];

  for (const assessment of assessments) {
    expect(assessment.logicVersion).toBe(INTERACTION_ASSESSMENT_LOGIC_VERSION);
    expect(assessment.logicVersion).toBe('4.0.0');
  }
  expect(isDeeplyFrozen(assessments[0])).toBe(true);
});

it('scenario 10: repeated assessment is deterministic and deeply frozen', async () => {
  const evaluation = await evaluate(createNoRecordSyntheticProvider());
  const first = assess(evaluation, CONTRACT_PAIR_AB);
  const second = assess(evaluation, CONTRACT_PAIR_AB);

  expect(second).toEqual(first);
  expect(isDeeplyFrozen(first)).toBe(true);
});

it('scenario 11: a malformed provider result makes the pair unavailable instead of throwing', async () => {
  const request = requestForPair(CONTRACT_PAIR_AB);
  const documented =
    await createDisagreementSyntheticProvider().evaluate(request);
  const valid = await createOfflineSyntheticProvider().evaluate(request);
  const malformed = {
    ...documented,
    records: null,
  } as unknown as ProviderResult;
  const unidentifiable = { status: 'available' } as unknown as ProviderResult;

  const result = assess(
    mergeProviderResults([malformed, valid]),
    CONTRACT_PAIR_AB,
  );

  expect(result.coverage.status).toBe('unavailable');
  expect(result.coverage.coverageComplete).toBe(false);
  expect(result.coverage.reasons).toContain('provider-result-invalid');
  expect(result.finding).not.toHaveProperty('affirmedNoInteraction');
  expect(result.finding.documentedInteraction).toBe(true);
  expect(result.evidence.positions).toEqual(
    expect.arrayContaining([
      {
        sourceId: valid.sourceId,
        sourceVersion: valid.sourceVersion,
        position: 'documents-interaction',
      },
      {
        sourceId: documented.sourceId,
        sourceVersion: documented.sourceVersion,
        position: 'unavailable',
      },
    ]),
  );
  expect(
    result.provenance.every((entry) => entry.sourceId !== documented.sourceId),
  ).toBe(true);
  expect(isDeeplyFrozen(result)).toBe(true);

  const unidentified = assess(
    mergeProviderResults([unidentifiable, valid]),
    CONTRACT_PAIR_AB,
  );
  expect(unidentified.coverage.status).toBe('unavailable');
  expect(unidentified.coverage.reasons).toContain('provider-result-invalid');
  expect(unidentified.finding).not.toHaveProperty('affirmedNoInteraction');
  expect(unidentified.finding.documentedInteraction).toBe(true);
  expect(unidentified.evidence.positions).toEqual([
    {
      sourceId: valid.sourceId,
      sourceVersion: valid.sourceVersion,
      position: 'documents-interaction',
    },
  ]);

  const [documentedRecord] = documented.records;
  if (!documentedRecord)
    throw new Error('synthetic documented record is missing');
  const invalidField = {
    ...documented,
    records: [{ ...documentedRecord, severity: 42 }],
  } as unknown as ProviderResult;
  const fieldResult = assess(
    mergeProviderResults([invalidField, valid]),
    CONTRACT_PAIR_AB,
  );
  expect(fieldResult.coverage.status).toBe('unavailable');
  expect(fieldResult.coverage.reasons).toContain('provider-result-invalid');
  expect(fieldResult.finding).not.toHaveProperty('affirmedNoInteraction');
  expect(fieldResult.finding.documentedInteraction).toBe(true);
});

it('scenario 12: a stale uncovered pair reports only real limitation codes', async () => {
  const partial = await evaluate(
    createPartialCoverageSyntheticProvider(),
    CONTRACT_SELECTION,
  );
  const missingPair = partial.evaluatedPairCoverage.find(
    (coverage) => coverage.status === 'not-covered',
  )?.pair;
  if (!missingPair) throw new Error('synthetic uncovered pair is missing');

  expect(JSON.stringify(partial)).not.toContain('synthetic-partial-coverage');
  const result = assess(partial, missingPair);
  expect(result.coverage.status).toBe('not-covered');
  expect(result.coverage.coverageComplete).toBe(false);
  expect(result.coverage.reasons).toEqual(
    expect.arrayContaining([
      'provider-pair-coverage-incomplete',
      'stale-source-data',
    ]),
  );
  expect(result.coverage.reasons).not.toContain('synthetic-partial-coverage');
});

it('scenario 13: only a valid current record reports a documenting position', async () => {
  const outdatedEvaluation = await evaluate(createOutdatedSyntheticProvider());
  const outdatedRecord = outdatedEvaluation.interactions[0];
  if (!outdatedRecord) throw new Error('synthetic outdated record is missing');
  const noRecordEvaluation = await evaluate(createNoRecordSyntheticProvider());

  const outdatedResult = assess(
    [outdatedEvaluation, noRecordEvaluation],
    CONTRACT_PAIR_AB,
  );

  expect(
    outdatedResult.evidence.positions.some(
      (entry) => entry.position === 'documents-interaction',
    ),
  ).toBe(false);
  expect(outdatedResult.evidence.positions).toContainEqual({
    sourceId: outdatedRecord.sourceId,
    sourceVersion: outdatedRecord.sourceVersion,
    position: 'no-coverage',
  });
  expect(outdatedResult.currency.outdatedRecordIds).toContain(
    outdatedRecord.id,
  );
  expect(outdatedResult.currency.currentRecordIds).toEqual([]);
  expect(outdatedResult.finding.documentedInteraction).toBe(false);
  expect(outdatedResult.finding).not.toHaveProperty('affirmedNoInteraction');
  expect(outdatedResult.coverage.coverageComplete).toBe(false);

  const mismatchBase = createOfflineSyntheticProvider();
  const mismatchedProvider: DrugInteractionProvider = {
    describe: () => mismatchBase.describe(),
    evaluate: async (request) => {
      const result = await mismatchBase.evaluate(request);
      return {
        ...result,
        records: result.records.map((record) => ({
          ...record,
          datasetVersionId: mustId(
            'DatasetVersion',
            SOURCE_KEY,
            'synthetic-other-generation',
          ),
        })),
      };
    },
  };
  const mismatchedEvaluation = await evaluate(mismatchedProvider);
  const mismatchedRecord = mismatchedEvaluation.interactions[0];
  if (!mismatchedRecord)
    throw new Error('synthetic mismatched record is missing');

  const withdrawnResult = assess(
    [mismatchedEvaluation, noRecordEvaluation],
    CONTRACT_PAIR_AB,
  );

  expect(
    withdrawnResult.evidence.positions.some(
      (entry) => entry.position === 'documents-interaction',
    ),
  ).toBe(false);
  expect(withdrawnResult.evidence.positions).toContainEqual({
    sourceId: mismatchedRecord.sourceId,
    sourceVersion: mismatchedRecord.sourceVersion,
    position: 'no-coverage',
  });
  expect(withdrawnResult.currency.currentRecordIds).toEqual([]);
  expect(withdrawnResult.finding.documentedInteraction).toBe(false);
  expect(withdrawnResult.finding).not.toHaveProperty('affirmedNoInteraction');
  expect(withdrawnResult.coverage.coverageComplete).toBe(false);
});

it('scenario 5: a reporting source without a valid current record beside a no-record source is not a coverage discrepancy', async () => {
  const request = requestForPair(CONTRACT_PAIR_AB);
  // The provider still reports the pair, but its only record is withdrawn, so
  // the source has no valid current record documenting the interaction.
  const reportedBase =
    await createDisagreementSyntheticProvider().evaluate(request);
  const withdrawnResult = {
    ...reportedBase,
    records: reportedBase.records.map((record) => ({
      ...record,
      recordStatus: 'withdrawn' as const,
      statusChangedAt: record.lastUpdated,
    })),
  };
  const noRecordResult =
    await createNoRecordSyntheticProvider().evaluate(request);

  for (const merged of [
    mergeProviderResults([withdrawnResult, noRecordResult]),
    mergeProviderResults([noRecordResult, withdrawnResult]),
  ]) {
    const result = assess(merged, CONTRACT_PAIR_AB);

    expect(
      result.evidence.positions.some(
        (entry) => entry.position === 'documents-interaction',
      ),
    ).toBe(false);
    expect(result.finding.documentedInteraction).toBe(false);
    expect(result.evidence.coverageDiscrepancy).toBe(false);
    expect(result.evidence.evidenceConflict).toBe(false);
  }
});

it('scenario 14: an unavailable evaluation without coverage rows reports unavailable', async () => {
  const throwingDescribe: DrugInteractionProvider = {
    describe: () => {
      throw new Error('synthetic description failure');
    },
    evaluate: () => new Promise(() => {}),
  };
  const invalidDescriptor: DrugInteractionProvider = {
    describe: () =>
      ({ providerId: 'synthetic-descriptor' }) as unknown as ReturnType<
        DrugInteractionProvider['describe']
      >,
    evaluate: () => new Promise(() => {}),
  };

  const cases = [
    [throwingDescribe, 'provider-description-error'],
    [invalidDescriptor, 'provider-descriptor-invalid'],
  ] as const;

  for (const [provider, reason] of cases) {
    const evaluation = await evaluate(provider);
    expect(evaluation.status).toBe('unavailable');
    expect(evaluation.evaluatedPairCoverage).toEqual([]);
    expect(evaluation.sourceVersions).toEqual([]);

    const result = assess(evaluation, CONTRACT_PAIR_AB);
    expect(result.coverage.status).toBe('unavailable');
    expect(result.coverage.coverageComplete).toBe(false);
    expect(result.coverage.reasons).toContain(reason);
    expect(result.finding.documentedInteraction).toBe(false);
    expect(result.finding).not.toHaveProperty('affirmedNoInteraction');
  }
});

it('removes the rejected single-category precedence API', () => {
  expect(
    Reflect.get(interactionDomain, 'categorizeInteractionOutcomes'),
  ).toBeUndefined();
});
