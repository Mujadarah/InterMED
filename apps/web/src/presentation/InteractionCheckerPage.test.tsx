// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import {
  evaluateInteractions,
  type InteractionEvaluation,
  type DrugInteractionProvider,
  type DatasetStateSource,
  type LocalDatasetGeneration,
} from '@intermed/domain';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createDisagreementSyntheticProvider,
  createNoRecordSyntheticProvider,
  createOfflineSyntheticProvider,
  createOnlineOnlySyntheticProvider,
  createPartialCoverageSyntheticProvider,
  createSupersededOnlySyntheticProvider,
  createWithdrawnOnlySyntheticProvider,
  makeSyntheticSelection,
  type SyntheticProductSpec,
} from '../../../../tests/domain/synthetic-interaction-providers';
import {
  mustId,
  SOURCE_NAMESPACE,
  sourceId,
} from '../../../../tests/domain/builders';
import { INTERACTION_CHECKER_MAX_PAIRS } from '../application/interaction-checker';
import type { InteractionCheckerService } from '../application/interaction-checker-contract';
import { InteractionCheckerPage } from './InteractionCheckerPage';

afterEach(cleanup);

const FIXED_WARNING =
  'Absence of a record does not mean the combination is safe.';
const REQUIRED_PREVIEW_BANNER =
  'Development preview — not for clinical use. No interaction source has been approved.';
const COVERED_NO_RECORD_SENTENCE = `No interaction record identified within Source ${JSON.stringify(sourceId)}'s evaluated coverage.`;
const COVERAGE_DISCREPANCY_SENTENCE =
  'Coverage differs between sources: at least one source documents this interaction and another has no record within its evaluated coverage. Absence of a record is not evidence against the documented interaction.';
const ADDITIONAL_NO_RECORD_SOURCE_ID = mustId(
  'DataSource',
  SOURCE_NAMESPACE,
  'source.synthetic-checker-covered-no-record',
);
const ADDITIONAL_NO_RECORD_SOURCE_VERSION = 'synthetic-covered-no-record-v2';
const ADDITIONAL_DISAGREEMENT_PROVIDER_ID =
  'synthetic-disagreement-secondary-provider';
const ADDITIONAL_DISAGREEMENT_SOURCE_ID = mustId(
  'DataSource',
  SOURCE_NAMESPACE,
  'source.synthetic-checker-disagreement-secondary',
);
const ADDITIONAL_DISAGREEMENT_SOURCE_VERSION = 'synthetic-disagreement-v2';
const SYNTHETIC_MAPPING = {
  mappingVersion: 'synthetic-display-only-v1',
  reviewed: false,
  map: {},
} as const;

function productSpecs(count = 2): SyntheticProductSpec[] {
  return Array.from({ length: count }, (_unused, index) => ({
    sourceProductId: `SP-CHECKER-UI-${index + 1}`,
    displayName: `Preview product ${index + 1}`,
    ingredients: [
      {
        sourceIngredientId: `AI-CHECKER-UI-${index + 1}`,
        displayName:
          index === 0
            ? 'FICTIVOLINUM'
            : index === 1
              ? 'SYNTHETINIX'
              : `Fictional ingredient ${index + 1}`,
      },
    ],
  }));
}

function selectionFrom(specs: readonly SyntheticProductSpec[]) {
  return makeSyntheticSelection(specs);
}

function fixtureGeneration(
  generationId: string,
  synthetic = true,
): LocalDatasetGeneration {
  return {
    generationId,
    dataset: 'synthetic-medication-catalogue',
    version: 'synthetic-ui-test',
    schemaVersion: 'medication-catalogue-1',
    sourceIds: [],
    publishedAt: null,
    importedAt: '2026-10-01T00:00:00Z',
    downloadedAt: '2026-10-02T00:00:00.000Z',
    checksum: 'synthetic-ui-test-checksum',
    coverage: 'Fictional fixture data only.',
    recordCounts: { products: 20 },
    synthetic,
  };
}

