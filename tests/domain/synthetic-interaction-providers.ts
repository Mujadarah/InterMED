import {
  type ActiveIngredientId,
  type CanonicalIngredientPair,
  type DrugInteraction,
  type DrugInteractionProvider,
  type InteractionContext,
  type InteractionProviderDescriptor,
  type InteractionSelection,
  type DataSourceId,
  type ProviderPairCoverage,
  type ProviderRequest,
  type ProviderResult,
} from '@intermed/domain';
import {
  datasetVersionId,
  emptyCatalogue,
  ingredient,
  join,
  mustId,
  product,
  sourceId,
  SOURCE_NAMESPACE,
  SOURCE_KEY,
} from './builders';

export const SYNTHETIC_RETRIEVED_AT = '2026-10-12T12:00:00.000Z';

export const CONTRACT_INGREDIENT_A = mustId(
  'ActiveIngredient',
  SOURCE_KEY,
  'AI-CONTRACT-FICTIVOLINUM',
);
export const CONTRACT_INGREDIENT_B = mustId(
  'ActiveIngredient',
  SOURCE_KEY,
  'AI-CONTRACT-SYNTHETINIX',
);
export const CONTRACT_INGREDIENT_C = mustId(
  'ActiveIngredient',
  SOURCE_KEY,
  'AI-CONTRACT-PLACEBEXIUM',
);
export const THROW_TRIGGER_ID = mustId(
  'ActiveIngredient',
  SOURCE_KEY,
  'AI-SYNTHETIC-THROW-TRIGGER',
);
export const TIMEOUT_TRIGGER_ID = mustId(
  'ActiveIngredient',
  SOURCE_KEY,
  'AI-SYNTHETIC-TIMEOUT-TRIGGER',
);

function fixturePair(
  left: ActiveIngredientId,
  right: ActiveIngredientId,
): CanonicalIngredientPair {
  return left <= right ? [left, right] : [right, left];
}

export const CONTRACT_PAIR_AB = fixturePair(
  CONTRACT_INGREDIENT_A,
  CONTRACT_INGREDIENT_B,
);
export const CONTRACT_PAIR_AC = fixturePair(
  CONTRACT_INGREDIENT_A,
  CONTRACT_INGREDIENT_C,
);

function pairKey(pair: readonly [string, string]): string {
  return JSON.stringify(pair);
}

export interface SyntheticProductSpec {
  readonly sourceProductId: string;
  readonly displayName: string;
  readonly ingredients: readonly {
    readonly sourceIngredientId: string;
    readonly displayName: string;
    readonly mappingStatus?: 'confirmed' | 'unresolved';
    readonly reviewStatus?: 'reviewed' | 'unreviewed' | 'rejected';
    readonly noExternalMappings?: boolean;
  }[];
}

export function makeSyntheticSelection(
  specs: readonly SyntheticProductSpec[],
): InteractionSelection {
  const products = specs.map((spec) =>
    product(spec.sourceProductId, spec.displayName),
  );
  const ingredientsByKey = new Map<string, ReturnType<typeof ingredient>>();
  const joins = specs.flatMap((spec, productIndex) => {
    const selectedProduct = products[productIndex];
    if (!selectedProduct) return [];
    return spec.ingredients.map((part, ingredientIndex) => {
      const mappingStatus = part.mappingStatus ?? 'confirmed';
      const reviewStatus = part.reviewStatus ?? 'reviewed';
      const linked =
        mappingStatus === 'confirmed'
          ? (ingredientsByKey.get(part.sourceIngredientId) ??
            ingredient(part.sourceIngredientId, part.displayName, {
              externalMappings: part.noExternalMappings
                ? []
                : [
                    {
                      sourceId,
                      sourceIngredientId: part.sourceIngredientId,
                      mappingVersion: 'map-synthetic-1',
                      reviewStatus,
                    },
                  ],
            }))
          : undefined;
      if (linked) ingredientsByKey.set(part.sourceIngredientId, linked);
      return join(
        'MI-' + spec.sourceProductId + '-' + ingredientIndex,
        selectedProduct.id,
        part.displayName,
        {
          ingredientId: linked
            ? { status: 'present', value: linked.id }
            : { status: 'missing' },
          mappingStatus,
        },
      );
    });
  });
  return {
    snapshot: emptyCatalogue({
      products,
      activeIngredients: [...ingredientsByKey.values()],
      medicationIngredients: joins,
    }),
    productIds: products.map((item) => item.id),
    datasetVersionId,
  };
}

