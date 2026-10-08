// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import type {
  DatasetStateSource,
  DatasetUpdateState,
  LocalDatasetGeneration,
  MedicationSearchMatch,
} from '@intermed/domain';
import { presentField } from '@intermed/domain';
import { product as makeProduct } from '../../../../tests/domain/builders';
import type {
  MedicationSearchResponse,
  MedicationSearchService,
} from '../application/medication-search';
import { MedicationSearchPage } from './MedicationSearchPage';
import { getSearchStatusMessage } from './search-status';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const generation: LocalDatasetGeneration = {
  generationId: 'generation-synthetic',
  dataset: 'synthetic-medication-catalogue',
  version: 'synthetic-test',
  schemaVersion: 'medication-catalogue-1',
  sourceIds: [],
  publishedAt: null,
  importedAt: '2026-10-01T00:00:00Z',
  downloadedAt: '2026-10-02T07:30:00.000Z',
  checksum: 'synthetic-test-checksum',
  coverage: 'Synthetic fixture only.',
  recordCounts: { products: 2 },
  synthetic: true,
};

function dataset(state: DatasetUpdateState): DatasetStateSource {
  return { getState: () => state, subscribe: () => () => {} };
}

/** Renders the current router location search so tests can assert the URL. */
function LocationProbe() {
  return <div data-testid="location-search-probe">{useLocation().search}</div>;
}

function locationSearch(): string {
  return screen.getByTestId('location-search-probe').textContent ?? '';
}

function candidate(
  key: string,
  overrides: Parameters<typeof makeProduct>[2] = {},
  ingredientNames: readonly string[] = ['Fictivolinum'],
): MedicationSearchMatch {
  return {
    record: {
      product: makeProduct(key, 'Fictivol', overrides),
      ingredientNames,
      atcCodes: ['SYN-SP-FICTIVOL'],
      dosageFormName: 'fictional tablet',
      manufacturerNames: ['Synthetica Laboratories'],
    },
    rank: 'exact',
  };
}

async function renderCandidateRows(matches: readonly MedicationSearchMatch[]) {
  vi.useFakeTimers();
  const search: MedicationSearchService = {
    search: vi.fn(async () => response(matches)),
  };
  renderPage({ status: 'ready', generation }, search);
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'fictivol' },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  return Array.from(
    screen
      .getByRole('list', { name: 'Medication search results' })
      .querySelectorAll('a'),
  );
}

function response(
  results: readonly MedicationSearchMatch[],
  total = results.length,
  truncated = false,
): MedicationSearchResponse {
  return {
    generationId: generation.generationId,
    results,
    total,
    truncated,
    indexedProductCount: 2,
    indexDurationMilliseconds: 3.2,
    searchDurationMilliseconds: 0.6,
  };
}

function renderPage(
  state: DatasetUpdateState,
  service: MedicationSearchService = {
    search: async () => response([]),
  },
) {
  return render(
    <MemoryRouter initialEntries={['/search']}>
      <MedicationSearchPage dataset={dataset(state)} search={service} />
    </MemoryRouter>,
  );
}

