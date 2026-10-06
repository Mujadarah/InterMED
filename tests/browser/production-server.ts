import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

/** Node-only test controls: no admin endpoints are served to the application. */
export async function productionServer() {
  let revision = 'a';
  let failure:
    | 'none'
    | 'asset'
    | 'corrupt'
    | 'storage'
    | 'storage-after'
    | 'offline'
    | 'worker' = 'none';
  const requests: string[] = [];
  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    requests.push(request.url ?? '/');
    response.setHeader('Cache-Control', 'no-store');
    if (failure === 'offline') {
      request.socket.destroy();
      return;
    }
    if (
      (failure === 'asset' && path === '/icons/icon-512.png') ||
      (failure === 'worker' && path === '/sw.js')
    ) {
      response.writeHead(503);
      response.end('Synthetic failure');
      return;
    }
    if (
      /^\/(api|auth|admin|patient|secret|regulatory)(\/|$)/.test(path) ||
      request.method !== 'GET'
    ) {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ synthetic: 'PROHIBITED_CANARY' }));
      return;
    }
    try {
      const name =
        path === '/' || path === '/status' || path === '/unavailable'
          ? 'index.html'
          : path.slice(1);
      const root = resolve(`artifacts/pwa-${revision}`);
      const target = resolve(root, name);
      if (!target.startsWith(root + '/') && !target.startsWith(root + '\\'))
        throw new Error('Outside test root');
      let bytes = await readFile(target);
      if (failure === 'corrupt' && path === '/icons/icon-512.png')
        bytes = Buffer.from('SYNTHETIC_CORRUPTION');
      if (failure === 'storage' && path === '/sw.js')
        bytes = Buffer.from(
          bytes
            .toString()
            .replace(
              "'use strict';",
              "'use strict'; caches.open = async () => { throw new Error('Synthetic CacheStorage denial'); };",
            ),
        );
      if (failure === 'storage-after' && path === '/sw.js')
        bytes = Buffer.from(
          bytes.toString() +
            `
const testOpen = caches.open.bind(caches);
const testMatch = Cache.prototype.match;
let syntheticReadDelay = 0;
Cache.prototype.match = async function (...args) {
  if (syntheticReadDelay) await new Promise(done => setTimeout(done, syntheticReadDelay));
  return testMatch.apply(this, args);
};
self.addEventListener('message', event => {
  if (event.data?.type === 'SYNTHETIC_STORAGE') {
    caches.open = event.data.block ? async () => { throw new Error('Synthetic post-install storage denial'); } : testOpen;
    event.ports[0]?.postMessage('changed');
  }
  if (event.data?.type === 'SYNTHETIC_READ_LATENCY') {
    syntheticReadDelay = event.data.delay;
    event.ports[0]?.postMessage('changed');
  }
});
`,
        );
      const types: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.webmanifest': 'application/manifest+json',
      };
      response.setHeader(
        'Content-Type',
        types[extname(name)] ?? 'application/octet-stream',
      );
      response.end(bytes);
    } catch {
      response.writeHead(404);
      response.end('Missing test asset');
    }
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing test server address');
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    revision: (value: 'a' | 'b' | 'c') => {
      revision = value;
    },
    failure: (value: typeof failure) => {
      failure = value;
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
    },
  };
}
