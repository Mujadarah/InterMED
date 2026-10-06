import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { renderWorker } from './worker.ts';

export interface ShellAsset {
  url: string;
  hash: string;
  type: string;
}
export interface ShellRelease {
  version: string;
  assets: ShellAsset[];
}
/** Return the lowercase SHA-256 hex digest of bytes or UTF-8 text. */
const hash = (data: string | Uint8Array) =>
  createHash('sha256').update(data).digest('hex');

/** Emit an integrity-pinned worker for the explicit public shell only. */
export function shellBuild(): Plugin {
  let outputDirectory = '';
  let revision = 'development';
  return {
    name: 'intermed-public-shell',
    apply: 'build',
    enforce: 'post',
    /**
     * Expose INTERMED_SHELL_REVISION to client code, defaulting to development.
     * @throws {Error} If the label is not 1–64 ASCII letters, digits, dots or hyphens.
     */
    config() {
      revision = process.env['INTERMED_SHELL_REVISION'] ?? 'development';
      if (!/^[a-zA-Z0-9.-]{1,64}$/.test(revision))
        throw new Error('Invalid shell revision');
      return {
        define: {
          'import.meta.env.INTERMED_SHELL_REVISION': JSON.stringify(revision),
        },
      };
    },
    /**
     * Remember the resolved build output directory for shell emission.
     * @throws {Error} If the configured base is not the root path `/`.
     */
    configResolved(config) {
      if (config.base !== '/')
        throw new Error(
          'InterMED shell requires root scope; review subpath deployment first.',
        );
      outputDirectory = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml: {
      order: 'post',
      /** Return the public shell revision metadata to inject into the HTML head. */
      handler() {
        return [
          {
            tag: 'meta',
            attrs: { name: 'intermed-shell-revision', content: revision },
            injectTo: 'head',
          },
        ];
      },
    },
    /**
     * Write sw.js with hashes of the emitted public shell assets.
     * Reject if index.html is absent, the shell exceeds 16 assets or 2 MiB,
     * or reading an asset or writing the worker fails.
     */
    async writeBundle(_options, bundle) {
      const entries: {
        url: string;
        bytes: string | Uint8Array;
        type: string;
      }[] = [];
      for (const output of Object.values(bundle)) {
        if (
          output.fileName === 'index.html' ||
          /^assets\/[a-zA-Z0-9_-]+\.(js|css)$/.test(output.fileName)
        ) {
          const type = output.fileName.endsWith('.html')
            ? 'text/html'
            : output.fileName.endsWith('.css')
              ? 'text/css'
              : 'javascript';
          entries.push({
            url: `/${output.fileName}`,
            bytes: await readFile(resolve(outputDirectory, output.fileName)),
            type,
          });
        }
      }
      for (const name of [
        'manifest.webmanifest',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/maskable-512.png',
        'icons/apple-touch-180.png',
      ]) {
        entries.push({
          url: `/${name}`,
          bytes: await readFile(resolve(outputDirectory, name)),
          type: name.endsWith('.png')
            ? 'image/png'
            : 'application/manifest+json',
        });
      }
      if (
        !entries.some((entry) => entry.url === '/index.html') ||
        entries.length > 16 ||
        entries.reduce(
          (total, entry) => total + Buffer.byteLength(entry.bytes),
          0,
        ) >
          2 * 1024 * 1024
      )
        throw new Error('Invalid or oversized public shell');
      const assets = entries
        .sort((a, b) => a.url.localeCompare(b.url))
        .map(({ url, bytes, type }) => ({ url, hash: hash(bytes), type }));
      // Include worker policy in the identity, independently of any future dataset.
      const version = hash(
        renderWorker({ version: 'identity-input', assets }),
      ).slice(0, 20);
      await writeFile(
        resolve(outputDirectory, 'sw.js'),
        renderWorker({ version, assets }),
      );
    },
  };
}
