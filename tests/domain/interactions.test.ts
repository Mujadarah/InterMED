import { expect, it } from 'vitest';
import {
  canonicalPair,
  evaluateInteractions,
  mergeProviderResults,
  uniquePairs,
  type DrugInteractionProvider,
  type InteractionEvaluationOptions,
  type ProviderResult,
} from '@intermed/domain';
import {
  CONTRACT_INGREDIENT_A,
  CONTRACT_INGREDIENT_B,
  CONTRACT_INGREDIENT_C,
  CONTRACT_REQUEST,
  SYNTHETIC_RETRIEVED_AT,
  createNoRecordSyntheticProvider,
  createOfflineSyntheticProvider,
  createOnlineOnlySyntheticProvider,
  createPartialCoverageSyntheticProvider,
  createSecondVocabularySyntheticProvider,
  createThrowingSyntheticProvider,
  createTimeoutSyntheticProvider,
  makeSyntheticSelection,
} from './synthetic-interaction-providers';

function options(
  overrides: Partial<InteractionEvaluationOptions> = {},
): InteractionEvaluationOptions {
  return {
    online: false,
    context: { requiredContextLimitations: [] },
    timeoutMs: 20,
    now: () => SYNTHETIC_RETRIEVED_AT,
    ...overrides,
  };
}

it('canonicalizes pairs and returns the full unique pair set without self-pairs', () => {
  const forward = uniquePairs(
    [
      CONTRACT_INGREDIENT_A,
      CONTRACT_INGREDIENT_B,
      CONTRACT_INGREDIENT_A,
      CONTRACT_INGREDIENT_C,
    ],
    { maxPairs: 3 },
  );
  const reversed = uniquePairs(
    [CONTRACT_INGREDIENT_C, CONTRACT_INGREDIENT_A, CONTRACT_INGREDIENT_B],
    { maxPairs: 3 },
  );
  expect(canonicalPair(CONTRACT_INGREDIENT_A, CONTRACT_INGREDIENT_B)).toEqual(
    canonicalPair(CONTRACT_INGREDIENT_B, CONTRACT_INGREDIENT_A),
  );
  expect(forward.status).toBe('ready');
  expect(reversed.status).toBe('ready');
  if (forward.status !== 'ready' || reversed.status !== 'ready') return;
  expect(forward.ingredientCount).toBe(3);
  expect(forward.pairCount).toBe(3);
  expect(forward.pairs).toEqual(reversed.pairs);
  expect(forward.pairs.every(([left, right]) => left !== right)).toBe(true);
});

it('returns an explicit pair-limit outcome without truncating the pair set', () => {
  const result = uniquePairs(
    [CONTRACT_INGREDIENT_A, CONTRACT_INGREDIENT_B, CONTRACT_INGREDIENT_C],
    { maxPairs: 2 },
  );
  expect(result).toEqual({
    status: 'too-many-pairs',
    ingredientCount: 3,
    pairCount: 3,
    maxPairs: 2,
    pairs: [],
  });
});

it('reports a source record while preserving its exact source severity vocabulary', async () => {
  const selection = makeSyntheticSelection([
    {
      sourceProductId: 'SP-REPORTED-FICTIVOL',
      displayName: 'Fictivol',
      ingredients: [
        {
          sourceIngredientId: 'AI-REPORTED-FICTIVOLINUM',
          displayName: 'Fictivolinum',
        },
      ],
    },
    {
      sourceProductId: 'SP-REPORTED-PLACEBEX',
      displayName: 'Placebex',
      ingredients: [
        {
          sourceIngredientId: 'AI-REPORTED-PLACEBEXIUM',
          displayName: 'Placebexium',
        },
      ],
    },
  ]);
  const provider = createOfflineSyntheticProvider();
  const result = await evaluateInteractions(selection, provider, options());
  expect(result.status).toBe('reported');
  expect(result.interactions).toHaveLength(1);
  expect(result.interactions[0]?.severity).toBe('source-band-amber');
  expect(result.interactions[0]).not.toHaveProperty('normalizedSeverity');
  expect(result.interactionIds).toEqual([result.interactions[0]?.id]);
  expect(result.sourceVersions).toContainEqual({
    providerId: 'synthetic-offline-provider',
    sourceId: result.interactions[0]?.sourceId,
    sourceVersion: 'synthetic-interactions-v1',
  });
});

