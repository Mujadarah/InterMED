import { createHash, webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import type { ShellRelease } from './shell-build';
import { renderWorker } from './worker';

const origin = 'https://shell.example';
const prefix = 'intermed-public-shell-v1-';
const version = 'a'.repeat(20);
const priorVersion = 'b'.repeat(20);
const bodies = new Map([
  ['/index.html', '<html>synthetic shell</html>'],
  ['/assets/app-a.js', 'console.log("synthetic shell");'],
  ['/assets/app-a.css', 'body { color: black; }'],
]);
const release: ShellRelease = {
  version,
  assets: [...bodies].map(([url, body]) => ({
    url,
    hash: createHash('sha256').update(body).digest('hex'),
    type: url.endsWith('.html')
      ? 'text/html'
      : url.endsWith('.css')
        ? 'text/css'
        : 'javascript',
  })),
};

type WorkerRequest = Pick<Request, 'url' | 'method' | 'mode' | 'headers'>;
interface WorkerEvent {
  data?: { type: string };
  ports?: { postMessage: (value: unknown) => void }[];
  source?: { postMessage: (value: unknown) => void };
  request?: WorkerRequest;
  waitUntil: (promise: Promise<unknown>) => void;
  respondWith: (promise: Promise<Response>) => void;
}

/** Cache doubles clone bodies on both boundaries, like Cache Storage. */
function memoryCache() {
  const responses = new Map<string, Response>();
  return {
    responses,
    match: vi.fn(async (url: string) => responses.get(url)?.clone()),
    put: vi.fn(async (url: string, response: Response) => {
      responses.set(url, response.clone());
    }),
  };
}

/** Execute the emitted worker through its public events, using real response
 * bodies and SHA-256 with isolated in-memory storage and no network access. */
function worker() {
  const stores = new Map<string, ReturnType<typeof memoryCache>>();
  const caches = {
    has: vi.fn(async (name: string) => stores.has(name)),
    keys: vi.fn(async () => [...stores.keys()]),
    open: vi.fn(async (name: string) => {
      let cache = stores.get(name);
      if (!cache) {
        cache = memoryCache();
        stores.set(name, cache);
      }
      return cache;
    }),
    delete: vi.fn(async (name: string) => stores.delete(name)),
  };
  const fetch = vi.fn(async (request: WorkerRequest) => {
    const path = new URL(request.url).pathname;
    return new Response(bodies.get(path) ?? 'network response', {
      headers: {
        'content-type': path.endsWith('.html')
          ? 'text/html'
          : path.endsWith('.css')
            ? 'text/css'
            : 'text/javascript',
      },
    });
  });
  const client = { url: `${origin}/status`, postMessage: vi.fn() };
  const clients = {
    matchAll: vi.fn(async () => [client]),
    claim: vi.fn(async () => {}),
  };
  const self = {
    location: { origin },
    registration: { scope: `${origin}/`, active: null },
    clients,
    skipWaiting: vi.fn(async () => {}),
    addEventListener: (
      name: string,
      listener: (event: WorkerEvent) => void,
    ) => {
      listeners.set(name, listener);
    },
  };
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  // Browsers resolve relative Request URLs against the worker's origin.
  class OriginRequest extends Request {
    constructor(input: string | URL | Request, init?: RequestInit) {
      super(typeof input === 'string' ? new URL(input, origin) : input, init);
    }
  }
  runInNewContext(renderWorker(release), {
    self,
    caches,
    fetch,
    Request: OriginRequest,
    Response,
    Headers,
    URL,
    URLSearchParams,
    crypto: webcrypto,
    setTimeout,
    clearTimeout,
  });

  async function dispatch(name: string, input: Partial<WorkerEvent> = {}) {
    const pending: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    const listener = listeners.get(name);
    if (!listener) throw new Error(`Missing worker listener: ${name}`);
    listener({
      ...input,
      waitUntil: (promise) => pending.push(promise),
      respondWith: (promise) => {
        response = promise;
      },
    });
    await Promise.all(pending);
    return response;
  }
  async function message(type: string) {
    const reply = vi.fn();
    await dispatch('message', {
      data: { type },
      ports: [{ postMessage: reply }],
      source: client,
    });
    return reply;
  }
  async function seed(shellVersion = version, order?: number) {
    const cache = await caches.open(prefix + shellVersion);
    for (const asset of release.assets) {
      const headers = new Headers({
        'content-type':
          asset.type === 'javascript' ? 'text/javascript' : asset.type,
      });
      if (asset.url === '/index.html') {
        headers.set('X-Intermed-Shell-Version', shellVersion);
        headers.set('X-Intermed-Shell-Assets', JSON.stringify(release.assets));
        if (order !== undefined)
          headers.set('X-Intermed-Activation-Order', String(order));
      }
      await cache.put(
        asset.url,
        new Response(bodies.get(asset.url), { headers }),
      );
    }
    return cache;
  }
  return { caches, stores, fetch, self, client, dispatch, message, seed };
}

function request(
  path: string,
  overrides: Partial<WorkerRequest> = {},
): WorkerRequest {
  return {
    url: new URL(path, origin).href,
    method: 'GET',
    mode: 'cors',
    headers: new Headers(),
    ...overrides,
  };
}

async function setIndexHeader(
  cache: ReturnType<typeof memoryCache>,
  name: string,
  value: string,
) {
  const index = await cache.match('/index.html');
  if (!index) throw new Error('Missing index fixture');
  const headers = new Headers(index.headers);
  headers.set(name, value);
  await cache.put('/index.html', new Response(await index.text(), { headers }));
}

it('installs only pinned public bytes with credential-free, uncached requests and no automatic activation', async () => {
  const env = worker();
  await env.dispatch('install');
  expect(env.fetch).toHaveBeenCalledTimes(release.assets.length);
  expect(
    env.fetch.mock.calls.map(([value]) => new URL(value.url).pathname),
  ).toEqual(release.assets.map(({ url }) => url));
  for (const [value] of env.fetch.mock.calls) {
    expect(value).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
    });
  }
  const status = await env.message('SHELL_STATUS');
  expect(status).toHaveBeenCalledExactlyOnceWith({
    ready: true,
    storageAccessible: true,
    version,
    workerVersion: version,
    fallback: false,
  });
  expect(env.self.skipWaiting).not.toHaveBeenCalled();
  expect(env.self.clients.claim).not.toHaveBeenCalled();
});