it('shows local provenance and keeps duplicate names distinct with complete source fields', async () => {
  vi.useFakeTimers();
  const matches = [
    candidate('SP-FICTIVOL-A', {
      strengthText: presentField('250 mg'),
      route: presentField('fictional route A'),
      authorizationStatus: presentField('not authorized in synthetic source'),
    }),
    candidate('SP-FICTIVOL-B', {
      strengthText: presentField('500 mg'),
      status: 'removed',
    }),
  ];
  const search: MedicationSearchService = {
    search: vi.fn(async () => response(matches)),
  };
  renderPage({ status: 'ready', generation }, search);

  const input = screen.getByRole('searchbox', { name: /local medication/i });
  expect(screen.getByText('synthetic-test')).toBeVisible();
  expect(screen.getByText(/2026-10-02T07:30:00\.000Z/)).toBeVisible();
  expect(
    screen.getByText('Synthetic development data — not for clinical use.'),
  ).toBeVisible();

  input.focus();
  fireEvent.change(input, { target: { value: 'fictivol' } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });

  const list = screen.getByRole('list', { name: 'Medication search results' });
  expect(list.querySelectorAll('li')).toHaveLength(2);
  expect(screen.getAllByRole('link', { name: /Open Fictivol/ })).toHaveLength(
    2,
  );
  expect(screen.getByText('250 mg')).toBeVisible();
  expect(screen.getByText('500 mg')).toBeVisible();
  expect(screen.getByText('fictional route A')).toBeVisible();
  expect(screen.getByText('not authorized in synthetic source')).toBeVisible();
  expect(screen.getByText('Removed from dataset')).toBeVisible();
  expect(screen.getAllByText('Not provided by source').length).toBeGreaterThan(
    0,
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    '2 medication candidates',
  );
  expect(input).toHaveFocus();
  expect(search.search).toHaveBeenCalledOnce();
});

it('keeps the settled query in the URL for browser back', async () => {
  vi.useFakeTimers();
  const search: MedicationSearchService = {
    search: vi.fn(async () => response([candidate('SP-BACK-QUERY')])),
  };
  render(
    <MemoryRouter initialEntries={['/search']}>
      <LocationProbe />
      <MedicationSearchPage
        dataset={dataset({ status: 'ready', generation })}
        search={search}
      />
    </MemoryRouter>,
  );

  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'fictivol' },
  });
  expect(locationSearch()).toBe('');

  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });

  expect(locationSearch()).toBe('?q=fictivol');
});

it('removes the query from the URL when the input is cleared', async () => {
  vi.useFakeTimers();
  const search: MedicationSearchService = {
    search: vi.fn(async () => response([candidate('SP-CLEARED-QUERY')])),
  };
  render(
    <MemoryRouter initialEntries={['/search?q=fictivol']}>
      <LocationProbe />
      <MedicationSearchPage
        dataset={dataset({ status: 'ready', generation })}
        search={search}
      />
    </MemoryRouter>,
  );
  const input = screen.getByRole('searchbox');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  expect(locationSearch()).toBe('?q=fictivol');

  fireEvent.change(input, { target: { value: '' } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });

  expect(locationSearch()).toBe('');
});

it('visibly and accessibly distinguishes same-name tablets by active ingredient', async () => {
  const rows = await renderCandidateRows([
    candidate(
      'SP-FICTIVOL-INGREDIENT-A',
      { strengthText: presentField('250 mg') },
      ['Fictivolinum'],
    ),
    candidate(
      'SP-FICTIVOL-INGREDIENT-B',
      { strengthText: presentField('250 mg') },
      ['Placebexium'],
    ),
  ]);

  expect(rows).toHaveLength(2);
  expect(new Set(rows.map((row) => row.textContent)).size).toBe(2);
  expect(new Set(rows.map((row) => row.getAttribute('aria-label'))).size).toBe(
    2,
  );
  expect(rows[0]?.textContent).toContain('Fictivolinum');
  expect(rows[1]?.textContent).toContain('Placebexium');
});

it('visibly and accessibly distinguishes same-name tablets by pack and CIM', async () => {
  const rows = await renderCandidateRows([
    candidate('SP-FICTIVOL-PACK-10', {
      strengthText: presentField('500 mg'),
      presentationOrPackDescription: presentField('10 tablets'),
      cim: presentField('CIM-10'),
    }),
    candidate('SP-FICTIVOL-PACK-100', {
      strengthText: presentField('500 mg'),
      presentationOrPackDescription: presentField('100 tablets'),
      cim: presentField('CIM-100'),
    }),
  ]);

  expect(rows).toHaveLength(2);
  expect(new Set(rows.map((row) => row.textContent)).size).toBe(2);
  expect(new Set(rows.map((row) => row.getAttribute('aria-label'))).size).toBe(
    2,
  );
  expect(rows[0]?.textContent).toContain('10 tablets');
  expect(rows[0]?.textContent).toContain('CIM-10');
  expect(rows[1]?.textContent).toContain('100 tablets');
  expect(rows[1]?.textContent).toContain('CIM-100');
});

