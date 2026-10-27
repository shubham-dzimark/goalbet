import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { NEXT_ENV, PORTS, ROOT, URLS } from './stack.mjs';

/**
 * End-to-end tests (F5.1–F5.10) on the isolated E2E stack (see stack.mjs).
 * First `pnpm --filter @goalbet/e2e prepare-stack`, then `pnpm --filter @goalbet/e2e e2e`.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // one stack, shared data (matches, settings): run specs one after another
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: URLS.web,
    locale: 'ro-RO',
    timezoneId: 'Europe/Bucharest',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: [
    {
      // API + worker together (the worker has no port of its own)
      command: 'node scripts/backend.mjs',
      url: `${URLS.api}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npx next start -p ${PORTS.web}`,
      cwd: join(ROOT, 'apps/web'),
      url: `${URLS.web}/ro`,
      env: NEXT_ENV,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npx next start -p ${PORTS.admin}`,
      cwd: join(ROOT, 'apps/admin'),
      url: `${URLS.admin}/ro/login`,
      env: NEXT_ENV,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
