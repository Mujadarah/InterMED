import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrowserShell } from './browser-shell';

interface StatusReply {
  ready: boolean;
  version: string;
  fallback?: boolean;
}

/** Minimal message ports allow deterministic replies and timeout tests. */
class TestChannel {
  static instances: TestChannel[] = [];
  port1 = {
    onmessage: null as ((event: { data: StatusReply }) => void) | null,
    close: vi.fn(),
  };
  port2 = {
    postMessage: (data: StatusReply) => this.port1.onmessage?.({ data }),
  };
  constructor() {
    TestChannel.instances.push(this);
  }
}

function worker() {
  return Object.assign(new EventTarget(), {
    state: 'activated',
    postMessage: vi.fn(
      (_message: { type: string }, ports?: TestChannel['port2'][]) => {
        ports?.[0]?.postMessage({ ready: true, version: 'synthetic-release' });
      },
    ),
  });
}

function browser() {
  const active = worker();
  const registration = Object.assign(new EventTarget(), {
    active: active as ReturnType<typeof worker> | null,
    waiting: null as ReturnType<typeof worker> | null,
    installing: null as ReturnType<typeof worker> | null,
    update: vi.fn(async () => {}),
  });
  const serviceWorker = Object.assign(new EventTarget(), {
    controller: active as ReturnType<typeof worker> | null,
    register: vi.fn(async () => registration),
  });
  const window = Object.assign(new EventTarget(), {
    isSecureContext: true,
    setTimeout,
    clearTimeout,
    location: { reload: vi.fn() },
  });
  vi.stubGlobal('window', window);
  vi.stubGlobal('navigator', { serviceWorker });
  vi.stubGlobal('MessageChannel', TestChannel);
  return { active, registration, serviceWorker, window };
}

/** Flush registration and immediate message continuations without real sleeps. */
async function settle() {
  await vi.advanceTimersByTimeAsync(0);
}