it('uses no-reported-record only when every requested pair is explicitly covered without records', async () => {
  const selection = makeSyntheticSelection([
    {
      sourceProductId: 'SP-COVERED-FICTIVOL',
      displayName: 'Fictivol',
      ingredients: [
        {
          sourceIngredientId: 'AI-COVERED-FICTIVOLINUM',
          displayName: 'Fictivolinum',
        },
      ],
    },
    {
      sourceProductId: 'SP-COVERED-SYNTHETICA',
      displayName: 'Synthetica',
      ingredients: [
        {
          sourceIngredientId: 'AI-COVERED-SYNTHETINIX',
          displayName: 'Synthetinix',
        },
      ],
    },
  ]);
  const result = await evaluateInteractions(
    selection,
    createNoRecordSyntheticProvider(),
    options(),
  );
  expect(result.status).toBe('no-reported-record');
  expect(result.coverageComplete).toBe(true);
  expect(result.evaluatedPairCoverage).toHaveLength(1);
  expect(result.evaluatedPairCoverage[0]?.status).toBe('covered-no-record');
  expect(result.interactions).toEqual([]);
});

it('marks unresolved ingredients incomplete and does not guess their identity', async () => {
  const selection = makeSyntheticSelection([
    {
      sourceProductId: 'SP-UNRESOLVED-FICTIVOL',
      displayName: 'Fictivol',
      ingredients: [
        {
          sourceIngredientId: 'AI-UNRESOLVED-FICTIVOLINUM',
          displayName: 'Fictivolinum',
        },
      ],
    },
    {
      sourceProductId: 'SP-UNRESOLVED-PLACEBEX',
      displayName: 'Placebex',
      ingredients: [
        {
          sourceIngredientId: 'AI-UNRESOLVED-UNKNOWN',
          displayName: 'Unmapped fictional input',
          mappingStatus: 'unresolved',
        },
      ],
    },
    {
      sourceProductId: 'SP-UNRESOLVED-SYNTHETICA',
      displayName: 'Synthetica',
      ingredients: [
        {
          sourceIngredientId: 'AI-UNRESOLVED-SYNTHETINIX',
          displayName: 'Synthetinix',
        },
      ],
    },
  ]);
  const result = await evaluateInteractions(
    selection,
    createNoRecordSyntheticProvider(),
    options(),
  );
  expect(result.status).toBe('incomplete');
  expect(result.coverageComplete).toBe(false);
  expect(
    result.unresolvedInputs.some(
      (input) => input.reason === 'unresolved-mapping',
    ),
  ).toBe(true);
  expect(result.evaluatedIngredientIds).toHaveLength(2);
});

it('expands a combination product while retaining its product-to-ingredient mapping', async () => {
  const selection = makeSyntheticSelection([
    {
      sourceProductId: 'SP-COMBINATION-FICTIVOL',
      displayName: 'Fictivol Combination',
      ingredients: [
        {
          sourceIngredientId: 'AI-COMBO-FICTIVOLINUM',
          displayName: 'Fictivolinum',
        },
        {
          sourceIngredientId: 'AI-COMBO-SYNTHETINIX',
          displayName: 'Synthetinix',
        },
      ],
    },
  ]);
  const result = await evaluateInteractions(
    selection,
    createOfflineSyntheticProvider(),
    options(),
  );
  expect(result.selectedProductToIngredientMappings).toEqual([
    {
      productId: selection.productIds[0],
      ingredientIds: expect.arrayContaining([
        result.evaluatedIngredientIds[0],
        result.evaluatedIngredientIds[1],
      ]),
    },
  ]);
  expect(result.evaluatedIngredientIds).toHaveLength(2);
  expect(result.evaluatedPairCoverage).toHaveLength(1);
});

it('reports duplicate exposure separately and never creates a self-pair', async () => {
  const selection = makeSyntheticSelection([
    {
      sourceProductId: 'SP-DUPLICATE-FICTIVOL',
      displayName: 'Fictivol',
      ingredients: [
        {
          sourceIngredientId: 'AI-DUPLICATE-FICTIVOLINUM',
          displayName: 'Fictivolinum',
        },
      ],
    },
    {
      sourceProductId: 'SP-DUPLICATE-PLACEBEX',
      displayName: 'Placebex',
      ingredients: [
        {
          sourceIngredientId: 'AI-DUPLICATE-FICTIVOLINUM',
          displayName: 'Fictivolinum',
        },
      ],
    },
    {
      sourceProductId: 'SP-DUPLICATE-SYNTHETICA',
      displayName: 'Synthetica',
      ingredients: [
        {
          sourceIngredientId: 'AI-DUPLICATE-SYNTHETINIX',
          displayName: 'Synthetinix',
        },
      ],
    },
  ]);
  const result = await evaluateInteractions(
    selection,
    createOfflineSyntheticProvider(),
    options(),
  );
  expect(result.duplicateExposure).toHaveLength(1);
  expect(result.duplicateExposure[0]?.productIds).toHaveLength(2);
  expect(result.evaluatedPairCoverage).toHaveLength(1);
  expect(
    result.evaluatedPairCoverage.every(({ pair }) => pair[0] !== pair[1]),
  ).toBe(true);
});

