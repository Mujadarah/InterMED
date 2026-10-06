import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  // Bound browser processes across the three projects; retain every assertion.
  workers: 3,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: 'list',
  globalSetup: './scripts/build-pwa-fixtures.mjs',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit-phone', use: { ...devices['iPhone 13'] } },
    { name: 'webkit-tablet', use: { ...devices['iPad (gen 7)'] } },
  ],
  webServer: {
    command:
      'npm run preview --workspace @intermed/web -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
