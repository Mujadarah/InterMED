// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { PreferencesService } from '../application/preferences';
import { LocalPreferencesSettings } from './LocalPreferencesSettings';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

it('explains local storage and downloads only the preferences JSON envelope', async () => {
  const user = userEvent.setup();
  const exportPreferences = vi.fn(async (exportedAt: string) => ({
    format: 'intermed-preferences' as const,
    version: 1 as const,
    exportedAt,
    favorites: [],
    recentSearches: [],
  }));
  render(
    <LocalPreferencesSettings
      preferences={preferences({ exportPreferences })}
    />,
  );

  expect(
    screen.getByText(
      /stored only in this browser.*not synced.*quota limits.*browser eviction/i,
    ),
  ).toBeVisible();

  const downloaded = { name: '', blob: null as Blob | null };
  const createObjectURL = vi.fn((blob: Blob) => {
    downloaded.blob = blob;
    return 'blob:intermed-preferences';
  });
  const revokeObjectURL = vi.fn();
  const URLWithBlob = class extends URL {};
  Object.assign(URLWithBlob, { createObjectURL, revokeObjectURL });
  vi.stubGlobal('URL', URLWithBlob);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloaded.name = this.download;
  });

  await user.click(
    screen.getByRole('button', { name: 'Download preferences' }),
  );

  expect(exportPreferences).toHaveBeenCalledOnce();
  expect(downloaded.name).toMatch(
    /^intermed-preferences-\d{4}-\d{2}-\d{2}\.json$/,
  );
  expect(downloaded.blob).toBeInstanceOf(Blob);
  expect(downloaded.blob?.type).toBe('application/json');
  expect(createObjectURL).toHaveBeenCalledOnce();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:intermed-preferences');
});

it('confirms clearing recent searches and reports success', async () => {
  const user = userEvent.setup();
  const clearRecentSearches = vi.fn(async () => undefined);
  render(
    <LocalPreferencesSettings
      preferences={preferences({ clearRecentSearches })}
    />,
  );

  await user.click(
    screen.getByRole('button', { name: 'Clear recent searches' }),
  );
  const dialog = screen.getByRole('alertdialog', {
    name: 'Clear recent searches?',
  });
  expect(dialog).toHaveTextContent(
    'This removes recent searches from this browser.',
  );
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(clearRecentSearches).not.toHaveBeenCalled();

  await user.click(
    screen.getByRole('button', { name: 'Clear recent searches' }),
  );
  await user.click(screen.getByRole('button', { name: 'Clear searches' }));
  expect(clearRecentSearches).toHaveBeenCalledOnce();
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Recent searches cleared.',
  );
});

it('names every data category in the clear-all confirmation', async () => {
  const user = userEvent.setup();
  render(<LocalPreferencesSettings preferences={preferences()} />);

  await user.click(
    screen.getByRole('button', { name: 'Clear all local data' }),
  );
  const dialog = screen.getByRole('alertdialog', {
    name: 'Clear all local data?',
  });
  expect(dialog).toHaveTextContent('downloaded dataset');
  expect(dialog).toHaveTextContent('favorites');
  expect(dialog).toHaveTextContent('recent searches');
});

it('explains writer-busy when another tab prevents clear-all', async () => {
  const user = userEvent.setup();
  const clearAllLocalData = vi.fn(async () => ({
    status: 'refused' as const,
    reason: 'writer-busy' as const,
  }));
  render(
    <LocalPreferencesSettings
      preferences={preferences({ clearAllLocalData })}
    />,
  );

  await user.click(
    screen.getByRole('button', { name: 'Clear all local data' }),
  );
  await user.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Clear all local data',
    }),
  );
  expect(clearAllLocalData).toHaveBeenCalledOnce();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Another tab is updating local data, so this browser’s data was not cleared.',
  );
});
