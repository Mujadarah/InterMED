import type { ShellRelease } from './shell-build.ts';

/** Generate a classic, browser-native worker without broad runtime caching. */
export function renderWorker(shell: ShellRelease): string {
  return String.raw`
'use strict';
const SHELL = ${JSON.stringify(shell)};
const PREFIX = 'intermed-public-shell-v1-';
const CACHE = PREFIX + SHELL.version;
// Every route this shell renders from its own HTML is served from the
// precache, so a cold deep link works offline exactly like a warm navigation.
const shellRoute = path => path === '/' || path === '/status' || path === '/search' || path.startsWith('/medication/');
const owned = name => name.startsWith(PREFIX) && /^[a-f0-9]{20}$/.test(name.slice(PREFIX.length));
const publicAsset = url => ['/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-180.png'].includes(url) || /^\/assets\/[a-zA-Z0-9_-]+\.(js|css)$/.test(url);
const assetType = url => url === '/index.html' ? 'text/html' : url === '/manifest.webmanifest' ? 'application/manifest+json' : url.endsWith('.png') ? 'image/png' : url.endsWith('.css') ? 'text/css' : 'javascript';
const announce = async message => {
  for (const client of await self.clients.matchAll({type: 'window'})) client.postMessage(message);
};
const verifiedBytes = async (response, asset) => {
  const mime = response?.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  const usableType = asset.type === 'javascript' ? ['text/javascript', 'application/javascript'].includes(mime) : mime === asset.type;
  if (!response?.ok || response.redirected || !usableType) return null;
  const bytes = await response.clone().arrayBuffer();
  if (bytes.byteLength > 2 * 1024 * 1024) return null;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return actual === asset.hash ? bytes : null;
};
const ready = async () => {
  if (!await caches.has(CACHE)) return false;
  return !!await readShell(CACHE);
};
const readShell = async (name, requestedPath) => {
  const cache = await caches.open(name);
  const index = await cache.match('/index.html');
  if (!index || index.headers.get('X-Intermed-Shell-Version') !== name.slice(PREFIX.length)) return null;
  let assets;
  try { assets = JSON.parse(index.headers.get('X-Intermed-Shell-Assets')); } catch { return null; }
  if (!Array.isArray(assets) || assets.length === 0 || assets.length > 16 || !assets.some(asset => asset?.url === '/index.html') || assets.some(asset => !asset || typeof asset.url !== 'string' || !publicAsset(asset.url) || typeof asset.hash !== 'string' || !/^[a-f0-9]{64}$/.test(asset.hash) || asset.type !== assetType(asset.url)) || new Set(assets.map(asset => asset.url)).size !== assets.length) return null;
  // The worker's own release uses compiled pins; prior releases use the public
  // metadata preserved at installation. Validate bytes, not just cache presence.
  if (name === CACHE && JSON.stringify(assets) !== JSON.stringify(SHELL.assets)) return null;
  if (requestedPath && !assets.some(asset => asset.url === requestedPath)) return null;
  // Navigation/readiness/activation validate the complete release. A static
  // request validates its metadata-bearing index and exact requested bytes.
  const requested = requestedPath ? assets.filter(asset => asset.url === '/index.html' || asset.url === requestedPath) : assets;
  const verified = await Promise.all(requested.map(async asset => {
    const response = asset.url === '/index.html' ? index : await cache.match(asset.url);
    const bytes = await verifiedBytes(response, asset);
    return bytes ? {asset, response, size: bytes.byteLength} : null;
  }));
  if (verified.some(result => !result)) return null;
  const responses = new Map();
  let totalBytes = 0;
  for (const {asset, response, size} of verified) {
    totalBytes += size;
    if (totalBytes > 2 * 1024 * 1024) return null;
    responses.set(asset.url, response);
  }
  const order = Number(index.headers.get('X-Intermed-Activation-Order'));
  return {cache, index: responses.get('/index.html'), assets, responses, name, version: name.slice(PREFIX.length), prior: index.headers.get('X-Intermed-Prior-Shell'), order, activated: Number.isSafeInteger(order) && order > 0};
};
const selectShell = async requestedPath => {
  const names = (await caches.keys()).filter(owned);
  const current = names.includes(CACHE) ? await readShell(CACHE, requestedPath) : null;
  if (current) return current;
  // Only previously activated, complete releases can recover an evicted candidate.
  // Never serve a waiting release before activation or infer age from cache order.
  const previous = (await Promise.all(names.filter(name => name !== CACHE).map(name => readShell(name, requestedPath)))).filter(shell => shell?.activated);
  // Revisiting a release can create A→B→A prior cycles. Persist actual activation
  // order independently of release identity, wall-clock time and cache insertion.
  return previous.sort((a, b) => b.order - a.order)[0] ?? null;
};
const markActivated = async current => {
  const headers = new Headers(current.index.headers);
  const existing = (await Promise.all((await caches.keys()).filter(owned).map(name => readShell(name)))).filter(shell => shell?.activated);
  const order = Math.max(0, ...existing.map(shell => shell.order)) + 1;
  if (!Number.isSafeInteger(order)) throw new Error('Invalid activation order');
  headers.set('X-Intermed-Activation-Order', String(order));
  await current.cache.put('/index.html', new Response(await current.index.arrayBuffer(), {status: current.index.status, headers}));
};
const install = async (repair = false) => {
  let priorVersion = null;
  let statusKnown = false;
  let activeReady = false;
  let stagingStarted = false;
  try {
    const previous = self.registration.active;
    priorVersion = previous ? await new Promise(resolve => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => { channel.port1.close(); resolve(null); }, 3000);
      channel.port1.onmessage = event => {
        clearTimeout(timeout); channel.port1.close();
        statusKnown = event.data?.storageAccessible === true;
        activeReady = event.data?.ready === true;
        resolve(statusKnown && /^[a-f0-9]{20}$/.test(event.data.version) ? event.data.version : null);
      };
      previous.postMessage({type: 'SHELL_STATUS'}, [channel.port2]);
    }) : null;
    // Unknown active storage status is not permission to remove its release.
    if (previous && (!statusKnown || !priorVersion)) throw new Error('Active shell status unavailable');
    if (priorVersion === SHELL.version && activeReady && await ready()) return;
    stagingStarted = true;
    const cache = await caches.open(CACHE);
    const retainedVersion = priorVersion === SHELL.version ? (await cache.match('/index.html'))?.headers.get('X-Intermed-Prior-Shell') : priorVersion;
    for (const asset of SHELL.assets) {
      const response = await fetch(new Request(asset.url, {cache: 'no-store', credentials: 'omit', redirect: 'error'}));
      const bytes = await verifiedBytes(response, asset);
      if (!bytes) throw new Error('Unusable shell asset');
      const headers = new Headers(response.headers);
      if (asset.url === '/index.html') {
        headers.set('X-Intermed-Shell-Version', SHELL.version);
        headers.set('X-Intermed-Shell-Assets', JSON.stringify(SHELL.assets));
        if (retainedVersion && /^[a-f0-9]{20}$/.test(retainedVersion) && retainedVersion !== SHELL.version) headers.set('X-Intermed-Prior-Shell', retainedVersion);
      }
      await cache.put(asset.url, new Response(bytes, {status: response.status, headers}));
    }
    // Superseded waiting workers must not accumulate caches indefinitely.
    // Cleanup happens only once the entire replacement is usable.
    if (repair) {
      const repaired = await readShell(CACHE);
      if (!repaired) throw new Error('Shell repair incomplete');
      await markActivated(repaired);
      // Preserve any waiting candidate and all prior storage during explicit repair.
      return;
    }
    const activeCache = priorVersion ? PREFIX + priorVersion : null;
    const activePrior = activeCache ? (await (await caches.open(activeCache)).match('/index.html'))?.headers.get('X-Intermed-Prior-Shell') : null;
    const retainedPrior = activePrior && /^[a-f0-9]{20}$/.test(activePrior) ? PREFIX + activePrior : null;
    for (const name of await caches.keys()) {
      if (owned(name) && name !== CACHE && name !== activeCache && name !== retainedPrior) await caches.delete(name);
    }
  } catch (error) {
    if (stagingStarted && priorVersion !== SHELL.version) await caches.delete(CACHE).catch(() => false);
    if (!repair) await announce({type: 'SHELL_UPDATE_FAILED'});
    throw error;
  }
};
self.addEventListener('install', event => event.waitUntil(install()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  try {
    const current = await caches.has(CACHE) ? await readShell(CACHE) : null;
    // Native activation can happen after all tabs close, even if storage was evicted.
    // Preserve the usable prior release when the new release is incomplete.
    if (current) {
      await markActivated(current);
      const prior = current.prior && /^[a-f0-9]{20}$/.test(current.prior) ? PREFIX + current.prior : null;
      for (const name of await caches.keys()) {
        if (owned(name) && name !== CACHE && name !== prior) await caches.delete(name);
      }
    } else await announce({type: 'SHELL_UPDATE_FAILED'});
  } catch {
    await announce({type: 'SHELL_UPDATE_FAILED'});
  }
  await self.clients.claim();
})()));
self.addEventListener('message', event => {
  event.waitUntil((async () => {
    if (event.data?.type === 'SHELL_STATUS') {
      try {
        const selected = await selectShell();
        event.ports[0]?.postMessage({ready: !!selected, storageAccessible: true, version: selected?.version ?? SHELL.version, workerVersion: SHELL.version, fallback: !!selected && selected.version !== SHELL.version});
      } catch {
        event.ports[0]?.postMessage({ready: false, storageAccessible: false, version: SHELL.version, workerVersion: SHELL.version});
      }
    }
    if (event.data?.type === 'REPAIR_SHELL') {
      try {
        await install(true);
        event.source?.postMessage({type: 'SHELL_REPAIRED'});
      } catch {
        event.source?.postMessage({type: 'SHELL_REPAIR_FAILED'});
      }
    }
    if (event.data?.type === 'ACTIVATE_SHELL') {
      try {
        const clients = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
        const inScope = clients.filter(client => client.url.startsWith(self.registration.scope));
        if (inScope.length > 1) {
          event.source?.postMessage({type: 'SHELL_ACTIVATION_BLOCKED'});
        } else if (await ready()) {
          await self.skipWaiting();
        } else event.source?.postMessage({type: 'SHELL_UPDATE_FAILED'});
      } catch {
        event.source?.postMessage({type: 'SHELL_UPDATE_FAILED'});
      }
    }
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.search || request.headers.has('authorization')) return;
  const navigation = request.mode === 'navigate' && shellRoute(url.pathname);
  if (!navigation && !publicAsset(url.pathname)) return;
  event.respondWith((async () => {
    try {
      const path = navigation ? '/index.html' : url.pathname;
      const selected = await selectShell(navigation ? undefined : path);
      if (selected?.assets.some(asset => asset.url === path)) {
        // Return the exact Response whose bytes were verified during selection.
        const hit = selected.responses.get(path);
        if (hit) return hit;
      }
    } catch { /* Restricted storage must not prevent an online network request. */ }
    // No unverified response is added to a shell cache after installation.
    return fetch(request);
  })());
});
`;
}
