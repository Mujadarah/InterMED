// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import type { DatasetStateSource, DatasetUpdateState } from '@intermed/domain';
import { App } from './App';

afterEach(cleanup);
const neverDownloaded: DatasetUpdateState = { status: 'never-downloaded' };
const dataset: DatasetStateSource = {
  getState: () => neverDownloaded,
  subscribe: () => () => {},
};
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
    screen.getByRole('heading', { name: 'Local medication search' }),
  ).toBeVisible();
  expect(screen.getByRole('searchbox')).toBeDisabled();
  expect(screen.getByRole('link', { name: 'Dataset status' })).toHaveAttribute(
    'href',
    '/status',
  );
});

it('registers the part A medication detail placeholder with the product id', () => {
  render(
    <MemoryRouter initialEntries={['/medication/synthetic-product-id']}>
      <App services={services} />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole('heading', {
      name: 'Medication detail is not available yet',
    }),
  ).toBeVisible();
  expect(screen.getByText('synthetic-product-id')).toBeVisible();
});