export const CONTRACT_SELECTION = makeSyntheticSelection([
  {
    sourceProductId: 'SP-CONTRACT-FICTIVOL',
    displayName: 'Fictivol',
    ingredients: [
      {
        sourceIngredientId: 'AI-CONTRACT-FICTIVOLINUM',
        displayName: 'Fictivolinum',
      },
    ],
  },
  {
    sourceProductId: 'SP-CONTRACT-SYNTHETICA',
    displayName: 'Synthetica',
    ingredients: [
      {
        sourceIngredientId: 'AI-CONTRACT-SYNTHETINIX',
        displayName: 'Synthetinix',
      },
    ],
  },
  {
    sourceProductId: 'SP-CONTRACT-PLACEBEX',
    displayName: 'Placebex',
    ingredients: [
      {
        sourceIngredientId: 'AI-CONTRACT-PLACEBEXIUM',
        displayName: 'Placebexium',
      },
    ],
  },
]);

export const CONTRACT_CONTEXT: InteractionContext = {
  requiredContextLimitations: [],
};

export const CONTRACT_REQUEST: ProviderRequest = {
  ingredientIds: [
    CONTRACT_INGREDIENT_A,
    CONTRACT_INGREDIENT_B,
    CONTRACT_INGREDIENT_C,
  ],
  pairs: [
    fixturePair(CONTRACT_INGREDIENT_A, CONTRACT_INGREDIENT_B),
    fixturePair(CONTRACT_INGREDIENT_A, CONTRACT_INGREDIENT_C),
    fixturePair(CONTRACT_INGREDIENT_B, CONTRACT_INGREDIENT_C),
  ],
  context: CONTRACT_CONTEXT,
  datasetVersionId,
  online: true,
};

interface SyntheticProviderOptions {
  readonly providerId: string;
  readonly sourceVersion: string;
  readonly severity: string;
  readonly sourceId?: DataSourceId;
  readonly availability?: InteractionProviderDescriptor['availability'];
  readonly rightsStatus?: InteractionProviderDescriptor['rightsStatus'];
  readonly evaluableContextLimitations?: readonly string[];
  readonly reportFirstPair?: boolean;
  readonly uncoveredPairIndex?: number;
  readonly markUncoveredPairStale?: boolean;
  readonly fault?: 'throws' | 'times-out';
  readonly faultTrigger?: string;
}

function makeRecord(
  providerId: string,
  sourceVersion: string,
  pair: readonly [string, string],
  severity: string,
  recordSourceId: DataSourceId,
): DrugInteraction {
  const interactionId = 'synthetic-interaction-' + providerId + '-first-pair';
  const evidenceId = 'synthetic-evidence-' + providerId + '-first-pair';
  return {
    id: interactionId,
    ingredientAId: pair[0] as DrugInteraction['ingredientAId'],
    ingredientBId: pair[1] as DrugInteraction['ingredientBId'],
    severity,
    contextLimitations: [],
    evidenceIds: [evidenceId],
    sourceId: recordSourceId,
    sourceVersion,
    datasetVersionId,
    lastUpdated: SYNTHETIC_RETRIEVED_AT,
    recordStatus: 'current',
    updateHistory: [],
  };
}

type SyntheticLifecycleRecord = DrugInteraction & {
  readonly recordStatus: 'current' | 'superseded' | 'withdrawn';
  readonly supersededBy?: string;
  readonly statusChangedAt?: string;
  readonly updateHistory: readonly {
    readonly sourceVersion: string;
    readonly changedAt: string;
    readonly change: 'created' | 'updated' | 'superseded' | 'withdrawn';
  }[];
  readonly sourceStatesUncertainEvidence?: boolean;
};

function withLifecycle(
  record: DrugInteraction,
  recordStatus: SyntheticLifecycleRecord['recordStatus'],
  updateHistory: SyntheticLifecycleRecord['updateHistory'],
  extra: Partial<SyntheticLifecycleRecord> = {},
): DrugInteraction {
  return {
    ...record,
    recordStatus,
    updateHistory,
    ...extra,
  } as DrugInteraction;
}

