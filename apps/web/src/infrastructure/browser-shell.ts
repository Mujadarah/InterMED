import type { ShellController, ShellState } from '../application/shell';

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}

/** Keep browser APIs in the adapter; never activate/reload without user action. */
export function createBrowserShell(production: boolean): ShellController {
  let state: ShellState = {
    availability: production ? 'installing' : 'development',
    update: 'none',
    canInstall: false,
  };
  const listeners = new Set<() => void>();
  const emit = (patch: Partial<ShellState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  let registration: ServiceWorkerRegistration | undefined;
  let requestedReload = false;
  let hadController =
    'serviceWorker' in navigator && navigator.serviceWorker.controller !== null;
  let installPrompt: InstallPrompt | undefined;
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
  const check = async () => {
    if (!registration) return;
    try {
      await registration.update();
      await probe();
    } catch {
      emit({ update: 'failed' });
    }
  };
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
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    check,
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
    activate: () => {
      if (!registration?.waiting) return;
      requestedReload = true;
      registration.waiting.postMessage({ type: 'ACTIVATE_SHELL' });
    },
    reload: () => window.location.reload(),
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