it('keeps stale or partial pair coverage visible alongside reported records', async () => {
  const selection = makeSyntheticSelection([
    {
      sourceProductId: 'SP-PARTIAL-FICTIVOL',
      displayName: 'Fictivol',
      ingredients: [
        {
          sourceIngredientId: 'AI-PARTIAL-FICTIVOLINUM',
          displayName: 'Fictivolinum',
        },
      ],
    },
    {
      sourceProductId: 'SP-PARTIAL-PLACEBEX',
      displayName: 'Placebex',
      ingredients: [
        {
          sourceIngredientId: 'AI-PARTIAL-PLACEBEXIUM',
          displayName: 'Placebexium',
        },
      ],
    },
    {
      sourceProductId: 'SP-PARTIAL-SYNTHETICA',
      displayName: 'Synthetica',
      ingredients: [
        {
          sourceIngredientId: 'AI-PARTIAL-SYNTHETINIX',
          displayName: 'Synthetinix',
        },
      ],
    },
  ]);
  const result = await evaluateInteractions(
    selection,
    createPartialCoverageSyntheticProvider(),
    options(),
  );
  expect(result.status).toBe('reported');
  expect(result.interactions).toHaveLength(1);
  expect(result.coverageComplete).toBe(false);
  expect(
    result.evaluatedPairCoverage.some((item) => item.status === 'not-covered'),
  ).toBe(true);
  expect(result.evaluatedPairCoverage.some((item) => item.stale === true)).toBe(
    true,
  );
});

it('returns unavailable when provider rights are not permitted or online access is required', async () => {
  let rightsProviderCalled = false;
  const rightsBase = createOfflineSyntheticProvider({
    rightsStatus: 'unknown',
  });
  const rightsProvider: DrugInteractionProvider = {
    describe: () => rightsBase.describe(),
    evaluate: (request) => {
      rightsProviderCalled = true;
      return rightsBase.evaluate(request);
    },
  };
  const selection = makeSyntheticSelection([
    {
      sourceProductId: 'SP-RIGHTS-FICTIVOL',
      displayName: 'Fictivol',
      ingredients: [
        {
          sourceIngredientId: 'AI-RIGHTS-FICTIVOLINUM',
          displayName: 'Fictivolinum',
        },
      ],
    },
    {
      sourceProductId: 'SP-RIGHTS-PLACEBEX',
      displayName: 'Placebex',
      ingredients: [
        {
          sourceIngredientId: 'AI-RIGHTS-PLACEBEXIUM',
          displayName: 'Placebexium',
        },
      ],
    },
  ]);
  const rightsResult = await evaluateInteractions(
    selection,
    rightsProvider,
    options(),
  );
  expect(rightsResult.status).toBe('unavailable');
  expect(rightsResult.unavailableReason).toBe('rights-not-permitted');
  expect(rightsProviderCalled).toBe(false);

  const onlineResult = await evaluateInteractions(
    selection,
    createOnlineOnlySyntheticProvider(),
    options({ online: false }),
  );
  expect(onlineResult.status).toBe('unavailable');
  expect(onlineResult.unavailableReason).toBe('online-required');
});