function createSyntheticProvider(
  options: SyntheticProviderOptions,
): DrugInteractionProvider {
  const descriptor: InteractionProviderDescriptor = {
    providerId: options.providerId,
    sourceId: options.sourceId ?? sourceId,
    sourceVersion: options.sourceVersion,
    availability: options.availability ?? 'offline-licensed',
    capabilities: {
      evaluableContextLimitations: options.evaluableContextLimitations ?? [
        'synthetic-route-context',
      ],
    },
    rightsStatus: options.rightsStatus ?? 'permitted',
  };

  return {
    describe: () => descriptor,
    evaluate: (request) => {
      if (
        options.faultTrigger &&
        request.ingredientIds.includes(
          options.faultTrigger as ProviderRequest['ingredientIds'][number],
        )
      ) {
        if (options.fault === 'throws')
          throw new Error('synthetic provider failure detail');
        if (options.fault === 'times-out')
          return new Promise<ProviderResult>(() => {});
      }

      if (descriptor.availability === 'online-only' && !request.online)
        return Promise.resolve({
          providerId: descriptor.providerId,
          sourceId: descriptor.sourceId,
          sourceVersion: descriptor.sourceVersion,
          retrievedAt: SYNTHETIC_RETRIEVED_AT,
          status: 'unavailable',
          reason: 'online-required',
          pairCoverage: request.pairs.map((pair) => ({
            pair,
            status: 'not-covered',
            reason: 'online-required',
          })),
          records: [],
          evidence: [],
        });

      const firstPair = request.pairs[0];
      const reportFirstPair =
        options.reportFirstPair !== false && firstPair !== undefined;
      const records = reportFirstPair
        ? [
            makeRecord(
              descriptor.providerId,
              descriptor.sourceVersion,
              firstPair,
              options.severity,
              descriptor.sourceId,
            ),
          ]
        : [];
      const evidence = records.map((record) => ({
        id: record.evidenceIds[0] ?? '',
        interactionId: record.id,
        sourceId: descriptor.sourceId,
        sourceVersion: descriptor.sourceVersion,
        retrievedAt: SYNTHETIC_RETRIEVED_AT,
        reviewStatus: 'unreviewed',
      }));

      const pairCoverage: ProviderPairCoverage[] = request.pairs.map(
        (pair, index) => {
          if (options.uncoveredPairIndex === index)
            return {
              pair,
              status: 'not-covered',
              retrievedAt: SYNTHETIC_RETRIEVED_AT,
              reason: 'synthetic-partial-coverage',
              ...(options.markUncoveredPairStale ? { stale: true } : {}),
            };
          if (reportFirstPair && index === 0)
            return {
              pair,
              status: 'reported',
              retrievedAt: SYNTHETIC_RETRIEVED_AT,
            };
          return {
            pair,
            status: 'covered-no-record',
            retrievedAt: SYNTHETIC_RETRIEVED_AT,
          };
        },
      );

      return Promise.resolve({
        providerId: descriptor.providerId,
        sourceId: descriptor.sourceId,
        sourceVersion: descriptor.sourceVersion,
        retrievedAt: SYNTHETIC_RETRIEVED_AT,
        status: 'available',
        pairCoverage,
        records,
        evidence,
      });
    },
  };
}

export function createOfflineSyntheticProvider(
  overrides: Partial<SyntheticProviderOptions> = {},
): DrugInteractionProvider {
  return createSyntheticProvider({
    providerId: 'synthetic-offline-provider',
    sourceVersion: 'synthetic-interactions-v1',
    severity: 'source-band-amber',
    ...overrides,
  });
}

export function createOnlineOnlySyntheticProvider(): DrugInteractionProvider {
  return createSyntheticProvider({
    providerId: 'synthetic-online-provider',
    sourceVersion: 'synthetic-interactions-online-v1',
    severity: 'source-band-violet',
    availability: 'online-only',
  });
}

export function createPartialCoverageSyntheticProvider(): DrugInteractionProvider {
  return createSyntheticProvider({
    providerId: 'synthetic-partial-provider',
    sourceVersion: 'synthetic-interactions-v1',
    severity: 'source-band-amber',
    uncoveredPairIndex: 1,
    markUncoveredPairStale: true,
  });
}

