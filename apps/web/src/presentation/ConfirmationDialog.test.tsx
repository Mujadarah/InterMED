// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ConfirmationDialog } from './ConfirmationDialog';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('keeps Tab and Shift+Tab on the panel while pending', async () => {
  const user = userEvent.setup();
  let resolveConfirm!: () => void;
  const pending = new Promise<void>((resolve) => {
    resolveConfirm = resolve;
  });
  const onConfirm = vi.fn(() => pending);
  render(
    <ConfirmationDialog
      title="Clear recent searches?"
      message="This removes recent searches from this browser."
      confirmLabel="Clear searches"
      fallbackFocusRef={{ current: null }}
      onCancel={() => undefined}
      onConfirm={onConfirm}
    />,
  );

  await user.click(screen.getByRole('button', { name: 'Clear searches' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);

  const dialog = screen.getByRole('alertdialog', {
    name: 'Clear recent searches?',
  });
  expect(dialog).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Clear searches' })).toBeDisabled();

  expect(dialog).toHaveAttribute('tabindex', '-1');

  dialog.focus();
  expect(document.activeElement).toBe(dialog);

  fireEvent.keyDown(dialog, { key: 'Tab' });
  expect(document.activeElement).toBe(dialog);

  fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(dialog);

  resolveConfirm();
});

function OpenOnTriggerWrapper({
  onConfirmAction,
}: {
  readonly onConfirmAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const fallbackRef = useRef<HTMLHeadingElement>(null);
  return (
    <>
      <h1 ref={fallbackRef} tabIndex={-1}>
        Fallback heading
      </h1>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      {open && (
        <ConfirmationDialog
          title="Clear recent searches?"
          message="This removes recent searches from this browser."
          confirmLabel="Clear searches"
          fallbackFocusRef={fallbackRef}
          onCancel={() => setOpen(false)}
          onConfirm={async () => {
            await onConfirmAction();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

it('returns focus to the invoking element after the pending operation settles', async () => {
  const user = userEvent.setup();
  const onConfirmAction = vi.fn(async () => undefined);
  render(<OpenOnTriggerWrapper onConfirmAction={onConfirmAction} />);

  const trigger = screen.getByRole('button', { name: 'Open dialog' });
  await user.click(trigger);
  expect(
    screen.getByRole('alertdialog', { name: 'Clear recent searches?' }),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

  await user.click(screen.getByRole('button', { name: 'Clear searches' }));
  expect(onConfirmAction).toHaveBeenCalledTimes(1);
  expect(
    await screen.findByRole('button', { name: 'Open dialog' }),
  ).toBeVisible();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open dialog' })).toHaveFocus();
});
