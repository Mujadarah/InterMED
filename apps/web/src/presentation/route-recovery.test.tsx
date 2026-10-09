// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { DatasetStateSource, DatasetUpdateState } from '@intermed/domain';
import { App, RouteErrorBoundary } from './App';

// The detail route chunk fails to load; every other route stays real, so the
// shell is still proof that header, navigation and footer remain usable.
// Reading the module's export rejects, which is how a failed chunk import
// surfaces to React.lazy.
vi.mock('./MedicationDetailPage', () => ({
  get MedicationDetailPage() {
    throw new Error('synthetic chunk load failure');
  },
}));

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
  medicationDetail: {
    productDetail: async () => null,
  },
};

it('recovers accessibly and keeps the shell usable when a route chunk fails to load', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/medication/synthetic-product']}>
      <App services={services} />
    </MemoryRouter>,
  );

  const heading = await screen.findByRole('heading', {
    name: 'This page could not be loaded',
  });
  expect(heading).toBeVisible();
  expect(heading).toHaveAttribute('tabindex', '-1');
  expect(
    screen.getByText(
      /Part of this app is unavailable in this browser right now. Its files may have been removed while you were offline/,
    ),
  ).toBeVisible();
  expect(
    screen.queryByText(/synthetic chunk load failure/),
  ).not.toBeInTheDocument();

  // The shell around the failed route is untouched: brand, navigation, footer.
  expect(screen.getByRole('link', { name: 'InterMED overview' })).toBeVisible();
  expect(screen.getByText('Development · Not for clinical use')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Medication search' })).toBeVisible();
  expect(screen.getByText(/InterMED is pre-release software/)).toBeVisible();

  // The recovery offers a reload and a way back into the working shell.
  expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Check development status' }),
  ).toHaveAttribute('href', '/status');

  // The navigation stays usable: the user can leave the failed route.
  await user.click(screen.getByRole('link', { name: 'Medication search' }));
  expect(
    await screen.findByRole('heading', { name: 'Local medication search' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('heading', { name: 'This page could not be loaded' }),
  ).not.toBeInTheDocument();
});

/** A route chunk whose render throws: the boundary's reason to appear. */
function FailingChunk(): ReactNode {
  throw new Error('synthetic chunk load failure');
}

it('reloads the page from the Reload action', async () => {
  const user = userEvent.setup();
  // jsdom owns location.reload as a non-configurable property, so the recovery
  // asks an injected callback to reload and the boundary calls it directly.
  const reload = vi.fn();
  render(
    <MemoryRouter>
      <RouteErrorBoundary reload={reload}>
        <FailingChunk />
      </RouteErrorBoundary>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole('button', { name: 'Reload' }));
  expect(reload).toHaveBeenCalledOnce();
});