export function createThrowingSyntheticProvider(): DrugInteractionProvider {
  return createSyntheticProvider({
    providerId: 'synthetic-throwing-provider',
    sourceVersion: 'synthetic-interactions-v1',
    severity: 'source-band-silver',
    fault: 'throws',
    faultTrigger: THROW_TRIGGER_ID,
  });
}

export function createTimeoutSyntheticProvider(): DrugInteractionProvider {
  return createSyntheticProvider({
    providerId: 'synthetic-timeout-provider',
    sourceVersion: 'synthetic-interactions-v1',
    severity: 'source-band-copper',
    fault: 'times-out',
    faultTrigger: TIMEOUT_TRIGGER_ID,
  });
}

export function createSecondVocabularySyntheticProvider(): DrugInteractionProvider {
  return createSyntheticProvider({
    providerId: 'synthetic-second-vocabulary-provider',
    sourceVersion: 'synthetic-interactions-v2',
    severity: 'tier-cyan',
  });
}

export function createDisagreementSyntheticProvider(): DrugInteractionProvider {
  return createSyntheticProvider({
    providerId: 'synthetic-disagreement-provider',
    sourceVersion: 'synthetic-disagreement-v1',
    severity: 'source-band-crimson',
    sourceId: mustId(
      'DataSource',
      SOURCE_NAMESPACE,
      'source.synthetic-disagreement',
    ),
  });
}

export function createNoRecordSyntheticProvider(): DrugInteractionProvider {
  return createSyntheticProvider({
    providerId: 'synthetic-covered-no-record-provider',
    sourceVersion: 'synthetic-interactions-v1',
    severity: 'source-band-unused',
    reportFirstPair: false,
  });
}

const WITHDRAWN_UPDATE_HISTORY: SyntheticLifecycleRecord['updateHistory'] = [
  {
    sourceVersion: 'synthetic-interactions-v1',
    changedAt: '2026-10-10T08:15:00.000Z',
    change: 'created',
  },
  {
    sourceVersion: 'synthetic-interactions-v1',
    changedAt: '2026-10-12T10:30:00.000Z',
    change: 'withdrawn',
  },
];

export function createWithdrawnOnlySyntheticProvider(): DrugInteractionProvider {
  const inner = createOfflineSyntheticProvider();
  return {
    describe: () => inner.describe(),
    evaluate: async (request) => {
      const result = await inner.evaluate(request);
      const [record] = result.records;
      if (!record) return result;
      return {
        ...result,
        records: [
          withLifecycle(record, 'withdrawn', WITHDRAWN_UPDATE_HISTORY, {
            statusChangedAt: '2026-10-12T10:30:00.000Z',
          }),
        ],
      };
    },
  };
}

export function createSupersededOnlySyntheticProvider(): DrugInteractionProvider {
  const inner = createOfflineSyntheticProvider();
  return {
    describe: () => inner.describe(),
    evaluate: async (request) => {
      const result = await inner.evaluate(request);
      const [record] = result.records;
      if (!record) return result;
      return {
        ...result,
        records: [
          withLifecycle(
            record,
            'superseded',
            [
              {
                sourceVersion: record.sourceVersion,
                changedAt: '2026-10-10T08:15:00.000Z',
                change: 'created',
              },
              {
                sourceVersion: record.sourceVersion,
                changedAt: '2026-10-12T10:30:00.000Z',
                change: 'superseded',
              },
            ],
            {
              statusChangedAt: '2026-10-12T10:30:00.000Z',
            },
          ),
        ],
      };
    },
  };
}

export function createWithdrawnCoveredNoRecordSyntheticProvider(): DrugInteractionProvider {
  const noRecordProvider = createNoRecordSyntheticProvider();
  const recordProvider = createOfflineSyntheticProvider();
  return {
    describe: () => noRecordProvider.describe(),
    evaluate: async (request) => {
      const [result, recordResult] = await Promise.all([
        noRecordProvider.evaluate(request),
        recordProvider.evaluate(request),
      ]);
      const [record] = recordResult.records;
      if (!record) return result;
      return {
        ...result,
        records: [
          withLifecycle(record, 'withdrawn', WITHDRAWN_UPDATE_HISTORY, {
            statusChangedAt: '2026-10-12T10:30:00.000Z',
          }),
        ],
        evidence: recordResult.evidence,
      };
    },
  };
}

