import { expect, it } from 'vitest';
import {
  canonicalPair,
  categorizeInteractionOutcomes,
  evaluateInteractions,
  mergeProviderResults,
  type CanonicalIngredientPair,
  type CategorizedInteractionOutcomes,
  type DrugInteraction,
  type InteractionDisagreement,
  type InteractionEvaluation,
  type InteractionIncompleteReason,
  type InactiveInteractionRecord,
  type UnresolvedInteractionInput,
} from '@intermed/domain';
import {
  CONTRACT_REQUEST,
  CONTRACT_SELECTION,
  SYNTHETIC_RETRIEVED_AT,
  createDisagreementSyntheticProvider,
  createNoRecordSyntheticProvider,
  createOfflineSyntheticProvider,
  createOutdatedSyntheticProvider,
  createPartialCoverageSyntheticProvider,
  createSourceUncertainSyntheticProvider,
  createSupersededOnlySyntheticProvider,
  createWithdrawnOnlySyntheticProvider,
} from './synthetic-interaction-providers';

type OutcomeCategory =
  CategorizedInteractionOutcomes['pairOutcomes'][number]['category'];

const EVALUATION_OPTIONS = {
  online: false,
  timeoutMs: 20,
  now: () => SYNTHETIC_RETRIEVED_AT,
};

async function evaluate(
  provider: ReturnType<typeof createOfflineSyntheticProvider>,
): Promise<InteractionEvaluation> {
  return evaluateInteractions(CONTRACT_SELECTION, provider, EVALUATION_OPTIONS);
}

function pairKey(pair: CanonicalIngredientPair): string {
  return JSON.stringify(canonicalPair(pair[0], pair[1]));
}

function pairForRecord(record: DrugInteraction): CanonicalIngredientPair {
  return canonicalPair(record.ingredientAId, record.ingredientBId);
}

function forPair(
  evaluation: InteractionEvaluation,
  pair: CanonicalIngredientPair,
): InteractionEvaluation {
  const key = pairKey(pair);
  const interactions = evaluation.interactions.filter(
    (record) => pairKey(pairForRecord(record)) === key,
  );
  const inactiveRecords = evaluation.inactiveRecords.filter(
    ({ record }) => pairKey(pairForRecord(record)) === key,
  );
  const coverage = evaluation.evaluatedPairCoverage.find(
    (item) => pairKey(item.pair) === key,
  );
  if (!coverage)
    throw new Error('synthetic evaluation is missing pair coverage');
  return {
    ...evaluation,
    evaluatedPairCoverage: [coverage],
    interactions,
    interactionIds: interactions.map((record) => record.id),
    inactiveRecords,
    ...(evaluation.disagreements
      ? {
          disagreements: evaluation.disagreements.filter(
            (item) => pairKey(item.pair) === key,
          ),
        }
      : {}),
  };
}

function withDisagreement(
  evaluation: InteractionEvaluation,
  pair: CanonicalIngredientPair,
): InteractionEvaluation {
  const disagreement: InteractionDisagreement = {
    pair,
    reasons: ['severity-terms-differ'],
    severityTerms: [],
  };
  return {
    ...evaluation,
    disagreements: [...(evaluation.disagreements ?? []), disagreement],
  };
}

function withInactiveRecord(
  evaluation: InteractionEvaluation,
  inactiveRecord: InactiveInteractionRecord,
): InteractionEvaluation {
  return {
    ...evaluation,
    inactiveRecords: [...evaluation.inactiveRecords, inactiveRecord],
  };
}

function withCurrentRecord(
  evaluation: InteractionEvaluation,
  record: DrugInteraction,
): InteractionEvaluation {
  const interactions = [...evaluation.interactions, record];
  return {
    ...evaluation,
    interactions,
    interactionIds: interactions.map((item) => item.id),
  };
}