function makeSearchResults(
  selection: ReturnType<typeof selectionFrom>,
  generationId: string,
  specs: readonly SyntheticProductSpec[],
) {
  return {
    generationId,
    results: selection.snapshot.products.map((product, index) => ({
      record: {
        product,
        ingredientNames:
          specs[index]?.ingredients.map(
            (ingredient) => ingredient.displayName,
          ) ?? [],
        atcCodes: [],
        dosageFormName: 'fictional form',
        manufacturerNames: [],
      },
      rank: 'exact' as const,
    })),
    total: selection.snapshot.products.length,
    truncated: false,
    indexedProductCount: selection.snapshot.products.length,
    indexDurationMilliseconds: 0,
    searchDurationMilliseconds: 0,
  };
}

function makeEvaluation(
  selection: ReturnType<typeof selectionFrom>,
  provider: DrugInteractionProvider,
  online: boolean,
): Promise<InteractionEvaluation> {
  return evaluateInteractions(selection, provider, {
    online,
    maxPairs: INTERACTION_CHECKER_MAX_PAIRS,
    severityMapping: SYNTHETIC_MAPPING,
    now: () => '2026-10-14T10:00:00.000Z',
  });
}

function withStaleNoRecordCoverage(
  provider: DrugInteractionProvider,
): DrugInteractionProvider {
  return {
    describe: () => provider.describe(),
    evaluate: async (request) => {
      const result = await provider.evaluate(request);
      return {
        ...result,
        pairCoverage: result.pairCoverage.map((coverage) => ({
          ...coverage,
          stale: true,
        })),
      };
    },
  };
}

function withSyntheticDisagreement(
  evaluation: InteractionEvaluation,
): InteractionEvaluation {
  const pair = evaluation.evaluatedPairCoverage[0]?.pair;
  const interaction = evaluation.interactions[0];
  if (!pair || !interaction) return evaluation;
  const secondarySeverity = 'no interaction is expected';
  const secondaryInteraction = {
    ...interaction,
    id: `${interaction.id}-secondary-source`,
    sourceId: ADDITIONAL_DISAGREEMENT_SOURCE_ID,
    sourceVersion: ADDITIONAL_DISAGREEMENT_SOURCE_VERSION,
    severity: secondarySeverity,
    evidenceIds: [],
  };
  return {
    ...evaluation,
    evaluatedPairCoverage: [
      ...evaluation.evaluatedPairCoverage,
      {
        pair,
        providerId: ADDITIONAL_DISAGREEMENT_PROVIDER_ID,
        sourceId: ADDITIONAL_DISAGREEMENT_SOURCE_ID,
        sourceVersion: ADDITIONAL_DISAGREEMENT_SOURCE_VERSION,
        status: 'reported',
      },
    ],
    interactions: [...evaluation.interactions, secondaryInteraction],
    sourceVersions: [
      ...evaluation.sourceVersions,
      {
        providerId: ADDITIONAL_DISAGREEMENT_PROVIDER_ID,
        sourceId: ADDITIONAL_DISAGREEMENT_SOURCE_ID,
        sourceVersion: ADDITIONAL_DISAGREEMENT_SOURCE_VERSION,
      },
    ],
    disagreements: [
      {
        pair,
        reasons: ['severity-terms-differ'],
        severityTerms: [
          {
            providerId:
              evaluation.sourceVersions[0]?.providerId ??
              'synthetic-disagreement-provider',
            sourceId: interaction.sourceId,
            sourceVersion: interaction.sourceVersion,
            severity: interaction.severity ?? 'not supplied',
          },
          {
            providerId: ADDITIONAL_DISAGREEMENT_PROVIDER_ID,
            sourceId: ADDITIONAL_DISAGREEMENT_SOURCE_ID,
            sourceVersion: ADDITIONAL_DISAGREEMENT_SOURCE_VERSION,
            severity: secondarySeverity,
          },
        ],
      },
    ],
  };
}

