import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import type { Socket } from 'node:net';
import { renderWorker } from '../../apps/web/pwa/worker';
import type { ShellRelease } from '../../apps/web/pwa/shell-build';
import {
  buildSecurityHeaders,
  buildSwSecurityHeaders,
} from '../../apps/web/security-headers';

/** Node-only test controls: no admin endpoints are served to the application. */
export async function productionServer(
  precacheAssets?: number,
  options?: { securityHeaders?: boolean },
) {
  const syntheticAssets = new Map<string, string>();
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
  const transfers: { requestUrl: string; responseBodyBytes: number }[] = [];
  // Every accepted TCP connection, including idle keep-alive and half-open
  // ones that never complete a request. A real offline origin fails all of
  // them fast; destroying only on 'request' leaves the rest hanging, and
  // WebKit's fresh-page navigation can stall behind such a socket.
  const sockets = new Set<Socket>();
  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    requests.push(request.url ?? '/');
    const sendBody = (body: string | Uint8Array) => {
      const bytes = Buffer.from(body);
      transfers.push({
        requestUrl: request.url ?? '/',
        responseBodyBytes: bytes.byteLength,
      });
      response.end(bytes);
    };
    response.setHeader('Cache-Control', 'no-store');
    if (options?.securityHeaders) {
      const headers =
        path === '/sw.js' ? buildSwSecurityHeaders() : buildSecurityHeaders();
      for (const [name, value] of Object.entries(headers))
        response.setHeader(name, value);
    }
    if (failure === 'offline') {
      request.socket.destroy();
      return;
    }
    if (path === '/test-probe.html') {
      response.setHeader('Content-Type', 'text/html');
      sendBody(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Worker probe</title></head><body>Worker probe</body></html>',
      );
      return;
    }
    if (path === '/test-framing-parent.html') {
      // Bare vessel for the framing probe: the fixture HTML without its
      // meta CSP, so only the framed response's `frame-ancestors` decides.
      const shell = await readFile(
        resolve(`artifacts/pwa-${revision}`, 'index.html'),
        'utf8',
      );
      response.setHeader('Content-Type', 'text/html');
      response.end(
        shell.replace(
          /<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>/,
          '',
        ),
      );
      return;
    }
    if (syntheticAssets.has(path)) {
      response.setHeader('Content-Type', 'text/javascript');
      sendBody(syntheticAssets.get(path)!);
      return;
    }
    if (
      (failure === 'asset' && path === '/icons/icon-512.png') ||
      (failure === 'worker' && path === '/sw.js')
    ) {
      response.writeHead(503);
      sendBody('Synthetic failure');
      return;
    }
    if (
      /^\/(api|auth|admin|patient|secret|regulatory)(\/|$)/.test(path) ||
      request.method !== 'GET'
    ) {
      response.setHeader('Content-Type', 'application/json');
      sendBody(JSON.stringify({ synthetic: 'PROHIBITED_CANARY' }));
      return;
    }
    try {
      const name =
        path === '/' ||
        path === '/status' ||
        path === '/unavailable' ||
        path === '/search' ||
        path === '/favorites' ||
        path === '/calculators' ||
        path.startsWith('/medication/')
          ? 'index.html'
          : path.slice(1);
      const root = resolve(`artifacts/pwa-${revision}`);
      const target = resolve(root, name);
      if (!target.startsWith(root + '/') && !target.startsWith(root + '\\'))
        throw new Error('Outside test root');
      let bytes = await readFile(target);
      if (path === '/sw.js' && precacheAssets !== undefined) {
        // Pad the real production release with pinned synthetic JS, only in tests.
        const shell = runInNewContext(bytes.toString() + '\nSHELL;', {
          self: { addEventListener() {} },
        }) as ShellRelease;
        if (shell.assets.length > precacheAssets)
          throw new Error(
            'Synthetic precache target is below the real asset count',
          );
        for (let i = shell.assets.length; i < precacheAssets; i++) {
          const url = '/assets/budget-fixture-' + i + '.js';
          const body = '/* synthetic budget fixture ' + i + ' */';
          syntheticAssets.set(url, body);
          shell.assets.push({
            url,
            hash: createHash('sha256').update(body).digest('hex'),
            type: 'javascript',
          });
        }
        shell.assets.sort((a, b) => a.url.localeCompare(b.url));
        shell.version = createHash('sha256')
          .update(
            renderWorker({ version: 'identity-input', assets: shell.assets }),
          )
          .digest('hex')
          .slice(0, 20);
        bytes = Buffer.from(renderWorker(shell));
      }
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
      sendBody(bytes);
    } catch {
      response.writeHead(404);
      sendBody('Missing test asset');
    }
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => {
      sockets.delete(socket);
    });
    // A real offline origin never finishes a handshake: fail connections
    // accepted while offline immediately, even if the client never sends a
    // request on them. The per-request destroy below stays as a backstop.
    if (failure === 'offline') socket.destroy();
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing test server address');
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    transfers,
    revision: (value: 'a' | 'b' | 'c' | 'harness') => {
      revision = value;
    },
    failure: (value: typeof failure) => {
      failure = value;
      // Fail fast like a real offline origin: tear down idle keep-alive and
      // half-open connections too, not just sockets carrying a request.
      if (value === 'offline') for (const socket of sockets) socket.destroy();
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
    },
  };
}
