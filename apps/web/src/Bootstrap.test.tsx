// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { presentField } from '@intermed/domain';
import { product } from '../../../tests/domain/builders';
import { developmentShell } from './application/shell';
import { Bootstrap } from './Bootstrap';

afterEach(cleanup);
it('shows an accessible startup error for invalid configuration without leaking values', () => {
  render(
    <MemoryRouter>
      <Bootstrap env={{ VITE_RUNTIME_MODE: 'synthetic-invalid-value' }} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Configuration unavailable',
  );
  expect(screen.getByRole('alert')).not.toHaveTextContent(
    'synthetic-invalid-value',
  );
  expect(screen.getByText('Development · Not for clinical use')).toBeVisible();
});

it.each(['/', '/status'])(
  'passes the injected shell through bootstrap and routing at %s',
  async (path) => {
    const state = {
      availability: 'ready' as const,
      update: 'available' as const,
      canInstall: false,
      version: 'injected-shell',
    };
    const shell = {
      ...developmentShell,
      getSnapshot: () => state,
      activate: vi.fn(),
    };
    render(
      <MemoryRouter initialEntries={[path]}>
        <Bootstrap env={{}} shell={shell} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Shell version: injected-shell')).toBeVisible();
    expect(
      screen.getByText(/No cloud medication service is enabled/),
    ).toBeVisible();
    expect(shell.activate).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Update shell and reload' }));
    expect(shell.activate).toHaveBeenCalledOnce();
  },
);

it('uses the development controller by default for valid configuration', () => {
  render(
    <MemoryRouter>
      <Bootstrap env={{}} />
    </MemoryRouter>,
  );
  expect(
    screen.getByText('Development server: offline caching disabled'),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Update shell and reload' }),
  ).not.toBeInTheDocument();
});

it('reuses the search service and in-memory index across Bootstrap renders', async () => {
  const generation = {
    generationId: 'generation-bootstrap-test',
    dataset: 'synthetic-medication-catalogue',
    version: 'synthetic-test',
    schemaVersion: 'medication-catalogue-1',
    sourceIds: [],
    publishedAt: null,
    importedAt: '2026-10-01T00:00:00Z',
    downloadedAt: '2026-10-02T07:30:00.000Z',
    checksum: 'synthetic-test-checksum',
    coverage: 'Synthetic fixture only.',
    recordCounts: { products: 1 },
    synthetic: true,
  };
  const searchRecords = vi.fn(async () => [
    {
      product: product('SP-FICTIVOL', 'Fictivol', {
        strengthText: presentField('250 mg'),
      }),
      ingredientNames: ['Fictivolinum'],
      atcCodes: ['SYN-SP-FICTIVOL'],
      dosageFormName: 'fictional tablet',
      manufacturerNames: ['Synthetica Laboratories'],
    },
  ]);
  const release = vi.fn();
  const localStore = {
    getState: vi.fn(() => state),
    subscribe: vi.fn(() => () => {}),
    openReader: vi.fn(async () => ({
      generationId: generation.generationId,
      searchRecords,
      release,
    })),
  };
  const state = { status: 'ready' as const, generation };

  const user = userEvent.setup();
  const { rerender } = render(
    <MemoryRouter initialEntries={['/search']}>
      <Bootstrap env={{}} localStore={localStore as never} />
    </MemoryRouter>,
  );
  const input = screen.getByRole('searchbox');
  await user.type(input, 'fictivol');
  expect(
    await screen.findByRole('link', { name: /Open Fictivol/ }),
  ).toBeVisible();

  rerender(
    <MemoryRouter initialEntries={['/search']}>
      <Bootstrap
        env={{ VITE_RUNTIME_MODE: 'mock' }}
        localStore={localStore as never}
      />
    </MemoryRouter>,
  );
  await user.clear(screen.getByRole('searchbox'));
  await user.type(screen.getByRole('searchbox'), 'fictivolinum');
  expect(
    await screen.findByRole('link', { name: /Open Fictivol/ }),
  ).toBeVisible();

  expect(localStore.openReader).toHaveBeenCalledOnce();
  expect(searchRecords).toHaveBeenCalledOnce();
  expect(release).toHaveBeenCalledOnce();
});