export function createSupersededAndCurrentSyntheticProvider(): DrugInteractionProvider {
  const inner = createOfflineSyntheticProvider();
  return {
    describe: () => inner.describe(),
    evaluate: async (request) => {
      const result = await inner.evaluate(request);
      const [record] = result.records;
      if (!record) return result;
      const currentId = record.id + '-current';
      return {
        ...result,
        records: [
          withLifecycle(
            record,
            'superseded',
            [
              {
                sourceVersion: record.sourceVersion,
                changedAt: '2026-10-10T08:15:00.000Z',
                change: 'created',
              },
              {
                sourceVersion: record.sourceVersion,
                changedAt: '2026-10-12T10:30:00.000Z',
                change: 'superseded',
              },
            ],
            {
              supersededBy: currentId,
              statusChangedAt: '2026-10-12T10:30:00.000Z',
            },
          ),
          withLifecycle(
            { ...record, id: currentId, evidenceIds: [] },
            'current',
            [
              {
                sourceVersion: record.sourceVersion,
                changedAt: '2026-10-12T10:30:00.000Z',
                change: 'created',
              },
            ],
          ),
        ],
      };
    },
  };
}

export function createWithdrawnAndCurrentSyntheticProvider(): DrugInteractionProvider {
  const inner = createOfflineSyntheticProvider();
  return {
    describe: () => inner.describe(),
    evaluate: async (request) => {
      const result = await inner.evaluate(request);
      const [record] = result.records;
      if (!record) return result;
      const currentId = record.id + '-current';
      const recordWithoutEvidence: DrugInteraction = {
        ...record,
        evidenceIds: [],
      };
      return {
        ...result,
        records: [
          withLifecycle(
            recordWithoutEvidence,
            'withdrawn',
            WITHDRAWN_UPDATE_HISTORY,
            { statusChangedAt: '2026-10-12T10:30:00.000Z' },
          ),
          withLifecycle(
            { ...recordWithoutEvidence, id: currentId },
            'current',
            [
              {
                sourceVersion: record.sourceVersion,
                changedAt: '2026-10-12T10:30:00.000Z',
                change: 'created',
              },
            ],
          ),
        ],
        evidence: [],
      };
    },
  };
}

export function createOutdatedSyntheticProvider(): DrugInteractionProvider {
  const inner = createOfflineSyntheticProvider();
  return {
    describe: () => ({
      ...inner.describe(),
      sourceVersion: 'synthetic-interactions-v2',
    }),
    evaluate: async (request) => {
      const result = await inner.evaluate(request);
      return {
        ...result,
        records: result.records.map((record) =>
          withLifecycle(record, 'current', []),
        ),
      };
    },
  };
}

export function createSourceUncertainSyntheticProvider(): DrugInteractionProvider {
  const inner = createOfflineSyntheticProvider();
  return {
    describe: () => inner.describe(),
    evaluate: async (request) => {
      const result = await inner.evaluate(request);
      return {
        ...result,
        records: result.records.map((record) =>
          withLifecycle(record, 'current', [], {
            sourceStatesUncertainEvidence: true,
            evidenceLevel: 'source-stated-evidence-level-alpha',
          }),
        ),
      };
    },
  };
}

function reversedPair(pair: CanonicalIngredientPair): CanonicalIngredientPair {
  return [pair[1], pair[0]];
}

export function createReversedOrderSyntheticProvider(): DrugInteractionProvider {
  const inner = createOfflineSyntheticProvider();
  return {
    describe: () => inner.describe(),
    evaluate: async (request) => {
      const result = await inner.evaluate(request);
      return {
        ...result,
        pairCoverage: result.pairCoverage.map((coverage) => ({
          ...coverage,
          pair: reversedPair(coverage.pair),
        })),
        records: result.records.map((record) => ({
          ...record,
          ingredientAId: record.ingredientBId,
          ingredientBId: record.ingredientAId,
        })),
      };
    },
  };
}