function withUnreviewedInput(
  evaluation: InteractionEvaluation,
  pair: CanonicalIngredientPair,
): InteractionEvaluation {
  const incompleteReasons = new Set<InteractionIncompleteReason>(
    evaluation.incompleteReasons,
  );
  incompleteReasons.add('unresolved-inputs');
  const unresolvedInput: UnresolvedInteractionInput = {
    ingredientId: pair[0],
    reason: 'unreviewed-ingredient-mapping',
  };
  return {
    ...evaluation,
    status: 'incomplete',
    coverageComplete: false,
    incompleteReasons: [...incompleteReasons],
    unresolvedInputs: [...evaluation.unresolvedInputs, unresolvedInput],
  };
}

function withIncompleteCoverage(
  evaluation: InteractionEvaluation,
): InteractionEvaluation {
  return {
    ...evaluation,
    status: 'incomplete',
    coverageComplete: false,
    incompleteReasons: [
      ...new Set([
        ...evaluation.incompleteReasons,
        'provider-pair-coverage-incomplete' as const,
      ]),
    ],
  };
}

function outcomeFor(
  evaluation: InteractionEvaluation,
  pair: CanonicalIngredientPair,
): CategorizedInteractionOutcomes['pairOutcomes'][number] | undefined {
  return categorizeInteractionOutcomes(evaluation).pairOutcomes.find(
    (outcome) => pairKey(outcome.pair) === pairKey(pair),
  );
}

it('returns one category for each evaluated pair and preserves pair-independent notes', async () => {
  const evaluation = await evaluate(createOfflineSyntheticProvider());
  const before = structuredClone(evaluation);
  const categorized = categorizeInteractionOutcomes(evaluation);

  expect(categorized?.pairOutcomes).toHaveLength(
    evaluation.evaluatedPairCoverage.length,
  );
  expect(
    categorized?.pairOutcomes.map((outcome) => pairKey(outcome.pair)),
  ).toEqual(
    evaluation.evaluatedPairCoverage.map((coverage) => pairKey(coverage.pair)),
  );
  expect(categorized?.notes).toMatchObject({
    evaluationStatus: evaluation.status,
    incompleteReasons: evaluation.incompleteReasons,
    unresolvedInputs: evaluation.unresolvedInputs,
  });

  const repeated = categorizeInteractionOutcomes(evaluation);
  expect(evaluation).toEqual(before);
  expect(repeated).toEqual(categorized);
});

it('returns all five neutral outcome categories from synthetic evidence', async () => {
  const reportedEvaluation = await evaluate(createOfflineSyntheticProvider());
  const reportedRecord = reportedEvaluation.interactions[0];
  if (!reportedRecord) throw new Error('synthetic reported record missing');
  const pair = pairForRecord(reportedRecord);
  const noRecordEvaluation = forPair(
    await evaluate(createNoRecordSyntheticProvider()),
    pair,
  );
  const withdrawnEvaluation = forPair(
    await evaluate(createWithdrawnOnlySyntheticProvider()),
    pair,
  );
  const outdatedEvaluation = forPair(
    await evaluate(createOutdatedSyntheticProvider()),
    pair,
  );
  const uncertainEvaluation = forPair(
    await evaluate(createSourceUncertainSyntheticProvider()),
    pair,
  );
  const partialEvaluation = await evaluate(
    createPartialCoverageSyntheticProvider(),
  );
  const uncoveredCoverage = partialEvaluation.evaluatedPairCoverage.find(
    (coverage) => coverage.status === 'not-covered',
  );
  if (!uncoveredCoverage) throw new Error('synthetic uncovered pair missing');
  const unavailableEvaluation: InteractionEvaluation = {
    ...noRecordEvaluation,
    status: 'unavailable',
    coverageComplete: false,
    unavailableReason: 'synthetic-provider-unavailable',
  };

  expect(outcomeFor(forPair(reportedEvaluation, pair), pair)?.category).toBe(
    'documented-interaction',
  );
  expect(outcomeFor(noRecordEvaluation, pair)?.category).toBe(
    'evaluated-no-interaction-identified',
  );
  expect(
    outcomeFor(
      forPair(partialEvaluation, uncoveredCoverage.pair),
      uncoveredCoverage.pair,
    )?.category,
  ).toBe('insufficient-information');
  expect(outcomeFor(withdrawnEvaluation, pair)?.category).toBe(
    'inactive-or-outdated',
  );
  expect(outcomeFor(outdatedEvaluation, pair)?.category).toBe(
    'inactive-or-outdated',
  );
  expect(outcomeFor(uncertainEvaluation, pair)?.category).toBe(
    'conflicting-or-uncertain',
  );
  expect(outcomeFor(unavailableEvaluation, pair)?.category).toBe(
    'insufficient-information',
  );
});