it.each([
  [
    'corrupt bytes',
    () => new Response('corrupt', { headers: { 'content-type': 'text/html' } }),
  ],
  [
    'wrong MIME essence',
    () =>
      new Response(bodies.get('/index.html'), {
        headers: { 'content-type': 'text/htmljunk' },
      }),
  ],
  [
    'failed response',
    () =>
      new Response('unavailable', {
        status: 503,
        headers: { 'content-type': 'text/html' },
      }),
  ],
  ['missing MIME', () => new Response(new Uint8Array([1]))],
  [
    'oversized body',
    () =>
      new Response('x'.repeat(2 * 1024 * 1024 + 1), {
        headers: { 'content-type': 'text/html' },
      }),
  ],
] as const)(
  'discards a failed candidate (%s) while preserving unrelated storage',
  async (_label, response) => {
    const env = worker();
    const unrelated = await env.caches.open('unrelated-cache');
    await unrelated.put('/canary', new Response('keep'));
    env.fetch.mockResolvedValueOnce(response());
    await expect(env.dispatch('install')).rejects.toThrow(
      'Unusable shell asset',
    );
    expect(env.stores.has(prefix + version)).toBe(false);
    expect(await (await unrelated.match('/canary'))?.text()).toBe('keep');
    expect(env.client.postMessage).toHaveBeenCalledWith({
      type: 'SHELL_UPDATE_FAILED',
    });
  },
);

it('deletes partial candidate writes when a later download fails', async () => {
  const env = worker();
  env.fetch
    .mockResolvedValueOnce(
      new Response(bodies.get('/index.html'), {
        headers: { 'content-type': 'text/html' },
      }),
    )
    .mockRejectedValueOnce(new Error('offline'));
  await expect(env.dispatch('install')).rejects.toThrow('offline');
  expect(env.stores.has(prefix + version)).toBe(false);
  expect(env.client.postMessage).toHaveBeenCalledWith({
    type: 'SHELL_UPDATE_FAILED',
  });
});

