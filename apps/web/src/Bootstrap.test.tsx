// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
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
    expect(screen.getByText(/Medication dataset: unavailable/)).toBeVisible();
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