function withAdditionalCoveredNoRecordSource(
  evaluation: InteractionEvaluation,
): InteractionEvaluation {
  const pair = evaluation.evaluatedPairCoverage[0]?.pair;
  if (!pair) return evaluation;
  const providerId = 'synthetic-covered-no-record-secondary-provider';
  return {
    ...evaluation,
    evaluatedPairCoverage: [
      ...evaluation.evaluatedPairCoverage,
      {
        pair,
        providerId,
        sourceId: ADDITIONAL_NO_RECORD_SOURCE_ID,
        sourceVersion: ADDITIONAL_NO_RECORD_SOURCE_VERSION,
        status: 'covered-no-record',
      },
    ],
    sourceVersions: [
      ...evaluation.sourceVersions,
      {
        providerId,
        sourceId: ADDITIONAL_NO_RECORD_SOURCE_ID,
        sourceVersion: ADDITIONAL_NO_RECORD_SOURCE_VERSION,
      },
    ],
  };
}

function expectNoUnlabelledSafetyLanguage() {
  expect(screen.getByText(REQUIRED_PREVIEW_BANNER)).toBeVisible();
  const page = screen
    .getByTestId('interaction-checker-page')
    .cloneNode(true) as HTMLElement;
  for (const statement of page.querySelectorAll<HTMLElement>(
    '[aria-label^="Source statement"]',
  )) {
    const text = statement.textContent ?? '';
    expect(text).toMatch(/source id:/i);
    expect(text).toMatch(/source version:/i);
    expect(text).toMatch(/record id:/i);
    expect(text).toMatch(/limitations:/i);
    statement.remove();
  }

  const textOutsideApprovedWording = (page.textContent ?? '')
    .replaceAll(REQUIRED_PREVIEW_BANNER, '')
    .replaceAll(FIXED_WARNING, '')
    .replaceAll(
      /No interaction record identified within Source .*?'s evaluated coverage\./g,
      '',
    );
  expect(textOutsideApprovedWording).not.toMatch(/\bsafe\b/i);
  expect(textOutsideApprovedWording).not.toMatch(/\bno interaction\b/i);
  expect(textOutsideApprovedWording).not.toMatch(/\bcompatible\b/i);
}

function fixtureDataset(
  generation: LocalDatasetGeneration,
): DatasetStateSource {
  const state = { status: 'ready', generation } as const;
  return {
    getState: () => state,
    subscribe: () => () => {},
  };
}

async function renderScenario({
  specs = productSpecs(),
  provider = createOfflineSyntheticProvider(),
  online = true,
  availability = 'synthetic-preview',
  decorate,
}: {
  specs?: readonly SyntheticProductSpec[];
  provider?: DrugInteractionProvider;
  online?: boolean;
  availability?: InteractionCheckerService['availability'];
  decorate?: (evaluation: InteractionEvaluation) => InteractionEvaluation;
} = {}) {
  const selection = selectionFrom(specs);
  const generation = fixtureGeneration(selection.datasetVersionId);
  const response = makeSearchResults(selection, generation.generationId, specs);
  const search = {
    search: vi.fn(async () => response),
  };
  const checker: InteractionCheckerService = {
    availability,
    evaluate: vi.fn(async (_productIds, requestOnline) => {
      const evaluation = await makeEvaluation(
        selection,
        provider,
        requestOnline,
      );
      return decorate ? decorate(evaluation) : evaluation;
    }),
  };
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <InteractionCheckerPage
        dataset={fixtureDataset(generation)}
        search={search}
        checker={checker}
        online={online}
      />
    </MemoryRouter>,
  );

  if (availability === 'synthetic-preview') {
    await user.type(
      screen.getByRole('searchbox', { name: /search local medications/i }),
      'preview',
    );
    const firstProduct = selection.snapshot.products[0];
    if (firstProduct)
      await screen.findByRole('button', {
        name: `Add ${firstProduct.commercialName}`,
      });
  }

  return { user, selection, checker, search, generation };
}

async function addAllFixtureProducts(
  user: ReturnType<typeof userEvent.setup>,
  selection: ReturnType<typeof selectionFrom>,
) {
  for (const product of selection.snapshot.products) {
    await user.click(
      await screen.findByRole('button', {
        name: `Add ${product.commercialName}`,
      }),
    );
  }
}

async function checkSelectedProducts(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole('button', { name: 'Check selected products' }),
  );
}

