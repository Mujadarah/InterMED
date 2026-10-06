// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
  expect(screen.getByText(/Medication dataset: unavailable/)).toBeVisible();
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
