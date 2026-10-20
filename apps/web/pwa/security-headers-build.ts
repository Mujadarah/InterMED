import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import {
  buildSecurityHeadersManifest,
  renderHeadersFile,
} from '../security-headers.ts';

/**
 * Emit host-agnostic security-header files into `dist` at build time.
 *
 * `dist/_headers` uses the Netlify / Cloudflare Pages format (`/*` gets
 * every header; `/sw.js` gets the same CSP plus `Cache-Control: no-cache`)
 * and `dist/security-headers.json` is a neutral manifest any edge or
 * reverse proxy can consume. Both are written after bundling and are
 * deliberately outside the precache list counted by `shell-build.ts`.
 */
export function securityHeadersBuild(): Plugin {
  let outputDirectory = '';
  return {
    name: 'intermed-security-headers',
    apply: 'build',
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir);
    },
    async writeBundle() {
      await writeFile(
        resolve(outputDirectory, '_headers'),
        renderHeadersFile(),
      );
      await writeFile(
        resolve(outputDirectory, 'security-headers.json'),
        `${JSON.stringify(buildSecurityHeadersManifest(), null, 2)}\n`,
      );
    },
  };
}