it('adds source product ids to visible and accessible names for fully colliding rows', async () => {
  const rows = await renderCandidateRows([
    candidate('SP-FICTIVOL-COLLISION-A'),
    candidate('SP-FICTIVOL-COLLISION-B'),
  ]);

  expect(rows).toHaveLength(2);
  expect(new Set(rows.map((row) => row.textContent)).size).toBe(2);
  expect(new Set(rows.map((row) => row.getAttribute('aria-label'))).size).toBe(
    2,
  );
  expect(rows[0]?.textContent).toContain('SP-FICTIVOL-COLLISION-A');
  expect(rows[1]?.textContent).toContain('SP-FICTIVOL-COLLISION-B');
  expect(rows[0]?.getAttribute('aria-label')).toContain(
    'SP-FICTIVOL-COLLISION-A',
  );
  expect(rows[1]?.getAttribute('aria-label')).toContain(
    'SP-FICTIVOL-COLLISION-B',
  );
});

it('announces a truncated result count and caps the rendered list at 50', async () => {
  vi.useFakeTimers();
  const matches = Array.from({ length: 50 }, (_, index) =>
    candidate(`SP-FICTIVOL-${index.toString().padStart(2, '0')}`),
  );
  const search: MedicationSearchService = {
    search: vi.fn(async () => response(matches, 73, true)),
  };
  renderPage({ status: 'ready', generation }, search);
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'fictivol' },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });

  expect(
    screen.getByText('Showing 50 of 73 — refine your search.'),
  ).toBeVisible();
  expect(
    screen
      .getByRole('list', { name: 'Medication search results' })
      .querySelectorAll('li'),
  ).toHaveLength(50);
});

it('leaves an empty query local and reports a no-match result', async () => {
  vi.useFakeTimers();
  const search: MedicationSearchService = {
    search: vi.fn(async () => response([])),
  };
  renderPage({ status: 'ready', generation }, search);
  expect(screen.getByRole('status')).toHaveTextContent(/Enter a name/);
  expect(search.search).not.toHaveBeenCalled();

  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'nomatch' },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  expect(screen.getByRole('status')).toHaveTextContent(
    'No medication products match this search.',
  );
});

it('cancels an older request and never renders its late response', async () => {
  vi.useFakeTimers();
  const olderCompletion: {
    finish?: (value: MedicationSearchResponse) => void;
  } = {};
  let olderSignal: AbortSignal | undefined;
  const newer = candidate('SP-NEWER');
  const olderResponse = new Promise<MedicationSearchResponse>((resolve) => {
    olderCompletion.finish = resolve;
  });
  const search: MedicationSearchService = {
    search: vi.fn((query, signal) => {
      if (query === 'old') {
        olderSignal = signal;
        return olderResponse;
      }
      return Promise.resolve(response([newer]));
    }),
  };
  renderPage({ status: 'ready', generation }, search);
  const input = screen.getByRole('searchbox');
  fireEvent.change(input, { target: { value: 'old' } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });

  fireEvent.change(input, { target: { value: 'new' } });
  expect(olderSignal?.aborted).toBe(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  expect(screen.getAllByRole('link', { name: /Open Fictivol/ })).toHaveLength(
    1,
  );

  await act(async () => {
    olderCompletion.finish?.(response([candidate('SP-OLDER')]));
  });
  expect(screen.getAllByRole('link', { name: /Open Fictivol/ })).toHaveLength(
    1,
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    '1 medication candidate',
  );
});

it('reports a search error without displaying or logging the query', async () => {
  vi.useFakeTimers();
  const search: MedicationSearchService = {
    search: vi.fn(async () => {
      throw new Error('synthetic read failure');
    }),
  };
  renderPage({ status: 'ready', generation }, search);
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'sensitive synthetic query' },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });

  expect(screen.getByRole('alert')).toHaveTextContent(
    'Search is temporarily unavailable. Try again or check dataset status.',
  );
  expect(screen.getByRole('button', { name: 'Retry search' })).toBeVisible();
  expect(
    screen.queryByText('sensitive synthetic query'),
  ).not.toBeInTheDocument();
});

