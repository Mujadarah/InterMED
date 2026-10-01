import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    pool: 'threads',
    environment: 'node',
    include: [
      'apps/**/*.test.{ts,tsx}',
      'packages/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
  },
});
