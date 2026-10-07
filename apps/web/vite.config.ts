import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { parseConfig } from './src/config.ts';
import { shellBuild } from './pwa/shell-build.ts';

const shellCsp = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
].join('; ');

function productionShellCsp(): Plugin {
  return {
    name: 'intermed-production-shell-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler: () => [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: shellCsp,
          },
          injectTo: 'head-prepend',
        },
      ],
    },
  };
}

/**
 * Test-only local-store harness entry.
 *
 * The harness script is added to the HTML only in the explicit `harness` mode
 * with `INTERMED_LOCAL_STORE_HARNESS=1`. The mode guard prevents an inherited
 * environment variable from changing a production build.
 */
export function localStoreHarnessPlugin(
  mode: string,
  environment: NodeJS.ProcessEnv = process.env,
): Plugin {
  const enabled =
    mode === 'harness' && environment['INTERMED_LOCAL_STORE_HARNESS'] === '1';
  return {
    name: 'intermed-local-store-harness',
    enforce: 'pre',
    transformIndexHtml: {
      order: 'pre',
      handler: () =>
        enabled
          ? [
              {
                tag: 'script',
                attrs: {
                  type: 'module',
                  src: '/src/dev/local-store-harness.ts',
                },
                injectTo: 'head-prepend',
              },
            ]
          : [],
    },
  };
}

export default defineConfig(({ mode }) => {
  parseConfig(loadEnv(mode, process.cwd(), 'VITE_'));
  return {
    plugins: [
      react(),
      shellBuild(),
      productionShellCsp(),
      localStoreHarnessPlugin(mode),
    ],
  };
});