export function createOutsidePairSyntheticProvider(): DrugInteractionProvider {
  const inner = createOfflineSyntheticProvider();
  return {
    describe: () => inner.describe(),
    evaluate: async (request) => {
      const result = await inner.evaluate(request);
      const template = result.records[0];
      const first = request.ingredientIds[0];
      if (!template || first === undefined) return result;
      const outsider = mustId(
        'ActiveIngredient',
        SOURCE_KEY,
        'AI-ADVERSARIAL-OUTSIDER',
      );
      const outsideRecord: DrugInteraction = {
        ...template,
        id: template.id + '-outside',
        ingredientAId: outsider,
        ingredientBId: first,
        evidenceIds: [],
      };
      const selfRecord: DrugInteraction = {
        ...template,
        id: template.id + '-self',
        ingredientAId: first,
        ingredientBId: first,
        evidenceIds: [],
      };
      const outsideCoverage: ProviderPairCoverage = {
        pair: fixturePair(outsider, first),
        status: 'covered-no-record',
        retrievedAt: SYNTHETIC_RETRIEVED_AT,
      };
      return {
        ...result,
        records: [...result.records, outsideRecord, selfRecord],
        pairCoverage: [...result.pairCoverage, outsideCoverage],
      };
    },
  };
}

export function createOmittedCoverageSyntheticProvider(): DrugInteractionProvider {
  const inner = createOfflineSyntheticProvider();
  return {
    describe: () => inner.describe(),
    evaluate: async (request) => {
      const result = await inner.evaluate(request);
      return {
        ...result,
        pairCoverage: result.pairCoverage.filter(
          (_coverage, index) => index !== 1,
        ),
      };
    },
  };
}

export function createVersionMismatchSyntheticProvider(): DrugInteractionProvider {
  const inner = createOfflineSyntheticProvider();
  return {
    describe: () => inner.describe(),
    evaluate: async (request) => {
      const result = await inner.evaluate(request);
      return {
        ...result,
        providerId: 'synthetic-impostor-provider',
        sourceVersion: 'synthetic-interactions-v9',
        records: result.records.map((record) => ({
          ...record,
          datasetVersionId: mustId(
            'DatasetVersion',
            SOURCE_KEY,
            'synthetic-adversarial-generation',
          ),
        })),
      };
    },
  };
}

export function createDanglingEvidenceSyntheticProvider(): DrugInteractionProvider {
  const inner = createOfflineSyntheticProvider();
  return {
    describe: () => inner.describe(),
    evaluate: async (request) => {
      const result = await inner.evaluate(request);
      return {
        ...result,
        records: result.records.map((record) => ({
          ...record,
          evidenceIds: ['synthetic-missing-evidence'],
        })),
        evidence: [],
      };
    },
  };
}

export const THROW_TRIGGER_SELECTION = makeSyntheticSelection([
  {
    sourceProductId: 'SP-TRIGGER-THROW-FICTIVOL',
    displayName: 'Fictivol',
    ingredients: [
      {
        sourceIngredientId: 'AI-SYNTHETIC-THROW-TRIGGER',
        displayName: 'Fictivolinum',
      },
    ],
  },
  {
    sourceProductId: 'SP-TRIGGER-THROW-PLACEBEX',
    displayName: 'Placebex',
    ingredients: [
      {
        sourceIngredientId: 'AI-TRIGGER-THROW-PLACEBEXIUM',
        displayName: 'Placebexium',
      },
    ],
  },
]);

export const TIMEOUT_TRIGGER_SELECTION = makeSyntheticSelection([
  {
    sourceProductId: 'SP-TRIGGER-TIMEOUT-FICTIVOL',
    displayName: 'Fictivol',
    ingredients: [
      {
        sourceIngredientId: 'AI-SYNTHETIC-TIMEOUT-TRIGGER',
        displayName: 'Fictivolinum',
      },
    ],
  },
  {
    sourceProductId: 'SP-TRIGGER-TIMEOUT-PLACEBEX',
    displayName: 'Placebex',
    ingredients: [
      {
        sourceIngredientId: 'AI-TRIGGER-TIMEOUT-PLACEBEXIUM',
        displayName: 'Placebexium',
      },
    ],
  },
]);

export function pairKeyForTest(pair: readonly [string, string]): string {
  return pairKey(pair);
}