it('shows documented interactions as an independent finding with source provenance', async () => {
  const { user, selection } = await renderScenario();
  await addAllFixtureProducts(user, selection);
  await checkSelectedProducts(user);

  expect(
    await screen.findByText(/A current source record documents an interaction/),
  ).toBeVisible();
  expect(
    screen.getByText(/Source severity term: source-band-amber/),
  ).toBeVisible();
  expect(screen.getByText(/unreviewed mapping/)).toBeVisible();
  expect(
    screen.getByText(/source version synthetic-interactions-v1/),
  ).toBeVisible();
});

it('shows stale no-record coverage without asserting a finding', async () => {
  const { user, selection } = await renderScenario({
    provider: withStaleNoRecordCoverage(createNoRecordSyntheticProvider()),
  });
  await addAllFixtureProducts(user, selection);
  await checkSelectedProducts(user);

  expect(await screen.findByText(FIXED_WARNING)).toBeVisible();
  expect(
    screen.getByText('No current finding was returned for this pair.'),
  ).toBeVisible();
  expect(
    screen.queryByText(/No interaction record identified within Source/),
  ).not.toBeInTheDocument();
  expectNoUnlabelledSafetyLanguage();
});

it('renders covered no-record wording exactly and keeps the fixed warning', async () => {
  const { user, selection } = await renderScenario({
    provider: createNoRecordSyntheticProvider(),
  });
  await addAllFixtureProducts(user, selection);
  await checkSelectedProducts(user);

  expect(await screen.findByText(COVERED_NO_RECORD_SENTENCE)).toBeVisible();
  expect(await screen.findByText(FIXED_WARNING)).toBeVisible();
  const pair = screen.getByRole('region', {
    name: 'Ingredient pair 1 assessment',
  });
  expect(
    within(pair).getByText('Assessment logic version: 3.0.0.'),
  ).toBeVisible();
  expect(within(pair).queryByText('Sources disagree.')).not.toBeInTheDocument();
  expect(
    screen.queryByText(/states no interaction is expected/i),
  ).not.toBeInTheDocument();
  expectNoUnlabelledSafetyLanguage();
});

it('keeps a current interaction visible beside another source no-record position', async () => {
  const { user, selection } = await renderScenario({
    provider: createOfflineSyntheticProvider(),
    decorate: withAdditionalCoveredNoRecordSource,
  });
  await addAllFixtureProducts(user, selection);
  await checkSelectedProducts(user);

  const pair = await screen.findByRole('region', {
    name: 'Ingredient pair 1 assessment',
  });
  expect(
    within(pair).getByText('A current source record documents an interaction.'),
  ).toBeVisible();
  expect(
    within(pair).getByText(
      `No interaction record identified within Source ${JSON.stringify(ADDITIONAL_NO_RECORD_SOURCE_ID)}'s evaluated coverage.`,
    ),
  ).toBeVisible();
  expect(within(pair).getByText(COVERAGE_DISCREPANCY_SENTENCE)).toBeVisible();
  expect(within(pair).queryByText('Sources disagree.')).not.toBeInTheDocument();
  expect(
    within(pair).queryByText(/Evidence conflict:/i),
  ).not.toBeInTheDocument();
  expect(
    within(pair).getByText('Assessment logic version: 3.0.0.'),
  ).toBeVisible();
  expect(
    within(pair).getByText(
      /version synthetic-interactions-v1: documents-interaction/,
    ),
  ).toBeVisible();
  expect(
    within(pair).getByText(
      `Source version ${JSON.stringify(ADDITIONAL_NO_RECORD_SOURCE_VERSION)}.`,
    ),
  ).toBeVisible();
  expect(
    within(pair).queryByText(/no-record-in-coverage/),
  ).not.toBeInTheDocument();
  expect(within(pair).getByText(FIXED_WARNING)).toBeVisible();
  expectNoUnlabelledSafetyLanguage();
});

