// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { ShellState } from '../application/shell';
import { ShellStatus } from './ShellStatus';

afterEach(cleanup);
const controller = (state: ShellState) => ({
  getSnapshot: () => state,
  subscribe: () => () => {},
  check: vi.fn(async () => {}),
  repair: vi.fn(),
  activate: vi.fn(),
  reload: vi.fn(),
  install: vi.fn(async () => {}),
});
it('requires an explicit accessible action to activate or reload', async () => {
  const shell = controller({
    availability: 'ready',
    update: 'available',
    canInstall: false,
  });
  render(<ShellStatus shell={shell} />);
  expect(shell.activate).not.toHaveBeenCalled();
  expect(shell.reload).not.toHaveBeenCalled();
  expect(screen.getAllByRole('status')).toHaveLength(2);
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Update shell and reload' }),
  );
  expect(shell.activate).toHaveBeenCalledOnce();
  expect(shell.reload).not.toHaveBeenCalled();
});
it('does not equate cached shell availability with medication availability', () => {
  render(
    <ShellStatus
      shell={controller({
        availability: 'ready',
        update: 'none',
        canInstall: false,
      })}
    />,
  );
  expect(
    screen.getByText(/No cloud medication service is enabled/),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Install development app' }),
  ).not.toBeInTheDocument();
});
it('offers installation only when a browser capability supplies a prompt', async () => {
  const shell = controller({
    availability: 'ready',
    update: 'none',
    canInstall: true,
  });
  render(<ShellStatus shell={shell} />);
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Install development app' }));
  expect(shell.install).toHaveBeenCalledOnce();
});
it('keeps unavailable storage and development mode explicit', () => {
  const view = render(
    <ShellStatus
      shell={controller({
        availability: 'unavailable',
        update: 'failed',
        canInstall: false,
      })}
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Shell update failed');
  expect(screen.getByText(/Reconnect and reload to retry/)).toBeVisible();
  view.rerender(
    <ShellStatus
      shell={controller({
        availability: 'development',
        update: 'none',
        canInstall: false,
      })}
    />,
  );
  expect(
    screen.getByText('Development server: offline caching disabled'),
  ).toBeVisible();
});

it.each([
  ['installing', 'Preparing shell for offline use'],
  [
    'unsupported',
    'Shell unavailable offline: secure context or service workers unavailable',
  ],
] as const)(
  'explains %s without offering an update check or retry',
  (availability, label) => {
    render(
      <ShellStatus
        shell={controller({ availability, update: 'none', canInstall: false })}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(label);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  },
);

it('checks for updates only after the user requests it', async () => {
  const shell = controller({
    availability: 'ready',
    update: 'none',
    canInstall: false,
  });
  render(<ShellStatus shell={shell} />);
  expect(shell.check).not.toHaveBeenCalled();
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Check for shell update' }));
  expect(shell.check).toHaveBeenCalledOnce();
  expect(shell.activate).not.toHaveBeenCalled();
});

it('explains blocked activation and allows an explicit retry', async () => {
  const shell = controller({
    availability: 'ready',
    update: 'blocked',
    canInstall: false,
  });
  render(<ShellStatus shell={shell} />);
  expect(
    screen.getByText(/Close other InterMED tabs or windows/),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Retry shell caching' }),
  ).not.toBeInTheDocument();
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Update shell and reload' }));
  expect(shell.activate).toHaveBeenCalledOnce();
  expect(shell.reload).not.toHaveBeenCalled();
});

it('offers reload without activation when a cached shell is already ready', async () => {
  const shell = controller({
    availability: 'ready',
    update: 'reload',
    canInstall: false,
  });
  render(<ShellStatus shell={shell} />);
  expect(shell.reload).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('button', { name: 'Update shell and reload' }),
  ).not.toBeInTheDocument();
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Reload shell when ready' }));
  expect(shell.reload).toHaveBeenCalledOnce();
  expect(shell.activate).not.toHaveBeenCalled();
});

it.each([
  { availability: 'unavailable', update: 'none', canInstall: false },
  {
    availability: 'ready',
    update: 'failed',
    usingPrior: true,
    canInstall: false,
  },
] satisfies ShellState[])(
  'offers repair for $availability with prior=$usingPrior',
  async (state) => {
    const shell = controller(state);
    render(<ShellStatus shell={shell} />);
    expect(shell.repair).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Retry shell caching' }));
    expect(shell.repair).toHaveBeenCalledOnce();
    expect(shell.reload).not.toHaveBeenCalled();
  },
);

it.each(['available', 'blocked'] as const)(
  'keeps a waiting %s update actionable after repair failure',
  (update) => {
    render(
      <ShellStatus
        shell={controller({
          availability: 'unavailable',
          update,
          repairFailed: true,
          usingPrior: true,
          version: 'synthetic-prior',
          canInstall: false,
        })}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Shell caching retry failed',
    );
    expect(screen.getByText(/Using a previously cached shell/)).toBeVisible();
    expect(screen.getByText('Shell version: synthetic-prior')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Update shell and reload' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Retry shell caching' }),
    ).not.toBeInTheDocument();
  },
);

it('reacts to controller notifications and unsubscribes on unmount', () => {
  let state: ShellState = {
    availability: 'installing',
    update: 'none',
    canInstall: false,
  };
  const listeners = new Set<() => void>();
  const shell = {
    ...controller(state),
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const view = render(<ShellStatus shell={shell} />);
  expect(screen.getByRole('status')).toHaveTextContent(
    'Preparing shell for offline use',
  );
  act(() => {
    state = { availability: 'ready', update: 'available', canInstall: true };
    for (const listener of listeners) listener();
  });
  expect(screen.getByText('Shell available offline')).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Update shell and reload' }),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Install development app' }),
  ).toBeVisible();
  expect(shell.activate).not.toHaveBeenCalled();
  view.unmount();
  expect(listeners.size).toBe(0);
});
