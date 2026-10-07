import type { ShellController, ShellState } from '../application/shell';

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}

/**
 * Create a browser shell controller; activation requests and reloads require
 * calls to its explicit actions.
 * With production enabled, listen for installation events and, in a secure
 * context with service workers, register the root worker and track readiness
 * and updates for the page lifetime. Otherwise report unsupported availability.
 * With production disabled, start in development state without registration
 * or listeners. Reload still reloads the page. Repair still messages a
 * controlling worker or retries registration. Check, activate and install do
 * nothing until a registration or install prompt exists.
 */
export function createBrowserShell(production: boolean): ShellController {
  let state: ShellState = {
    availability: production ? 'installing' : 'development',
    update: 'none',
    canInstall: false,
  };
  const listeners = new Set<() => void>();
  /** Merge a state patch and notify subscribers synchronously; listener errors propagate. */
  const emit = (patch: Partial<ShellState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  let registration: ServiceWorkerRegistration | undefined;
  let requestedReload = false;
  let hadController =
    'serviceWorker' in navigator && navigator.serviceWorker.controller !== null;
  let installPrompt: InstallPrompt | undefined;
  /**
   * Refresh readiness from the controlling or active worker, if one exists.
   * A failed request or a 3-second timeout marks offline use unavailable.
   * A prior-shell fallback marks the update failed unless an update is waiting.
   */
  const probe = async () => {
    const worker = navigator.serviceWorker.controller ?? registration?.active;
    if (!worker) return;
    try {
      const result = await new Promise<{
        ready: boolean;
        version: string;
        fallback?: boolean;
      }>((resolve, reject) => {
        const channel = new MessageChannel();
        const timeout = window.setTimeout(() => {
          channel.port1.close();
          reject(new Error('No shell response'));
        }, 3000);
        channel.port1.onmessage = (event) => {
          window.clearTimeout(timeout);
          channel.port1.close();
          resolve(event.data);
        };
        worker.postMessage({ type: 'SHELL_STATUS' }, [channel.port2]);
      });
      emit({
        availability: result.ready ? 'ready' : 'unavailable',
        version: result.version,
        usingPrior: result.fallback === true,
        ...(result.fallback && !registration?.waiting
          ? { update: 'failed' as const }
          : {}),
      });
    } catch {
      emit({ availability: 'unavailable' });
    }
  };
  /**
   * Check an existing registration for updates, then refresh readiness.
   * Update failures preserve a waiting update as available; otherwise mark failure.
   */
  const check = async () => {
    if (!registration) return;
    try {
      await registration.update();
      await probe();
    } catch {
      emit({ update: registration.waiting ? 'available' : 'failed' });
    }
  };
  /** Observe worker state changes to report waiting updates, activation and failure. */
  const watch = (worker: ServiceWorker) => {
    worker.addEventListener('statechange', () => {
      if (
        worker.state === 'installed' &&
        registration?.waiting &&
        navigator.serviceWorker.controller
      )
        emit({ update: 'available' });
      if (worker.state === 'activated') void probe();
      if (worker.state === 'redundant')
        emit(
          registration?.active
            ? { update: 'failed' }
            : { availability: 'unavailable' },
        );
    });
  };
  /**
   * Register the root worker and begin tracking its lifecycle and readiness.
   * Registration rejections mark offline use unavailable; the readiness probe
   * can finish after this promise resolves.
   */
  const register = () =>
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((value) => {
        const firstRegistration = registration !== value;
        registration = value;
        if (value.waiting) emit({ update: 'available' });
        if (value.installing) watch(value.installing);
        if (firstRegistration)
          value.addEventListener('updatefound', () => {
            requestedReload = false;
            if (value.installing) watch(value.installing);
          });
        void probe();
      })
      .catch(() => emit({ availability: 'unavailable' }));
  if (production) {
    if (!window.isSecureContext || !('serviceWorker' in navigator))
      emit({ availability: 'unsupported' });
    else {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SHELL_REPAIRED') {
          emit({
            repairFailed: false,
            update: registration?.waiting ? 'available' : 'reload',
          });
          void probe();
        }
        if (event.data?.type === 'SHELL_REPAIR_FAILED') {
          requestedReload = false;
          emit({ repairFailed: true });
          void probe();
        }
        if (event.data?.type === 'SHELL_UPDATE_FAILED') {
          requestedReload = false;
          emit(
            registration?.active
              ? { update: 'failed' }
              : { availability: 'unavailable' },
          );
        }
        if (event.data?.type === 'SHELL_ACTIVATION_BLOCKED') {
          requestedReload = false;
          emit({ update: 'blocked' });
        }
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (requestedReload) window.location.reload();
        else {
          emit({ update: hadController ? 'reload' : 'none' });
          void probe();
        }
        hadController = true;
      });
      void register();
      window.addEventListener('online', () => {
        void check();
      });
      window.addEventListener('focus', () => {
        void probe();
      });
    }
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      installPrompt = event as InstallPrompt;
      emit({ canInstall: true });
    });
    window.addEventListener('appinstalled', () => {
      installPrompt = undefined;
      emit({ canInstall: false });
    });
  }
  return {
    /** Return the current snapshot, retaining its identity until the next state patch. */
    getSnapshot: () => state,
    /** Subscribe to state patches and return a function that removes the listener. */
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    check,
    /**
     * Clear reload consent and request cache repair from the controlling worker,
     * or retry registration if none controls the page. Completion is reported in state.
     * Requires service worker support. Subscriber and worker messaging errors propagate.
     */
    repair: () => {
      requestedReload = false;
      emit({ repairFailed: false });
      if (navigator.serviceWorker.controller)
        navigator.serviceWorker.controller.postMessage({
          type: 'REPAIR_SHELL',
        });
      else {
        emit({ availability: 'installing' });
        void register();
      }
    },
    /**
     * Request activation of a waiting update and reload on the controller change.
     * Do nothing without a waiting worker; a worker refusal clears reload consent.
     */
    activate: () => {
      if (!registration?.waiting) return;
      requestedReload = true;
      registration.waiting.postMessage({ type: 'ACTIVATE_SHELL' });
    },
    /** Reload the current page immediately. */
    reload: () => window.location.reload(),
    /**
     * Consume the available browser installation prompt, if any.
     * Prompt failures are caught; completion does not confirm installation.
     */
    install: async () => {
      if (!installPrompt) return;
      const prompt = installPrompt;
      installPrompt = undefined;
      emit({ canInstall: false });
      try {
        await prompt.prompt();
      } catch {
        /* Browser can decline or restrict installation. */
      }
    },
  };
}