it('shows not-covered pair status and its reason without an overall verdict', async () => {
  const { user, selection } = await renderScenario({
    specs: productSpecs(3),
    provider: createPartialCoverageSyntheticProvider(),
  });
  await addAllFixtureProducts(user, selection);
  await checkSelectedProducts(user);

  expect(await screen.findByText(/Pair coverage: not-covered/)).toBeVisible();
  const limitations = screen.getByRole('region', {
    name: 'Evaluation limitations',
  });
  expect(
    within(limitations).getByText(/provider-pair-coverage-incomplete/),
  ).toBeVisible();
  expect(screen.getAllByText(FIXED_WARNING).length).toBeGreaterThan(0);
});

it('shows unresolved product mapping and preserves the product id and reason', async () => {
  const specs: SyntheticProductSpec[] = [
    ...productSpecs(2),
    {
      sourceProductId: 'SP-CHECKER-UNRESOLVED',
      displayName: 'Unresolved preview product',
      ingredients: [
        {
          sourceIngredientId: 'AI-CHECKER-UNRESOLVED',
          displayName: 'Unresolved fictional ingredient',
          mappingStatus: 'unresolved',
        },
      ],
    },
  ];
  const { user, selection } = await renderScenario({ specs });
  await addAllFixtureProducts(user, selection);
  await checkSelectedProducts(user);

  const limitations = await screen.findByRole('region', {
    name: 'Evaluation limitations',
  });
  expect(within(limitations).getByText(/unresolved-inputs/)).toBeVisible();
  expect(
    within(limitations).getByText(/Unresolved preview product/),
  ).toBeVisible();
  expect(within(limitations).getByText(/unresolved-mapping/)).toBeVisible();
});

it('shows duplicate exposure with all contributing products', async () => {
  const specs: SyntheticProductSpec[] = [
    {
      sourceProductId: 'SP-CHECKER-DUPLICATE-A',
      displayName: 'Duplicate preview product A',
      ingredients: [
        {
          sourceIngredientId: 'AI-CHECKER-DUPLICATE',
          displayName: 'FICTIVOLINUM',
        },
      ],
    },
    {
      sourceProductId: 'SP-CHECKER-DUPLICATE-B',
      displayName: 'Duplicate preview product B',
      ingredients: [
        {
          sourceIngredientId: 'AI-CHECKER-DUPLICATE',
          displayName: 'FICTIVOLINUM',
        },
      ],
    },
  ];
  const { user, selection } = await renderScenario({ specs });
  await addAllFixtureProducts(user, selection);
  await checkSelectedProducts(user);

  const limitations = await screen.findByRole('region', {
    name: 'Evaluation limitations',
  });
  expect(
    within(limitations).getByText(/Duplicate ingredient exposure/),
  ).toBeVisible();
  expect(
    within(limitations).getByText(/Duplicate preview product A/),
  ).toBeVisible();
  expect(
    within(limitations).getByText(/Duplicate preview product B/),
  ).toBeVisible();
});

it('shows the pair count and configured limit without truncating', async () => {
  const { user, selection } = await renderScenario({
    specs: productSpecs(11),
  });
  await addAllFixtureProducts(user, selection);
  await checkSelectedProducts(user);

  expect(
    await screen.findByText(
      `Too many ingredient pairs: 55 requested; limit ${INTERACTION_CHECKER_MAX_PAIRS}. No pairs were evaluated.`,
    ),
  ).toBeVisible();
  expect(
    screen.queryByRole('list', { name: 'Pair assessments' }),
  ).not.toBeInTheDocument();
});

it('shows a provider-unavailable result before any pair assessment', async () => {
  const provider = createOfflineSyntheticProvider({ rightsStatus: 'unknown' });
  const { user, selection } = await renderScenario({ provider });
  await addAllFixtureProducts(user, selection);
  await checkSelectedProducts(user);

  expect(await screen.findByText(/Provider unavailable/)).toBeVisible();
  expect(screen.getByText(/rights-not-permitted/)).toBeVisible();
  expect(
    screen.queryByRole('list', { name: 'Pair assessments' }),
  ).not.toBeInTheDocument();
});

