import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:https';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium, webkit, devices } from '@playwright/test';

// Optional local TLS smoke. No certificate is added to an OS/browser trust store.
const openssl =
  process.env['INTERMED_OPENSSL'] ??
  (process.platform === 'win32'
    ? 'C:/Program Files/Git/usr/bin/openssl.exe'
    : 'openssl');
const directory = resolve('artifacts/local-https');
await mkdir(directory, { recursive: true });
const certificate = resolve(directory, 'certificate.pem');
const privateKey = resolve(directory, 'key.pem');
const generation = spawnSync(
  openssl,
  [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    privateKey,
    '-out',
    certificate,
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost,IP:127.0.0.1',
  ],
  { encoding: 'utf8' },
);
if (generation.status !== 0)
  throw new Error(
    'Local certificate generation unavailable: ' +
      (generation.error?.message ?? generation.stderr),
  );
const publicKey = spawnSync(openssl, [
  'x509',
  '-in',
  certificate,
  '-pubkey',
  '-noout',
]);
const der = spawnSync(openssl, ['pkey', '-pubin', '-outform', 'DER'], {
  input: publicKey.stdout,
});
if (publicKey.status !== 0 || der.status !== 0)
  throw new Error('Local certificate fingerprint unavailable');
const spki = createHash('sha256').update(der.stdout).digest('base64');
let disconnected = false;
let requests = 0;
const server = createServer(
  { key: await readFile(privateKey), cert: await readFile(certificate) },
  async (request, response) => {
    requests++;
    if (disconnected) {
      request.socket.destroy();
      return;
    }
    try {
      const path = new URL(request.url ?? '/', 'https://localhost').pathname;
      const root = resolve('apps/web/dist');
      const file = resolve(
        root,
        path === '/' || path === '/status' ? 'index.html' : path.slice(1),
      );
      if (!file.startsWith(root + '/') && !file.startsWith(root + '\\'))
        throw new Error('Outside shell');
      const types = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.webmanifest': 'application/manifest+json',
      };
      response.setHeader(
        'Content-Type',
        types[extname(file)] ?? 'application/octet-stream',
      );
      response.setHeader('Cache-Control', 'no-store');
      response.end(await readFile(file));
    } catch {
      response.writeHead(404);
      response.end();
    }
  },
);
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
const url = `https://127.0.0.1:${address.port}`;
try {
  for (const [name, engine, device] of [
    ['chromium-desktop', chromium, devices['Desktop Chrome']],
    ['webkit-phone', webkit, devices['iPhone 13']],
    ['webkit-tablet', webkit, devices['iPad (gen 7)']],
  ]) {
    disconnected = false;
    const browser = await engine.launch(
      name.startsWith('chromium')
        ? { args: [`--ignore-certificate-errors-spki-list=${spki}`] }
        : {},
    );
    try {
      const context = await browser.newContext({
        ...device,
        ignoreHTTPSErrors: true,
      });
      const page = await context.newPage();
      await page.goto(url + '/status');
      if (!(await page.evaluate(() => globalThis.isSecureContext)))
        throw new Error('HTTPS context not secure');
      await page
        .getByText('Shell available offline', { exact: true })
        .waitFor();
      await page.waitForFunction(
        () => navigator.serviceWorker.controller !== null,
      );
      const before = requests;
      disconnected = true;
      await page.reload();
      await page.getByRole('heading', { name: 'Development status' }).waitFor();
      await page
        .getByText('Shell available offline', { exact: true })
        .waitFor();
      if (requests !== before)
        throw new Error('Cached reload attempted network');
      await page.screenshot({
        path: resolve(directory, `${name}.png`),
        fullPage: true,
      });
      console.log(
        JSON.stringify({
          project: name,
          browser: browser.version(),
          scheme: 'https',
          certificate: 'temporary self-signed; test-only trust bypass',
          shell: 'cached reload passed',
          networkRequestsDuringReload: requests - before,
        }),
      );
      await context.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
