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

export default defineConfig(({ mode }) => {
  parseConfig(loadEnv(mode, process.cwd(), 'VITE_'));
  return { plugins: [react(), shellBuild(), productionShellCsp()] };
});