it.each([
  'text/javascript',
  'application/javascript',
  'Text/JavaScript; charset=UTF-8',
])('accepts supported JavaScript MIME %s', async (mime) => {
  const env = worker();
  const cache = await env.seed();
  await cache.put(
    '/assets/app-a.js',
    new Response(bodies.get('/assets/app-a.js'), {
      headers: { 'content-type': mime },
    }),
  );
  expect(await env.message('SHELL_STATUS')).toHaveBeenCalledWith(
    expect.objectContaining({ ready: true }),
  );
});

it.each([
  ['invalid JSON', '{'],
  ['not an array', '{}'],
  ['empty asset list', '[]'],
  ['missing index', JSON.stringify(release.assets.slice(1))],
  ['duplicate asset', JSON.stringify([...release.assets, release.assets[0]])],
  [
    'nonpublic URL',
    JSON.stringify([
      ...release.assets,
      { url: '/api/private', hash: 'a'.repeat(64), type: 'javascript' },
    ]),
  ],
  [
    'invalid hash',
    JSON.stringify(
      release.assets.map((asset) => ({ ...asset, hash: 'invalid' })),
    ),
  ],
  [
    'incorrect type',
    JSON.stringify(
      release.assets.map((asset) => ({ ...asset, type: 'text/plain' })),
    ),
  ],
  ['null entry', JSON.stringify([...release.assets, null])],
  [
    'too many entries',
    JSON.stringify(Array.from({ length: 17 }, () => release.assets[0])),
  ],
])('rejects prior-shell metadata with %s', async (_label, metadata) => {
  const env = worker();
  const cache = await env.seed(priorVersion, 1);
  await setIndexHeader(cache, 'X-Intermed-Shell-Assets', metadata);
  expect(await env.message('SHELL_STATUS')).toHaveBeenCalledWith(
    expect.objectContaining({
      ready: false,
      storageAccessible: true,
      fallback: false,
    }),
  );
});

it('rejects modified current-release pins even when metadata and cached bytes agree', async () => {
  const env = worker();
  const cache = await env.seed();
  const changed = 'changed JavaScript';
  await cache.put(
    '/assets/app-a.js',
    new Response(changed, { headers: { 'content-type': 'text/javascript' } }),
  );
  await setIndexHeader(
    cache,
    'X-Intermed-Shell-Assets',
    JSON.stringify(
      release.assets.map((asset) =>
        asset.url.endsWith('.js')
          ? {
              ...asset,
              hash: createHash('sha256').update(changed).digest('hex'),
            }
          : asset,
      ),
    ),
  );
  expect(await env.message('SHELL_STATUS')).toHaveBeenCalledWith(
    expect.objectContaining({ ready: false }),
  );
});

it('rejects cache metadata naming a different version', async () => {
  const env = worker();
  const cache = await env.seed();
  await setIndexHeader(cache, 'X-Intermed-Shell-Version', priorVersion);
  expect(await env.message('SHELL_STATUS')).toHaveBeenCalledWith(
    expect.objectContaining({ ready: false }),
  );
});

it.each(['/index.html', '/assets/app-a.js', '/assets/app-a.css'])(
  'revalidates cached bytes for %s on every status request',
  async (path) => {
    const env = worker();
    const cache = await env.seed();
    expect(await env.message('SHELL_STATUS')).toHaveBeenCalledWith(
      expect.objectContaining({ ready: true }),
    );
    const response = await cache.match(path);
    await cache.put(
      path,
      new Response('corrupted after readiness', { headers: response!.headers }),
    );
    expect(await env.message('SHELL_STATUS')).toHaveBeenCalledWith(
      expect.objectContaining({ ready: false }),
    );
  },
);

it('selects the most recently activated prior release, ignoring insertion order and waiting candidates', async () => {
  const env = worker();
  await env.seed(priorVersion, 5);
  await env.seed('c'.repeat(20), 2);
  await env.seed('d'.repeat(20));
  expect(await env.message('SHELL_STATUS')).toHaveBeenCalledWith(
    expect.objectContaining({
      ready: true,
      version: priorVersion,
      workerVersion: version,
      fallback: true,
    }),
  );
});