it('uses the required neutral wording for a supported evaluated-no outcome', async () => {
  const evaluation = await evaluate(createNoRecordSyntheticProvider());
  const coverage = evaluation.evaluatedPairCoverage[0];
  if (!coverage) throw new Error('synthetic pair coverage missing');
  const result = categorizeInteractionOutcomes(
    forPair(evaluation, coverage.pair),
  );
  const outcome = result?.pairOutcomes[0];

  expect(outcome?.category).toBe('evaluated-no-interaction-identified');
  expect(outcome?.message).toBe(
    `No clinically significant interaction identified by ${coverage.sourceId} ${coverage.sourceVersion} for this evaluated pair`,
  );
  expect(JSON.stringify(result).toLowerCase()).not.toMatch(
    /\bsafe\b|\bno interaction\b/,
  );
});

it('does not label only inactive records as evaluated-no', async () => {
  const reported = await evaluate(createOfflineSyntheticProvider());
  const record = reported.interactions[0];
  if (!record) throw new Error('synthetic reported record missing');
  const pair = pairForRecord(record);
  const noRecord = forPair(
    await evaluate(createNoRecordSyntheticProvider()),
    pair,
  );
  const withdrawn = forPair(
    await evaluate(createWithdrawnOnlySyntheticProvider()),
    pair,
  );
  const superseded = forPair(
    await evaluate(createSupersededOnlySyntheticProvider()),
    pair,
  );

  expect(
    outcomeFor(
      withInactiveRecord(noRecord, withdrawn.inactiveRecords[0]!),
      pair,
    )?.category,
  ).toBe('inactive-or-outdated');
  expect(outcomeFor(withdrawn, pair)?.category).not.toBe(
    'evaluated-no-interaction-identified',
  );
  expect(outcomeFor(superseded, pair)?.category).not.toBe(
    'evaluated-no-interaction-identified',
  );
});