let env: ReturnType<typeof browser>;
beforeEach(() => {
  vi.useFakeTimers();
  TestChannel.instances = [];
  env = browser();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function message(type: string) {
  env.serviceWorker.dispatchEvent(
    new MessageEvent('message', { data: { type } }),
  );
}

describe('registration and readiness', () => {
  it('leaves development mode free of registration and installation prompts', async () => {
    const shell = createBrowserShell(false);
    env.window.dispatchEvent(new Event('beforeinstallprompt'));
    await shell.check();
    expect(shell.getSnapshot()).toEqual({
      availability: 'development',
      update: 'none',
      canInstall: false,
    });
    expect(env.serviceWorker.register).not.toHaveBeenCalled();
    expect(env.active.postMessage).not.toHaveBeenCalled();
  });

  it.each(['insecure context', 'missing service workers'])(
    'reports unsupported: %s',
    (reason) => {
      if (reason === 'insecure context') env.window.isSecureContext = false;
      else vi.stubGlobal('navigator', {});
      expect(createBrowserShell(true).getSnapshot().availability).toBe(
        'unsupported',
      );
      expect(env.serviceWorker.register).not.toHaveBeenCalled();
    },
  );

  it('registers at root without cached update scripts and publishes the worker reply', async () => {
    const shell = createBrowserShell(true);
    expect(shell.getSnapshot().availability).toBe('installing');
    await settle();
    expect(env.serviceWorker.register).toHaveBeenCalledExactlyOnceWith(
      '/sw.js',
      {
        scope: '/',
        updateViaCache: 'none',
      },
    );
    expect(shell.getSnapshot()).toMatchObject({
      availability: 'ready',
      version: 'synthetic-release',
      usingPrior: false,
    });
    expect(TestChannel.instances[0]?.port1.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('can retry a failed registration when no worker controls the page', async () => {
    env.serviceWorker.controller = null;
    env.serviceWorker.register.mockRejectedValueOnce(
      new Error('registration denied'),
    );
    const shell = createBrowserShell(true);
    await settle();
    expect(shell.getSnapshot().availability).toBe('unavailable');
    shell.repair();
    expect(shell.getSnapshot().availability).toBe('installing');
    await settle();
    expect(shell.getSnapshot().availability).toBe('ready');
    expect(env.serviceWorker.register).toHaveBeenCalledTimes(2);
  });

  it('does not claim readiness when there is no active or controlling worker', async () => {
    env.serviceWorker.controller = null;
    env.registration.active = null;
    const shell = createBrowserShell(true);
    await settle();
    expect(shell.getSnapshot().availability).toBe('installing');
    expect(TestChannel.instances).toHaveLength(0);
  });

  it('times out at three seconds, closes the port, and recovers on focus', async () => {
    env.active.postMessage.mockImplementationOnce(() => {});
    const shell = createBrowserShell(true);
    await settle();
    await vi.advanceTimersByTimeAsync(2999);
    expect(shell.getSnapshot().availability).toBe('installing');
    await vi.advanceTimersByTimeAsync(1);
    expect(shell.getSnapshot().availability).toBe('unavailable');
    expect(TestChannel.instances[0]?.port1.close).toHaveBeenCalledOnce();
    env.window.dispatchEvent(new Event('focus'));
    await settle();
    expect(shell.getSnapshot().availability).toBe('ready');
  });

  it('reports confirmed missing caches without losing the reported version', async () => {
    env.active.postMessage.mockImplementation((_message, ports) => {
      ports?.[0]?.postMessage({ ready: false, version: 'evicted-release' });
    });
    const shell = createBrowserShell(true);
    await settle();
    expect(shell.getSnapshot()).toMatchObject({
      availability: 'unavailable',
      version: 'evicted-release',
    });
  });

  it('notifies subscribers with a new stable snapshot and honors unsubscription', async () => {
    const shell = createBrowserShell(true);
    const initial = shell.getSnapshot();
    const listener = vi.fn();
    const unsubscribe = shell.subscribe(listener);
    await settle();
    const ready = shell.getSnapshot();
    expect(listener).toHaveBeenCalledOnce();
    expect(ready).not.toBe(initial);
    expect(shell.getSnapshot()).toBe(ready);
    unsubscribe();
    message('SHELL_ACTIVATION_BLOCKED');
    expect(listener).toHaveBeenCalledOnce();
    expect(shell.getSnapshot().update).toBe('blocked');
  });
});

describe('updates and explicit reload consent', () => {
  it.each([true, false])(
    'preserves waiting=%s after a failed network update check',
    async (waiting) => {
      env.registration.waiting = waiting ? worker() : null;
      env.registration.update.mockRejectedValue(new Error('offline'));
      const shell = createBrowserShell(true);
      await settle();
      await shell.check();
      expect(shell.getSnapshot().update).toBe(waiting ? 'available' : 'failed');
      expect(shell.getSnapshot().availability).toBe('ready');
      expect(env.window.location.reload).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    'preserves waiting=%s while using a prior cached shell',
    async (waiting) => {
      env.registration.waiting = waiting ? worker() : null;
      env.active.postMessage.mockImplementation((_message, ports) => {
        ports?.[0]?.postMessage({
          ready: true,
          version: 'prior',
          fallback: true,
        });
      });
      const shell = createBrowserShell(true);
      await settle();
      expect(shell.getSnapshot()).toMatchObject({
        availability: 'ready',
        usingPrior: true,
        version: 'prior',
        update: waiting ? 'available' : 'failed',
      });
    },
  );

  it('checks again on reconnect and probes availability after a successful check', async () => {
    const shell = createBrowserShell(true);
    await settle();
    env.active.postMessage.mockClear();
    env.window.dispatchEvent(new Event('online'));
    await settle();
    expect(env.registration.update).toHaveBeenCalledOnce();
    expect(env.active.postMessage).toHaveBeenCalledOnce();
    expect(shell.getSnapshot().availability).toBe('ready');
  });

  it('waits for explicit activation and the resulting controller change before reloading', async () => {
    const waiting = worker();
    env.registration.waiting = waiting;
    const shell = createBrowserShell(true);
    await settle();
    expect(waiting.postMessage).not.toHaveBeenCalled();
    shell.activate();
    expect(waiting.postMessage).toHaveBeenCalledExactlyOnceWith({
      type: 'ACTIVATE_SHELL',
    });
    expect(env.window.location.reload).not.toHaveBeenCalled();
    env.serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(env.window.location.reload).toHaveBeenCalledOnce();
  });

  it('activation without a waiting worker does not grant reload consent', async () => {
    const shell = createBrowserShell(true);
    await settle();
    shell.activate();
    env.serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(env.window.location.reload).not.toHaveBeenCalled();
    expect(shell.getSnapshot().update).toBe('reload');
    shell.reload();
    expect(env.window.location.reload).toHaveBeenCalledOnce();
  });

  it('distinguishes initial control from a subsequent unsolicited controller change', async () => {
    env.serviceWorker.controller = null;
    const shell = createBrowserShell(true);
    await settle();
    env.serviceWorker.controller = env.active;
    env.serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(shell.getSnapshot().update).toBe('none');
    env.serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(shell.getSnapshot().update).toBe('reload');
    expect(env.window.location.reload).not.toHaveBeenCalled();
  });

  it.each([
    'SHELL_ACTIVATION_BLOCKED',
    'SHELL_UPDATE_FAILED',
    'SHELL_REPAIR_FAILED',
    'updatefound',
    'repair',
  ])('revokes reload consent after %s', async (event) => {
    env.registration.waiting = worker();
    const shell = createBrowserShell(true);
    await settle();
    shell.activate();
    if (event === 'updatefound')
      env.registration.dispatchEvent(new Event(event));
    else if (event === 'repair') shell.repair();
    else message(event);
    env.serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(env.window.location.reload).not.toHaveBeenCalled();
    expect(shell.getSnapshot().update).toBe('reload');
  });

  it('reports a blocked activation and permits an explicit retry', async () => {
    const waiting = worker();
    env.registration.waiting = waiting;
    const shell = createBrowserShell(true);
    await settle();
    shell.activate();
    message('SHELL_ACTIVATION_BLOCKED');
    expect(shell.getSnapshot().update).toBe('blocked');
    shell.activate();
    env.serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(waiting.postMessage).toHaveBeenCalledTimes(2);
    expect(env.window.location.reload).toHaveBeenCalledOnce();
  });

  it.each([true, false])(
    'reports installation failure with active=%s',
    async (active) => {
      env.registration.active = active ? env.active : null;
      const shell = createBrowserShell(true);
      await settle();
      message('SHELL_UPDATE_FAILED');
      expect(shell.getSnapshot()).toMatchObject(
        active ? { update: 'failed' } : { availability: 'unavailable' },
      );
    },
  );

  it('watches newly discovered workers and advertises installation without autoactivation', async () => {
    const shell = createBrowserShell(true);
    await settle();
    const candidate = worker();
    candidate.state = 'installing';
    env.registration.installing = candidate;
    env.registration.dispatchEvent(new Event('updatefound'));
    env.registration.waiting = candidate;
    candidate.state = 'installed';
    candidate.dispatchEvent(new Event('statechange'));
    expect(shell.getSnapshot().update).toBe('available');
    expect(candidate.postMessage).not.toHaveBeenCalled();
    candidate.state = 'redundant';
    candidate.dispatchEvent(new Event('statechange'));
    expect(shell.getSnapshot().update).toBe('failed');
  });

  it('ignores unrelated worker messages', async () => {
    const shell = createBrowserShell(true);
    await settle();
    const snapshot = shell.getSnapshot();
    message('UNRELATED');
    env.serviceWorker.dispatchEvent(
      new MessageEvent('message', { data: null }),
    );
    expect(shell.getSnapshot()).toBe(snapshot);
  });
});

describe('repair and installation capability', () => {
  it.each([true, false])(
    'repairs through the controller and preserves waiting=%s',
    async (waiting) => {
      env.registration.waiting = waiting ? worker() : null;
      const shell = createBrowserShell(true);
      await settle();
      message('SHELL_REPAIR_FAILED');
      expect(shell.getSnapshot().repairFailed).toBe(true);
      shell.repair();
      expect(shell.getSnapshot().repairFailed).toBe(false);
      expect(env.active.postMessage).toHaveBeenCalledWith({
        type: 'REPAIR_SHELL',
      });
      message('SHELL_REPAIRED');
      await settle();
      expect(shell.getSnapshot()).toMatchObject({
        repairFailed: false,
        update: waiting ? 'available' : 'reload',
      });
      expect(env.window.location.reload).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'consumes the install prompt once, including browser rejection=%s',
    async (reject) => {
      const shell = createBrowserShell(true);
      await settle();
      await shell.install();
      const prompt = vi.fn(async () => {
        if (reject) throw new Error('dismissed');
      });
      const event = Object.assign(
        new Event('beforeinstallprompt', { cancelable: true }),
        { prompt },
      );
      env.window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(shell.getSnapshot().canInstall).toBe(true);
      expect(prompt).not.toHaveBeenCalled();
      await expect(shell.install()).resolves.toBeUndefined();
      await shell.install();
      expect(prompt).toHaveBeenCalledOnce();
      expect(shell.getSnapshot().canInstall).toBe(false);
    },
  );

  it('discards a deferred prompt after installation elsewhere', async () => {
    const shell = createBrowserShell(true);
    const prompt = vi.fn(async () => {});
    env.window.dispatchEvent(
      Object.assign(new Event('beforeinstallprompt'), { prompt }),
    );
    env.window.dispatchEvent(new Event('appinstalled'));
    await shell.install();
    expect(shell.getSnapshot().canInstall).toBe(false);
    expect(prompt).not.toHaveBeenCalled();
  });
});