it('retries a failed local query when the user activates Retry search', async () => {
  vi.useFakeTimers();
  let attempts = 0;
  const search: MedicationSearchService = {
    search: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('synthetic read failure');
      return response([candidate('SP-RETRIED')]);
    },
  };
  renderPage({ status: 'ready', generation }, search);
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'fictivol' },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });

  fireEvent.click(screen.getByRole('button', { name: 'Retry search' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });

  expect(attempts).toBe(2);
  expect(screen.getByRole('status')).toHaveTextContent(
    '1 medication candidate',
  );
  expect(screen.getByRole('link', { name: /Open Fictivol/ })).toBeVisible();
});

const unavailableStates: readonly [string, DatasetUpdateState, RegExp][] = [
  ['opening', { status: 'opening' }, /Opening local medication data/],
  [
    'never-downloaded',
    { status: 'never-downloaded' },
    /No medication dataset has been downloaded/,
  ],
  [
    'checking',
    { status: 'checking', generation: null },
    /Checking for a dataset update/,
  ],
  [
    'update-available',
    {
      status: 'update-available',
      generation: null,
      candidate: {
        generationId: 'candidate-generation',
        version: 'synthetic-candidate',
        publishedAt: null,
      },
    },
    /newer dataset is available but is not downloaded/,
  ],
  [
    'downloading',
    {
      status: 'downloading',
      generation: null,
      candidate: {
        generationId: 'candidate-generation',
        version: 'synthetic-candidate',
        publishedAt: null,
      },
    },
    /dataset is downloading/,
  ],
  [
    'staging',
    {
      status: 'staging',
      generation: null,
      candidate: {
        generationId: 'candidate-generation',
        version: 'synthetic-candidate',
        publishedAt: null,
      },
    },
    /being prepared and is not active yet/,
  ],
  [
    'evicted',
    { status: 'evicted', generationId: 'generation-evicted' },
    /missing from this browser/,
  ],
  [
    'unsupported-schema',
    { status: 'unsupported-schema' },
    /written by a newer version of this app/,
  ],
  [
    'reload-required',
    { status: 'reload-required' },
    /Reload this tab to continue/,
  ],
  [
    'storage-unavailable',
    { status: 'storage-unavailable' },
    /does not expose a local database/,
  ],
  [
    'storage-restricted',
    { status: 'storage-restricted' },
    /restricts local storage/,
  ],
  [
    'update-failed',
    { status: 'update-failed', reason: 'bundle-unavailable', generation: null },
    /dataset update failed and no active copy is available/,
  ],
  [
    'storage-quota',
    { status: 'storage-quota', generation: null },
    /storage is full and no active copy is available/,
  ],
];

it.each(unavailableStates)(
  'builds a status message for the %s dataset state',
  (_name, state, expected) => {
    expect(
      getSearchStatusMessage({ datasetState: state, query: '', search: null }),
    ).toMatch(expected);
  },
);