it('applies every declared precedence collision', async () => {
  const reported = await evaluate(createOfflineSyntheticProvider());
  const record = reported.interactions[0];
  if (!record) throw new Error('synthetic reported record missing');
  const pair = pairForRecord(record);
  const documented = forPair(reported, pair);
  const noRecord = forPair(
    await evaluate(createNoRecordSyntheticProvider()),
    pair,
  );
  const withdrawn = forPair(
    await evaluate(createWithdrawnOnlySyntheticProvider()),
    pair,
  );
  const partial = await evaluate(createPartialCoverageSyntheticProvider());
  const uncoveredCoverage = partial.evaluatedPairCoverage.find(
    (coverage) => coverage.status === 'not-covered',
  );
  if (!uncoveredCoverage) throw new Error('synthetic uncovered pair missing');
  const insufficient = forPair(partial, uncoveredCoverage.pair);
  const incompleteNoRecord = withIncompleteCoverage(noRecord);
  const unresolvedDocumented = withUnreviewedInput(documented, pair);

  const collisions: readonly {
    readonly name: string;
    readonly evaluation: InteractionEvaluation;
    readonly pair: CanonicalIngredientPair;
    readonly expected: OutcomeCategory;
  }[] = [
    {
      name: 'conflicting-or-uncertain over documented-interaction',
      evaluation: withDisagreement(documented, pair),
      pair,
      expected: 'conflicting-or-uncertain',
    },
    {
      name: 'conflicting-or-uncertain over inactive-or-outdated',
      evaluation: withDisagreement(withdrawn, pair),
      pair,
      expected: 'conflicting-or-uncertain',
    },
    {
      name: 'conflicting-or-uncertain over insufficient-information',
      evaluation: withDisagreement(insufficient, uncoveredCoverage.pair),
      pair: uncoveredCoverage.pair,
      expected: 'conflicting-or-uncertain',
    },
    {
      name: 'conflicting-or-uncertain over evaluated-no-interaction-identified',
      evaluation: withDisagreement(noRecord, pair),
      pair,
      expected: 'conflicting-or-uncertain',
    },
    {
      name: 'documented-interaction over inactive-or-outdated',
      evaluation: withInactiveRecord(documented, withdrawn.inactiveRecords[0]!),
      pair,
      expected: 'documented-interaction',
    },
    {
      name: 'documented-interaction over insufficient-information',
      evaluation: unresolvedDocumented,
      pair,
      expected: 'documented-interaction',
    },
    {
      name: 'documented-interaction over evaluated-no-interaction-identified',
      evaluation: withCurrentRecord(noRecord, record),
      pair,
      expected: 'documented-interaction',
    },
    {
      name: 'inactive-or-outdated over insufficient-information',
      evaluation: withdrawn,
      pair,
      expected: 'inactive-or-outdated',
    },
    {
      name: 'inactive-or-outdated over evaluated-no-interaction-identified',
      evaluation: withInactiveRecord(noRecord, withdrawn.inactiveRecords[0]!),
      pair,
      expected: 'inactive-or-outdated',
    },
    {
      name: 'insufficient-information over evaluated-no-interaction-identified',
      evaluation: incompleteNoRecord,
      pair,
      expected: 'insufficient-information',
    },
  ];

  for (const collision of collisions)
    expect(outcomeFor(collision.evaluation, collision.pair)?.category).toBe(
      collision.expected,
    );
});

it('classifies merged provider disagreement as conflicting-or-uncertain', async () => {
  const evaluation = await evaluate(createOfflineSyntheticProvider());
  const record = evaluation.interactions[0];
  if (!record) throw new Error('synthetic reported record missing');
  const pair = pairForRecord(record);
  const request = {
    ...CONTRACT_REQUEST,
    ingredientIds: pair,
    pairs: [pair],
  };
  const firstResult = await createOfflineSyntheticProvider().evaluate(request);
  const secondResult =
    await createDisagreementSyntheticProvider().evaluate(request);
  const merged = mergeProviderResults([firstResult, secondResult]);

  expect(merged.disagreements).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ pair, reasons: ['severity-terms-differ'] }),
    ]),
  );
  expect(
    outcomeFor(
      {
        ...forPair(evaluation, pair),
        disagreements: merged.disagreements,
      },
      pair,
    )?.category,
  ).toBe('conflicting-or-uncertain');
});

it('keeps source-stated uncertainty and unreviewed-input notes pair-independent', async () => {
  const evaluation = await evaluate(createSourceUncertainSyntheticProvider());
  const record = evaluation.interactions[0];
  if (!record) throw new Error('synthetic uncertain record missing');
  const pair = pairForRecord(record);
  const unresolved = withUnreviewedInput(
    forPair(await evaluate(createNoRecordSyntheticProvider()), pair),
    pair,
  );
  const categorized = categorizeInteractionOutcomes(unresolved);

  expect(record.sourceStatesUncertainEvidence).toBe(true);
  expect(outcomeFor(forPair(evaluation, pair), pair)?.category).toBe(
    'conflicting-or-uncertain',
  );
  expect(outcomeFor(unresolved, pair)?.category).toBe(
    'insufficient-information',
  );
  expect(categorized?.notes).toMatchObject({
    evaluationStatus: 'incomplete',
    incompleteReasons: ['unresolved-inputs'],
    unresolvedInputs: [
      {
        ingredientId: pair[0],
        reason: 'unreviewed-ingredient-mapping',
      },
    ],
  });
});
