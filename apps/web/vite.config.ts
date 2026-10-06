import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { parseConfig } from './src/config.ts';
import { shellBuild } from './pwa/shell-build.ts';

export default defineConfig(({ mode }) => {
  parseConfig(loadEnv(mode, process.cwd(), 'VITE_'));
  return { plugins: [react(), shellBuild()] };
});
