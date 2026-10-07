import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { runInNewContext } from 'node:vm';
import type { Plugin, ResolvedConfig } from 'vite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { shellBuild } from './shell-build';
import type { ShellRelease } from './shell-build';

vi.mock('node:fs/promises', () => ({ readFile: vi.fn(), writeFile: vi.fn() }));

/** Vite accepts function hooks and object hooks; invoke either form directly. */
function hook<T>(value: T | { handler: T } | undefined): T {
  if (!value) throw new Error('Missing plugin hook');
  return typeof value === 'object' && 'handler' in value
    ? value.handler
    : value;
}

const outputDirectory = resolve('/synthetic-project', 'dist');
let files: Map<string, Buffer>;
let plugin: Plugin;

beforeEach(() => {
  vi.stubEnv('INTERMED_SHELL_REVISION', undefined);
  vi.clearAllMocks();
  files = new Map([
    ['index.html', Buffer.from('<html>synthetic shell</html>')],
    ['assets/app-123.js', Buffer.from('console.log("synthetic");')],
    ['assets/app-123.css', Buffer.from('body { color: black; }')],
    ['manifest.webmanifest', Buffer.from('{}')],
    ...['icon-192', 'icon-512', 'maskable-512', 'apple-touch-180'].map(
      (name): [string, Buffer] => [
        `icons/${name}.png`,
        Buffer.from([137, 80, 78, 71]),
      ],
    ),
  ]);
  vi.mocked(readFile).mockImplementation(async (path) => {
    const name = relative(outputDirectory, String(path)).split(sep).join('/');
    const bytes = files.get(name);
    if (!bytes) throw new Error(`Missing fixture: ${name}`);
    return Buffer.from(bytes);
  });
  vi.mocked(writeFile).mockResolvedValue(undefined);
  plugin = shellBuild();
  hook(plugin.configResolved).call(
    {} as never,
    {
      base: '/',
      root: '/synthetic-project',
      build: { outDir: 'dist' },
    } as ResolvedConfig,
  );
});
afterEach(() => vi.unstubAllEnvs());

function configure() {
  return hook(plugin.config).call(
    {} as never,
    {},
    { command: 'build', mode: 'production' },
  );
}

async function emit(
  names = ['index.html', 'assets/app-123.js', 'assets/app-123.css'],
) {
  const bundle = Object.fromEntries(
    names.map((fileName) => [
      fileName,
      {
        type: 'asset' as const,
        fileName,
        source: '',
        names: [],
        originalFileNames: [],
      },
    ]),
  );
  const writeBundle = hook(plugin.writeBundle);
  // Only fileName is consumed; the bundler owns the other output metadata.
  await writeBundle.call(
    {} as never,
    {} as never,
    bundle as unknown as Parameters<typeof writeBundle>[1],
  );
  const call = vi.mocked(writeFile).mock.calls.at(-1);
  expect(call?.[0]).toBe(resolve(outputDirectory, 'sw.js'));
  // Evaluate the emitted classic worker with inert event registration to read
  // its public release descriptor, without relying on source-text formatting.
  return runInNewContext(`${String(call?.[1])}\nSHELL;`, {
    self: { addEventListener: vi.fn() },
  }) as ShellRelease;
}

it('uses development provenance when no revision is configured', () => {
  expect(configure()).toEqual({
    define: { 'import.meta.env.INTERMED_SHELL_REVISION': '"development"' },
  });
});

it.each(['A', 'release-2.0', 'a'.repeat(64)])(
  'embeds valid public revision %s in code and HTML',
  (revision) => {
    vi.stubEnv('INTERMED_SHELL_REVISION', revision);
    expect(configure()).toEqual({
      define: {
        'import.meta.env.INTERMED_SHELL_REVISION': JSON.stringify(revision),
      },
    });
    const transform = plugin.transformIndexHtml;
    if (
      !transform ||
      typeof transform !== 'object' ||
      !('handler' in transform)
    )
      throw new Error('Missing HTML transform');
    expect(transform.handler.call({} as never, '', {} as never)).toEqual([
      {
        tag: 'meta',
        attrs: { name: 'intermed-shell-revision', content: revision },
        injectTo: 'head',
      },
    ]);
  },
);

