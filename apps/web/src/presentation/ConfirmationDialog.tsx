import { useEffect, useId, useRef, useState } from 'react';
import type { RefObject } from 'react';

/** A small focus-managed confirmation dialog for destructive local actions. */
export function ConfirmationDialog({
  title,
  message,
  confirmLabel,
  fallbackFocusRef,
  onConfirm,
  onCancel,
}: {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly fallbackFocusRef: RefObject<HTMLElement | null>;
  readonly onConfirm: () => Promise<void> | void;
  readonly onCancel: () => void;
}) {
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const fallbackTarget = fallbackFocusRef.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body &&
      document.activeElement !== document.documentElement
        ? document.activeElement
        : null;
    cancelRef.current?.focus();
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
      else fallbackTarget?.focus();
    };
  }, [fallbackFocusRef]);

  async function confirm() {
    if (pending) return;
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    const panel = dialogRef.current;
    if (panel === null) return;
    const manageKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const buttons = Array.from(
        panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
      );
      const first = buttons[0];
      const last = buttons.at(-1);
      if (!first || !last) {
        // While pending, no enabled button exists: keep focus on the panel
        // instead of letting it escape the modal.
        event.preventDefault();
        panel.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener('keydown', manageKeyboard);
    return () => panel.removeEventListener('keydown', manageKeyboard);
  }, [onCancel, pending]);

  return (
    <div className="confirmation-backdrop">
      <div
        ref={dialogRef}
        className="confirmation-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        aria-busy={pending}
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        <p id={messageId}>{message}</p>
        <div className="confirmation-actions">
          <button
            ref={cancelRef}
            type="button"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void confirm()}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
