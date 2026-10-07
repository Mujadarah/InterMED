import { useSyncExternalStore } from 'react';
import type { ShellController } from '../application/shell';

const availability = {
  development: 'Development server: offline caching disabled',
  unsupported:
    'Shell unavailable offline: secure context or service workers unavailable',
  installing: 'Preparing shell for offline use',
  ready: 'Shell available offline',
  unavailable: 'Shell unavailable offline',
};

/** Present live shell readiness and explicit recovery/update actions from the injected controller. */
export function ShellStatus({ shell }: { shell: ShellController }) {
  const state = useSyncExternalStore(shell.subscribe, shell.getSnapshot);
  const update = state.update === 'available' || state.update === 'blocked';
  return (
    <aside className="shell-status" aria-label="Application shell">
      <p role="status">{availability[state.availability]}</p>
      {state.version && (
        <p className="shell-version">Shell version: {state.version}</p>
      )}
      {state.usingPrior && (
        <p role="status">
          Using a previously cached shell. The latest active shell cache is
          unavailable.
        </p>
      )}
      <p>
        Medication dataset: unavailable. Medication features remain unavailable
        online and offline.
      </p>
      {state.availability === 'unavailable' && (
        <p>
          Reconnect and reload to retry an update, or retry shell caching.
          Storage may be restricted or evicted; an unsuccessful download cannot
          provide offline launch.
        </p>
      )}
      {update && (
        <div role="status">
          <p>Shell update available. Finish your work before updating.</p>
          {state.update === 'blocked' && (
            <p>
              Close other InterMED tabs or windows, then try again. They have
              not been reloaded.
            </p>
          )}
          <button onClick={shell.activate}>Update shell and reload</button>
        </div>
      )}
      {state.update === 'failed' && (
        <p role="alert">
          Shell update failed. A previously cached shell is retained when
          available. Reconnect and check again.
        </p>
      )}
      {state.repairFailed && (
        <p role="alert">
          Shell caching retry failed. Reconnect and retry, or use an available
          shell update.
        </p>
      )}
      {state.update === 'reload' && (
        <div role="status">
          <p>
            A cached shell is ready. Reload when you have finished your work.
          </p>
          <button onClick={shell.reload}>Reload shell when ready</button>
        </div>
      )}
      {state.availability === 'ready' && (
        <button
          onClick={() => {
            void shell.check();
          }}
        >
          Check for shell update
        </button>
      )}
      {(state.availability === 'unavailable' || state.usingPrior) &&
        !update && <button onClick={shell.repair}>Retry shell caching</button>}
      {state.canInstall && (
        <button
          onClick={() => {
            void shell.install();
          }}
        >
          Install development app
        </button>
      )}
    </aside>
  );
}