it('shows that an online-only provider is unavailable while the shell is offline', async () => {
  const { user, selection, checker } = await renderScenario({
    provider: createOnlineOnlySyntheticProvider(),
    online: false,
  });
  await addAllFixtureProducts(user, selection);
  await checkSelectedProducts(user);

  expect(
    await screen.findByText(/online-only provider.*browser is offline/i),
  ).toBeVisible();
  expect(checker.evaluate).toHaveBeenCalledWith(selection.productIds, false);
  expect(screen.getByText(/online-required/)).toBeVisible();
});

it('shows source disagreements in the top evaluation limitations', async () => {
  const { user, selection } = await renderScenario({
    provider: createDisagreementSyntheticProvider(),
    decorate: withSyntheticDisagreement,
  });
  await addAllFixtureProducts(user, selection);
  await checkSelectedProducts(user);

  const limitations = await screen.findByRole('region', {
    name: 'Evaluation limitations',
  });
  expect(within(limitations).getByText(/Source disagreements/)).toBeVisible();
  expect(within(limitations).getByText(/severity-terms-differ/)).toBeVisible();
  expect(within(limitations).getByText(/source-band-crimson/)).toBeVisible();
  expect(
    within(limitations).getByText(
      /Source severity term: no interaction is expected/,
    ),
  ).toBeVisible();
  const pair = screen.getByRole('region', {
    name: 'Ingredient pair 1 assessment',
  });
  expect(within(pair).getByText('Sources disagree.')).toBeVisible();
  expect(within(pair).getByText(/source-band-crimson/)).toBeVisible();
  expect(
    within(pair).getByText(/Source severity term: no interaction is expected/),
  ).toBeVisible();
  expect(
    within(pair).queryByText(COVERAGE_DISCREPANCY_SENTENCE),
  ).not.toBeInTheDocument();
  expectNoUnlabelledSafetyLanguage();
});

it.each([
  ['superseded', createSupersededOnlySyntheticProvider],
  ['withdrawn', createWithdrawnOnlySyntheticProvider],
] as const)(
  'shows %s records as history, not active findings',
  async (_label, makeProvider) => {
    const { user, selection } = await renderScenario({
      provider: makeProvider(),
    });
    await addAllFixtureProducts(user, selection);
    await checkSelectedProducts(user);

    const history = await screen.findByRole('region', {
      name: 'Historical interaction records',
    });
    expect(history).toHaveTextContent(_label);
    expect(history).toHaveTextContent(/not active findings/i);
  },
);

it('shows product-to-ingredient resolution and direct ingredient inputs', async () => {
  const { user, selection } = await renderScenario();
  await addAllFixtureProducts(user, selection);
  await checkSelectedProducts(user);

  expect(
    await screen.findByText(/Product to ingredient resolution/),
  ).toBeVisible();
  expect(
    screen.getByText(
      JSON.stringify(selection.snapshot.activeIngredients[0]!.id),
    ),
  ).toBeVisible();
  expect(
    screen.getByText(/Direct ingredient ids: None supplied/),
  ).toBeVisible();
});

it('keeps the selected list ephemeral and provides a named remove button', async () => {
  const { user, selection } = await renderScenario();
  const product = selection.snapshot.products[0]!;
  await user.click(
    await screen.findByRole('button', {
      name: `Add ${product.commercialName}`,
    }),
  );
  const selected = screen.getByRole('region', { name: 'Selected products' });
  expect(within(selected).getByText(product.commercialName)).toBeVisible();
  await user.click(
    screen.getByRole('button', {
      name: `Remove ${product.commercialName} from selection`,
    }),
  );
  expect(
    within(selected).queryByText(product.commercialName),
  ).not.toBeInTheDocument();
});

it('shows the production no-provider state without a check action', async () => {
  render(
    <MemoryRouter>
      <InteractionCheckerPage
        dataset={fixtureDataset(
          fixtureGeneration('generation-production', false),
        )}
        search={{ search: vi.fn() }}
        checker={{
          availability: 'unavailable',
          evaluate: vi.fn(),
        }}
        online={true}
      />
    </MemoryRouter>,
  );

  expect(
    screen.getByRole('heading', { name: 'Check interactions' }),
  ).toBeVisible();
  expect(
    screen.getByText(
      'Interaction checking is unavailable. No approved interaction source is configured.',
    ),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Check selected products' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
});