it.each([
  '',
  'a'.repeat(65),
  'release/2',
  'has space',
  '<script>',
  'release\n',
  'révision',
])('rejects invalid revision %j', (revision) => {
  vi.stubEnv('INTERMED_SHELL_REVISION', revision);
  expect(configure).toThrow('Invalid shell revision');
  expect(writeFile).not.toHaveBeenCalled();
});

it.each(['/nested/', './', 'https://cdn.example/'])(
  'rejects unsupported deployment base %s',
  (base) => {
    expect(() =>
      hook(plugin.configResolved).call(
        {} as never,
        {
          base,
          root: '/synthetic-project',
          build: { outDir: 'dist' },
        } as ResolvedConfig,
      ),
    ).toThrow('InterMED shell requires root scope');
  },
);

it('pins actual output bytes, MIME types and only approved public assets', async () => {
  const release = await emit([
    'index.html',
    'assets/app-123.js',
    'assets/app-123.css',
    'assets/app-123.js.map',
    'api/private.json',
    'assets/nested/private.js',
    'assets/not.allowed.js',
  ]);
  expect(release.version).toMatch(/^[a-f0-9]{20}$/);
  expect(release.assets).toHaveLength(8);
  expect(release.assets.map(({ url }) => url)).toEqual(
    [...files.keys()]
      .map((name) => `/${name}`)
      .sort((a, b) => a.localeCompare(b)),
  );
  for (const asset of release.assets) {
    expect(asset.hash).toBe(
      createHash('sha256')
        .update(files.get(asset.url.slice(1))!)
        .digest('hex'),
    );
  }
  expect(release.assets).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ url: '/index.html', type: 'text/html' }),
      expect.objectContaining({
        url: '/assets/app-123.js',
        type: 'javascript',
      }),
      expect.objectContaining({ url: '/assets/app-123.css', type: 'text/css' }),
      expect.objectContaining({
        url: '/manifest.webmanifest',
        type: 'application/manifest+json',
      }),
      expect.objectContaining({
        url: '/icons/icon-192.png',
        type: 'image/png',
      }),
    ]),
  );
  expect(readFile).toHaveBeenCalledTimes(8);
});

it('keeps release identity independent of bundle enumeration order and sensitive to asset bytes', async () => {
  const first = await emit();
  expect(
    await emit(['assets/app-123.css', 'assets/app-123.js', 'index.html']),
  ).toEqual(first);
  files.set('assets/app-123.js', Buffer.from('changed synthetic code'));
  expect((await emit()).version).not.toBe(first.version);
});

it('refuses a bundle without its entry HTML', async () => {
  await expect(emit(['assets/app-123.js'])).rejects.toThrow(
    'Invalid or oversized public shell',
  );
  expect(writeFile).not.toHaveBeenCalled();
});

it('allows sixteen assets but rejects a seventeenth', async () => {
  const names = ['index.html'];
  for (let i = 0; i < 11; i++) {
    const name = `assets/chunk-${i}.js`;
    files.set(name, Buffer.from('synthetic'));
    names.push(name);
  }
  expect((await emit(names.slice(0, 11))).assets).toHaveLength(16);
  vi.mocked(writeFile).mockClear();
  await expect(emit(names)).rejects.toThrow(
    'Invalid or oversized public shell',
  );
  expect(writeFile).not.toHaveBeenCalled();
});

it('allows exactly two MiB but rejects one additional byte', async () => {
  const others = [...files.entries()]
    .filter(([name]) => name !== 'index.html')
    .reduce((sum, [, bytes]) => sum + bytes.length, 0);
  files.set('index.html', Buffer.alloc(2 * 1024 * 1024 - others));
  await emit();
  vi.mocked(writeFile).mockClear();
  files.set('index.html', Buffer.alloc(2 * 1024 * 1024 - others + 1));
  await expect(emit()).rejects.toThrow('Invalid or oversized public shell');
  expect(writeFile).not.toHaveBeenCalled();
});

it('does not emit a worker when a required public file cannot be read', async () => {
  files.delete('icons/maskable-512.png');
  await expect(emit()).rejects.toThrow(
    'Missing fixture: icons/maskable-512.png',
  );
  expect(writeFile).not.toHaveBeenCalled();
});