it.each([
  [
    'ready',
    { status: 'ready', generation } satisfies DatasetUpdateState,
    'Enter a name, active ingredient, ATC code, or manufacturer to search.',
  ],
  [
    'checking',
    { status: 'checking', generation } satisfies DatasetUpdateState,
    'Checking for a dataset update. The active local dataset remains available.',
  ],
  [
    'update-available',
    {
      status: 'update-available',
      generation,
      candidate: {
        generationId: 'candidate-generation',
        version: 'synthetic-next',
        publishedAt: null,
      },
    } satisfies DatasetUpdateState,
    'A newer dataset synthetic-next is available but is not downloaded. Search uses the currently active dataset.',
  ],
  [
    'downloading',
    {
      status: 'downloading',
      generation,
      candidate: {
        generationId: 'candidate-generation',
        version: 'synthetic-next',
        publishedAt: null,
      },
    } satisfies DatasetUpdateState,
    'A dataset update is downloading. Search uses the currently active dataset.',
  ],
  [
    'staging',
    {
      status: 'staging',
      generation,
      candidate: {
        generationId: 'candidate-generation',
        version: 'synthetic-next',
        publishedAt: null,
      },
    } satisfies DatasetUpdateState,
    'A dataset update is being prepared. Search uses the currently active dataset.',
  ],
  [
    'update-failed',
    {
      status: 'update-failed',
      reason: 'bundle-unavailable',
      generation,
    } satisfies DatasetUpdateState,
    'The dataset update failed. The previously active dataset remains available.',
  ],
  [
    'storage-quota',
    { status: 'storage-quota', generation } satisfies DatasetUpdateState,
    'Browser storage is full. The previously active dataset remains available.',
  ],
])(
  'builds a status message for an active generation during %s',
  (_name, state, expected) => {
    expect(
      getSearchStatusMessage({
        datasetState: state,
        query: '',
        search: null,
      }),
    ).toBe(expected);
  },
);

it('covers pending, error, empty, singular, plural, and truncated search status', () => {
  const ready: DatasetUpdateState = { status: 'ready', generation };
  expect(
    getSearchStatusMessage({
      datasetState: ready,
      query: 'fictivol',
      search: { status: 'pending' },
    }),
  ).toBe('Searching the active local medication dataset.');
  expect(
    getSearchStatusMessage({
      datasetState: ready,
      query: 'fictivol',
      search: { status: 'error' },
    }),
  ).toBe(
    'Search is temporarily unavailable. Try again or check dataset status.',
  );
  for (const [total, truncated, expected] of [
    [0, false, 'No medication products match this search.'],
    [1, false, '1 medication candidate found.'],
    [2, false, '2 medication candidates found.'],
    [73, true, 'Showing 50 of 73 — refine your search.'],
  ] as const) {
    expect(
      getSearchStatusMessage({
        datasetState: ready,
        query: 'fictivol',
        search: {
          status: 'success',
          response: response(
            Array.from({ length: Math.min(total, 50) }, (_, index) =>
              candidate(`SP-STATUS-${index}`),
            ),
            total,
            truncated,
          ),
        },
      }),
    ).toBe(expected);
  }
});

it.each(unavailableStates)(
  'explains the %s state and links to dataset status',
  (_name, state, message) => {
    const search: MedicationSearchService = {
      search: vi.fn(async () => response([])),
    };
    renderPage(state, search);
    expect(screen.getByRole('status')).toHaveTextContent(message);
    expect(
      screen.getByRole('link', { name: 'Dataset status' }),
    ).toHaveAttribute('href', '/status');
    expect(search.search).not.toHaveBeenCalled();
  },
);

it('continues searching the active generation while an update is available', async () => {
  vi.useFakeTimers();
  const activeUpdate: DatasetUpdateState = {
    status: 'update-available',
    generation,
    candidate: {
      generationId: 'candidate-generation',
      version: 'synthetic-next',
      publishedAt: null,
    },
  };
  const search: MedicationSearchService = {
    search: vi.fn(async () => response([candidate('SP-ACTIVE')])),
  };
  renderPage(activeUpdate, search);
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'fictivol' },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });

  expect(search.search).toHaveBeenCalledOnce();
  expect(
    screen.getByText(/newer dataset synthetic-next is available/),
  ).toBeVisible();
  expect(screen.getAllByRole('link', { name: /Open Fictivol/ })).toHaveLength(
    1,
  );
});