it('maps thrown and timed-out provider calls to unavailable without leaking exceptions', async () => {
  const throwingSelection = makeSyntheticSelection([
    {
      sourceProductId: 'SP-THROW-FICTIVOL',
      displayName: 'Fictivol',
      ingredients: [
        {
          sourceIngredientId: 'AI-SYNTHETIC-THROW-TRIGGER',
          displayName: 'Fictivolinum',
        },
      ],
    },
    {
      sourceProductId: 'SP-THROW-PLACEBEX',
      displayName: 'Placebex',
      ingredients: [
        {
          sourceIngredientId: 'AI-THROW-PLACEBEXIUM',
          displayName: 'Placebexium',
        },
      ],
    },
  ]);
  const thrown = await evaluateInteractions(
    throwingSelection,
    createThrowingSyntheticProvider(),
    options(),
  );
  expect(thrown.status).toBe('unavailable');
  expect(thrown.unavailableReason).toBe('provider-error');
  expect(JSON.stringify(thrown)).not.toContain(
    'synthetic provider failure detail',
  );

  const timeoutSelection = makeSyntheticSelection([
    {
      sourceProductId: 'SP-TIMEOUT-FICTIVOL',
      displayName: 'Fictivol',
      ingredients: [
        {
          sourceIngredientId: 'AI-SYNTHETIC-TIMEOUT-TRIGGER',
          displayName: 'Fictivolinum',
        },
      ],
    },
    {
      sourceProductId: 'SP-TIMEOUT-PLACEBEX',
      displayName: 'Placebex',
      ingredients: [
        {
          sourceIngredientId: 'AI-TIMEOUT-PLACEBEXIUM',
          displayName: 'Placebexium',
        },
      ],
    },
  ]);
  const timedOut = await evaluateInteractions(
    timeoutSelection,
    createTimeoutSyntheticProvider(),
    options({ timeoutMs: 1 }),
  );
  expect(timedOut.status).toBe('unavailable');
  expect(timedOut.unavailableReason).toBe('provider-timeout');
});

it('marks unsupported context limitations incomplete without calling an incapable provider', async () => {
  let called = false;
  const base = createOfflineSyntheticProvider({
    evaluableContextLimitations: ['synthetic-route-context'],
  });
  const provider: DrugInteractionProvider = {
    describe: () => base.describe(),
    evaluate: (request) => {
      called = true;
      return base.evaluate(request);
    },
  };
  const selection = makeSyntheticSelection([
    {
      sourceProductId: 'SP-CONTEXT-FICTIVOL',
      displayName: 'Fictivol',
      ingredients: [
        {
          sourceIngredientId: 'AI-CONTEXT-FICTIVOLINUM',
          displayName: 'Fictivolinum',
        },
      ],
    },
    {
      sourceProductId: 'SP-CONTEXT-SYNTHETICA',
      displayName: 'Synthetica',
      ingredients: [
        {
          sourceIngredientId: 'AI-CONTEXT-SYNTHETINIX',
          displayName: 'Synthetinix',
        },
      ],
    },
  ]);
  const result = await evaluateInteractions(
    selection,
    provider,
    options({
      context: { requiredContextLimitations: ['synthetic-unhandled-context'] },
    }),
  );
  expect(result.status).toBe('incomplete');
  expect(result.evaluatedPairCoverage[0]?.status).toBe('unsupported-context');
  expect(called).toBe(false);
});

it('applies only explicit severity mappings and flags unreviewed mappings', async () => {
  const selection = makeSyntheticSelection([
    {
      sourceProductId: 'SP-SEVERITY-FICTIVOL',
      displayName: 'Fictivol',
      ingredients: [
        {
          sourceIngredientId: 'AI-SEVERITY-FICTIVOLINUM',
          displayName: 'Fictivolinum',
        },
      ],
    },
    {
      sourceProductId: 'SP-SEVERITY-PLACEBEX',
      displayName: 'Placebex',
      ingredients: [
        {
          sourceIngredientId: 'AI-SEVERITY-PLACEBEXIUM',
          displayName: 'Placebexium',
        },
      ],
    },
  ]);
  const provider = createOfflineSyntheticProvider();
  const mapped = await evaluateInteractions(
    selection,
    provider,
    options({
      severityMapping: {
        mappingVersion: 'synthetic-map-v1',
        reviewed: false,
        map: { 'source-band-amber': 'synthetic-tier-1' },
      },
    }),
  );
  expect(mapped.interactions[0]?.severity).toBe('source-band-amber');
  expect(mapped.interactions[0]?.normalizedSeverity).toBe('synthetic-tier-1');
  expect(mapped.interactions[0]?.severityMappingVersion).toBe(
    'synthetic-map-v1',
  );
  expect(mapped.interactions[0]).not.toHaveProperty('severityMappingReviewed');
  expect(mapped.severityMappingReview).toEqual({
    mappingVersion: 'synthetic-map-v1',
    reviewed: false,
  });

  const unmapped = await evaluateInteractions(
    selection,
    provider,
    options({
      severityMapping: {
        mappingVersion: 'synthetic-map-v2',
        reviewed: true,
        map: {},
      },
    }),
  );
  expect(unmapped.interactions[0]?.severity).toBe('source-band-amber');
  expect(unmapped.interactions[0]?.normalizedSeverity).toBe('unmapped');
});