it.each([undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
  'does not serve a prior release with invalid activation order %s',
  async (order) => {
    const env = worker();
    await env.seed(priorVersion, order);
    expect(await env.message('SHELL_STATUS')).toHaveBeenCalledWith(
      expect.objectContaining({ ready: false }),
    );
  },
);

it('prefers a usable current release over a later activation order in another cache', async () => {
  const env = worker();
  await env.seed();
  await env.seed(priorVersion, 99);
  expect(await env.message('SHELL_STATUS')).toHaveBeenCalledWith(
    expect.objectContaining({ ready: true, version, fallback: false }),
  );
});

it('distinguishes inaccessible storage from missing caches', async () => {
  const env = worker();
  env.caches.keys.mockRejectedValue(new Error('storage denied'));
  expect(await env.message('SHELL_STATUS')).toHaveBeenCalledExactlyOnceWith({
    ready: false,
    storageAccessible: false,
    version,
    workerVersion: version,
  });
});

it.each([
  request('/api/private'),
  request('/auth/session'),
  request('/patient/synthetic'),
  request('/assets/app-a.js.map'),
  request('/assets/nested/private.js'),
  request('https://external.example/assets/app-a.js'),
  request('/assets/app-a.js?query=value'),
  request('/search?x=1', { mode: 'navigate' }),
  request('/search?q=fictivol&x=1', { mode: 'navigate' }),
  request('/medication/synthetic-product?q=a&q=b', { mode: 'navigate' }),
  request('/assets/app-a.js?q=fictivol'),
  request('/assets/app-a.js', { method: 'POST' }),
  request('/assets/app-a.js', { method: 'HEAD' }),
  request('/assets/app-a.js', {
    headers: new Headers({ authorization: 'synthetic-test-value' }),
  }),
  request('/unknown', { mode: 'navigate' }),
  request('/status'),
])('does not intercept excluded request $method $url', async (input) => {
  const env = worker();
  expect(await env.dispatch('fetch', { request: input })).toBeUndefined();
  expect(env.caches.keys).not.toHaveBeenCalled();
  expect(env.fetch).not.toHaveBeenCalled();
});

it.each([
  '/',
  '/status',
  '/search',
  '/medication/synthetic-product',
  '/search?q=fictivol',
  '/status?q=',
  '/?q=',
  '/medication/synthetic-product?q=fictivol',
])('serves verified index HTML for offline navigation to %s', async (path) => {
  const env = worker();
  await env.seed();
  const response = await env.dispatch('fetch', {
    request: request(path, { mode: 'navigate' }),
  });
  expect(await response?.text()).toBe(bodies.get('/index.html'));
  expect(env.fetch).not.toHaveBeenCalled();
});

it('validates the requested static asset and index without reading unrelated cached bodies', async () => {
  const env = worker();
  const cache = await env.seed();
  cache.match.mockClear();
  const response = await env.dispatch('fetch', {
    request: request('/assets/app-a.js'),
  });
  expect(await response?.text()).toBe(bodies.get('/assets/app-a.js'));
  expect(cache.match.mock.calls).toEqual([
    ['/index.html'],
    ['/assets/app-a.js'],
  ]);
  expect(env.fetch).not.toHaveBeenCalled();
});

it.each(['corruption', 'missing asset', 'storage denial'])(
  'falls back to network without caching an unverified response after %s',
  async (failure) => {
    const env = worker();
    const cache = await env.seed();
    if (failure === 'corruption')
      await cache.put(
        '/assets/app-a.js',
        new Response('corrupt', {
          headers: { 'content-type': 'text/javascript' },
        }),
      );
    if (failure === 'missing asset') cache.responses.delete('/assets/app-a.js');
    if (failure === 'storage denial')
      env.caches.keys.mockRejectedValue(new Error('denied'));
    cache.put.mockClear();
    const input = request('/assets/app-a.js');
    const response = await env.dispatch('fetch', { request: input });
    expect(await response?.text()).toBe(bodies.get('/assets/app-a.js'));
    expect(env.fetch).toHaveBeenCalledExactlyOnceWith(input);
    expect(cache.put).not.toHaveBeenCalled();
  },
);

it('refuses activation with multiple in-scope windows', async () => {
  const env = worker();
  await env.seed();
  env.self.clients.matchAll.mockResolvedValue([
    env.client,
    { ...env.client, url: `${origin}/` },
  ]);
  await env.message('ACTIVATE_SHELL');
  expect(env.client.postMessage).toHaveBeenCalledWith({
    type: 'SHELL_ACTIVATION_BLOCKED',
  });
  expect(env.self.skipWaiting).not.toHaveBeenCalled();
});

it('activates only on request and excludes out-of-scope windows from the tab count', async () => {
  const env = worker();
  await env.seed();
  env.self.clients.matchAll.mockResolvedValue([
    env.client,
    { ...env.client, url: 'https://external.example/' },
  ]);
  await env.message('ACTIVATE_SHELL');
  expect(env.self.skipWaiting).toHaveBeenCalledOnce();
  expect(env.self.clients.matchAll).toHaveBeenCalledWith({
    type: 'window',
    includeUncontrolled: true,
  });
});

it.each(['missing bytes', 'storage denial'])(
  'reports failed activation after %s',
  async (failure) => {
    const env = worker();
    if (failure === 'storage denial')
      env.caches.has.mockRejectedValue(new Error('denied'));
    await env.message('ACTIVATE_SHELL');
    expect(env.client.postMessage).toHaveBeenCalledWith({
      type: 'SHELL_UPDATE_FAILED',
    });
    expect(env.self.skipWaiting).not.toHaveBeenCalled();
  },
);

it('native activation retains the designated prior shell and unrelated storage', async () => {
  const env = worker();
  const current = await env.seed();
  await env.seed(priorVersion, 3);
  await env.seed('c'.repeat(20), 2);
  await env.caches.open('unrelated-cache');
  await env.caches.open(`${prefix}not-a-release`);
  await setIndexHeader(current, 'X-Intermed-Prior-Shell', priorVersion);
  await env.dispatch('activate');
  expect([...env.stores.keys()]).toEqual([
    prefix + version,
    prefix + priorVersion,
    'unrelated-cache',
    `${prefix}not-a-release`,
  ]);
  expect(
    (await current.match('/index.html'))?.headers.get(
      'X-Intermed-Activation-Order',
    ),
  ).toBe('4');
  expect(env.self.clients.claim).toHaveBeenCalledOnce();
});

it('native activation after eviction preserves a usable prior release', async () => {
  const env = worker();
  await env.seed(priorVersion, 1);
  await env.dispatch('activate');
  expect(env.caches.delete).not.toHaveBeenCalled();
  expect(env.self.clients.claim).toHaveBeenCalledOnce();
  expect(env.client.postMessage).toHaveBeenCalledWith({
    type: 'SHELL_UPDATE_FAILED',
  });
  expect(await env.message('SHELL_STATUS')).toHaveBeenCalledWith(
    expect.objectContaining({
      ready: true,
      version: priorVersion,
      fallback: true,
    }),
  );
});

it('explicit repair preserves other candidate caches and acknowledges completion without activating', async () => {
  const env = worker();
  await env.seed(priorVersion, 1);
  await env.caches.open('unrelated-cache');
  await env.message('REPAIR_SHELL');
  expect(env.client.postMessage).toHaveBeenCalledWith({
    type: 'SHELL_REPAIRED',
  });
  expect(env.caches.delete).not.toHaveBeenCalled();
  expect(env.self.skipWaiting).not.toHaveBeenCalled();
  expect(await env.message('SHELL_STATUS')).toHaveBeenCalledWith(
    expect.objectContaining({ ready: true, version }),
  );
});

it('reports repair download failure without declaring success', async () => {
  const env = worker();
  env.fetch.mockRejectedValue(new Error('offline'));
  await env.message('REPAIR_SHELL');
  expect(env.client.postMessage).toHaveBeenCalledExactlyOnceWith({
    type: 'SHELL_REPAIR_FAILED',
  });
});
