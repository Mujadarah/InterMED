// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import type {
  DatasetStateSource,
  DatasetUpdateState,
  LocalDatasetGeneration,
} from '@intermed/domain';
import { presentField } from '@intermed/domain';
import { product as makeProduct } from '../../../../tests/domain/builders';
import { App } from './App';

afterEach(cleanup);
const neverDownloaded: DatasetUpdateState = { status: 'never-downloaded' };
const dataset: DatasetStateSource = {
  getState: () => neverDownloaded,
  subscribe: () => () => {},
};
const appGeneration: LocalDatasetGeneration = {
  generationId: 'generation-app-test',
  dataset: 'synthetic-medication-catalogue',
  version: 'synthetic-app-test',
  schemaVersion: 'medication-catalogue-1',
  sourceIds: [],
  publishedAt: null,
  importedAt: '2026-10-01T00:00:00Z',
  downloadedAt: '2026-10-02T00:00:00Z',
  checksum: 'synthetic-app-checksum',
  coverage: 'Synthetic fixture only.',
  recordCounts: { products: 1 },
  synthetic: true,
};
const appDatasetState: DatasetUpdateState = {
  status: 'ready',
  generation: appGeneration,
};
const appDataset: DatasetStateSource = {
  getState: () => appDatasetState,
  subscribe: () => () => {},
};
const appProduct = makeProduct('SP-APP-TEST', 'Fictivol app test', {
  strengthText: presentField('250 fictional units'),
});
const services = {
  info: {
    label: 'Synthetic contributor mode',
    referenceData: 'unavailable' as const,
  },
  dataset,
  medicationSearch: {
    search: async () => ({
      generationId: null,
      results: [],
      total: 0,
      truncated: false,
      indexedProductCount: 0,
      indexDurationMilliseconds: 0,
      searchDurationMilliseconds: 0,
    }),
  },
  medicationDetail: {
    productDetail: async () => null,
  },
};

it('labels the shell as development and keeps clinical capabilities unavailable', () => {
  render(
    <MemoryRouter>
      <App services={services} />
    </MemoryRouter>,
  );
  expect(screen.getByText('Development · Not for clinical use')).toBeVisible();
  expect(
    screen.getByRole('heading', { name: 'A foundation for InterMED' }),
  ).toBeVisible();
  expect(screen.getByText('Synthetic contributor mode')).toBeVisible();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

it('navigates to limitations using an accessible link', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <App services={services} />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('link', { name: 'Development status' }));
  expect(
    screen.getByRole('heading', { name: 'Development status' }),
  ).toBeVisible();
  expect(screen.getByRole('main')).toHaveFocus();
  expect(
    screen.getByText(
      /Local medication search uses only an active dataset stored in this browser/,
    ),
  ).toBeVisible();
});

it('offers a recovery link for an unknown route', () => {
  render(
    <MemoryRouter initialEntries={['/unknown']}>
      <App services={services} />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole('heading', { name: 'Page unavailable' }),
  ).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Return to overview' }),
  ).toHaveAttribute('href', '/');
});

it('registers the medication search route in navigation', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <App services={services} />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('link', { name: 'Medication search' }));
  expect(
    await screen.findByRole('heading', { name: 'Local medication search' }),
  ).toBeVisible();
  expect(screen.getByRole('searchbox')).toBeDisabled();
  expect(screen.getByRole('link', { name: 'Dataset status' })).toHaveAttribute(
    'href',
    '/status',
  );
});

it('opens a local candidate, restores its search query, and focuses the detail heading', async () => {
  const search = vi.fn(async () => ({
    generationId: appGeneration.generationId,
    results: [
      {
        record: {
          product: appProduct,
          ingredientNames: ['Fictivolinum'],
          atcCodes: ['SYN-APP'],
          dosageFormName: 'fictional tablet',
          manufacturerNames: ['Fictional Works'],
        },
        rank: 'exact' as const,
      },
    ],
    total: 1,
    truncated: false,
    indexedProductCount: 1,
    indexDurationMilliseconds: 0,
    searchDurationMilliseconds: 0,
  }));
  const productDetail = vi.fn(async () => null);
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/search?q=fictivol']}>
      <App
        services={{
          ...services,
          dataset: appDataset,
          medicationSearch: { search },
          medicationDetail: { productDetail },
        }}
      />
    </MemoryRouter>,
  );
  expect(await screen.findByRole('searchbox')).toHaveValue('fictivol');
  const candidate = await screen.findByRole('link', {
    name: /Open Fictivol app test/,
  });
  await user.click(candidate);

  expect(
    await screen.findByRole('heading', { name: 'Product not found' }),
  ).toHaveFocus();
  expect(productDetail).toHaveBeenCalledWith(appProduct.id);
  expect(
    screen.getByRole('link', { name: 'Back to results for fictivol' }),
  ).toHaveAttribute('href', '/search?q=fictivol');
  expect(search).toHaveBeenCalledWith('fictivol', expect.any(AbortSignal));
});