it('merges provider records and flags source-term and reported-versus-covered disagreement', async () => {
  const firstProvider = createOfflineSyntheticProvider();
  const secondProvider = createSecondVocabularySyntheticProvider();
  const firstResult = await firstProvider.evaluate(CONTRACT_REQUEST);
  const secondResult = await secondProvider.evaluate(CONTRACT_REQUEST);
  const severityMerge = mergeProviderResults([firstResult, secondResult]);
  expect(severityMerge.records).toHaveLength(2);
  expect(severityMerge.records.map((record) => record.severity)).toEqual([
    'source-band-amber',
    'tier-cyan',
  ]);
  expect(severityMerge.disagreements).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        reasons: expect.arrayContaining(['severity-terms-differ']),
      }),
    ]),
  );
  expect(severityMerge).not.toHaveProperty('status');

  const noRecord = createNoRecordSyntheticProvider();
  const noRecordResult: ProviderResult =
    await noRecord.evaluate(CONTRACT_REQUEST);
  const coverageMerge = mergeProviderResults([firstResult, noRecordResult]);
  expect(coverageMerge.disagreements).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        reasons: expect.arrayContaining(['reported-vs-covered-no-record']),
      }),
    ]),
  );
  expect(coverageMerge.records).toHaveLength(firstResult.records.length);
});

it('returns an incomplete evaluation when the configured pair limit is exceeded', async () => {
  const selection = makeSyntheticSelection([
    {
      sourceProductId: 'SP-LIMIT-FICTIVOL',
      displayName: 'Fictivol',
      ingredients: [
        {
          sourceIngredientId: 'AI-LIMIT-FICTIVOLINUM',
          displayName: 'Fictivolinum',
        },
      ],
    },
    {
      sourceProductId: 'SP-LIMIT-PLACEBEX',
      displayName: 'Placebex',
      ingredients: [
        {
          sourceIngredientId: 'AI-LIMIT-PLACEBEXIUM',
          displayName: 'Placebexium',
        },
      ],
    },
    {
      sourceProductId: 'SP-LIMIT-SYNTHETICA',
      displayName: 'Synthetica',
      ingredients: [
        {
          sourceIngredientId: 'AI-LIMIT-SYNTHETINIX',
          displayName: 'Synthetinix',
        },
      ],
    },
  ]);
  let called = false;
  const base = createOfflineSyntheticProvider();
  const provider: DrugInteractionProvider = {
    describe: () => base.describe(),
    evaluate: (request) => {
      called = true;
      return base.evaluate(request);
    },
  };
  const result = await evaluateInteractions(
    selection,
    provider,
    options({ maxPairs: 2 }),
  );
  expect(result.status).toBe('incomplete');
  expect(result.pairLimit).toEqual({
    status: 'too-many-pairs',
    ingredientCount: 3,
    pairCount: 3,
    maxPairs: 2,
    pairs: [],
  });
  expect(result.evaluatedPairCoverage).toEqual([]);
  expect(called).toBe(false);
});

it('keeps source versions and does not label a result as safe or as no interaction', async () => {
  const result = await evaluateInteractions(
    makeSyntheticSelection([
      {
        sourceProductId: 'SP-LABEL-FICTIVOL',
        displayName: 'Fictivol',
        ingredients: [
          {
            sourceIngredientId: 'AI-LABEL-FICTIVOLINUM',
            displayName: 'Fictivolinum',
          },
        ],
      },
      {
        sourceProductId: 'SP-LABEL-SYNTHETICA',
        displayName: 'Synthetica',
        ingredients: [
          {
            sourceIngredientId: 'AI-LABEL-SYNTHETINIX',
            displayName: 'Synthetinix',
          },
        ],
      },
    ]),
    createOfflineSyntheticProvider(),
    options(),
  );
  expect(result.sourceVersions[0]?.sourceVersion).toBe(
    'synthetic-interactions-v1',
  );
  expect(JSON.stringify(result)).not.toMatch(
    /\bsafe\b|\bnone\b|no interaction/i,
  );
});
