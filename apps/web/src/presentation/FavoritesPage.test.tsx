// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import {
  deriveStableId,
  type DatasetStateSource,
  type DatasetUpdateState,
  type FavoriteEntry,
  type LocalDatasetGeneration,
} from '@intermed/domain';
import type {
  PreferencesService,
  FavoriteListItem,
} from '../application/preferences';
import { FavoritesPage } from './FavoritesPage';

afterEach(cleanup);

const generation: LocalDatasetGeneration = {
  generationId: 'generation-favorites-test',
  dataset: 'synthetic-medication-catalogue',
  version: 'synthetic-favorites-test',
  schemaVersion: 'medication-catalogue-1',
  sourceIds: [],
  publishedAt: null,
  importedAt: '2026-10-01T00:00:00Z',
  downloadedAt: '2026-10-02T00:00:00Z',
  checksum: 'synthetic-favorites-checksum',
  coverage: 'Synthetic fixture only.',
  recordCounts: { products: 1 },
  synthetic: true,
};

const ready: DatasetUpdateState = { status: 'ready', generation };

function productId(key: string) {
  const result = deriveStableId('MedicationProduct', 'synthetic-source', key);
  if (!result.ok) throw new Error('Synthetic product id was rejected');
  return result.id;
}

function favorite(
  key: string,
  name: string,
  status: FavoriteListItem['status'],
  removedAt: string | null = null,
): FavoriteListItem {
  return {
    productId: productId(key),
    createdAt: '2026-10-01T00:00:00.000Z',
    lastKnownDisplayName: name,
    lastKnownDatasetVersionId: null,
    status,
    removedAt,
  };
}

function dataset(state: DatasetUpdateState): DatasetStateSource {
  return { getState: () => state, subscribe: () => () => {} };
}

function preferences(
  overrides: Partial<PreferencesService> = {},
): PreferencesService {
  return {
    listFavorites: async () => [],
    isFavorite: async () => false,
    addFavorite: async (input) => ({
      ...input,
      createdAt: '2026-10-09T00:00:00.000Z',
      status: 'available',
    }),
    removeFavorite: async () => undefined,
    listRecentSearches: async () => [],
    recordOpenedSearch: async () => {
      throw new Error('Unexpected recent search');
    },
    clearRecentSearches: async () => undefined,
    exportPreferences: async (exportedAt) => ({
      format: 'intermed-preferences',
      version: 1,
      exportedAt,
      favorites: [],
      recentSearches: [],
    }),
    clearAllLocalData: async () => ({ status: 'cleared' }),
    ...overrides,
  };
}

function renderPage(
  items: readonly FavoriteListItem[],
  state: DatasetUpdateState = ready,
  overrides: Partial<PreferencesService> = {},
) {
  const service = preferences({
    listFavorites: async () => items,
    ...overrides,
  });
  render(
    <MemoryRouter>
      <FavoritesPage dataset={dataset(state)} preferences={service} />
    </MemoryRouter>,
  );
  return service;
}

it('links only available favorites and explains removed and unresolved entries', async () => {
  renderPage([
    favorite('SP-FICTIVOL', 'Fictivol alpha', 'available'),
    favorite(
      'SP-REMOVED',
      'Placebex last known',
      'removed',
      '2026-10-03T12:45:00.000Z',
    ),
    favorite('SP-UNRESOLVED', 'Synthetica last known', 'unresolved'),
  ]);

  expect(
    await screen.findByRole('link', { name: 'Fictivol alpha' }),
  ).toHaveAttribute(
    'href',
    `/medication/${encodeURIComponent(productId('SP-FICTIVOL'))}`,
  );
  expect(screen.getByText('Available in the active dataset.')).toBeVisible();
  expect(screen.getByText('No longer in the active dataset.')).toBeVisible();
  expect(screen.getByText('Removed on 2026-10-03.')).toBeVisible();
  expect(
    screen.getByText('Could not be checked against the active dataset.'),
  ).toBeVisible();
  expect(
    screen.queryByRole('link', { name: 'Placebex last known' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Synthetica last known' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/similar product/i)).not.toBeInTheDocument();
});

it('keeps favorites visible but not checkable without an active dataset', async () => {
  renderPage(
    [favorite('SP-FICTIVOL', 'Fictivol last known', 'not-checkable')],
    { status: 'never-downloaded' },
  );

  expect(
    await screen.findByText('Fictivol last known', { selector: 'span' }),
  ).toBeVisible();
  expect(
    screen.getByText(
      'No active dataset is available. Favorites are not checkable.',
    ),
  ).toBeVisible();
  expect(screen.getByText('Status: Not checkable.')).toBeVisible();
  expect(
    screen.queryByRole('link', { name: 'Fictivol last known' }),
  ).not.toBeInTheDocument();
});

it('confirms removal, restores focus on cancel, and refreshes after confirmation', async () => {
  const user = userEvent.setup();
  let items = [favorite('SP-FICTIVOL', 'Fictivol alpha', 'available')];
  const removeFavorite = vi.fn(async (id: FavoriteEntry['productId']) => {
    items = items.filter((item) => item.productId !== id);
  });
  renderPage(items, ready, {
    listFavorites: async () => items,
    removeFavorite,
  });
  const remove = await screen.findByRole('button', {
    name: 'Remove Fictivol alpha from favorites',
  });

  await user.click(remove);
  const dialog = screen.getByRole('alertdialog', { name: 'Remove favorite?' });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(remove).toHaveFocus();
  expect(removeFavorite).not.toHaveBeenCalled();

  await user.click(remove);
  await user.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Remove favorite',
    }),
  );
  expect(removeFavorite).toHaveBeenCalledWith(productId('SP-FICTIVOL'));
  expect(await screen.findByText('No favorites yet.')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Favorites' })).toHaveFocus();
});

it('shows an honest empty state', async () => {
  renderPage([]);

  expect(await screen.findByText('No favorites yet.')).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Search local medications' }),
  ).toHaveAttribute('href', '/search');
});
