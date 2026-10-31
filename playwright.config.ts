import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { OWNER_STORAGE_STATE } from './e2e/support/auth';
import { uniqueDatabaseName } from './test/support/postgres';

/*
 * Each `pnpm test:e2e` run gets its own database and port, so parallel runs on one machine
 * don't collide. The values go into process.env so the worker processes (which re-read this
 * config) and the web server see the same ones.
 */
process.env.E2E_DATABASE_NAME ??= uniqueDatabaseName('fm_e2e');
process.env.E2E_PORT ??= String(20_000 + Math.floor(Math.random() * 20_000));

const port = Number(process.env.E2E_PORT);
const baseURL = `http://localhost:${port}`;

// Use a pre-installed Chromium when the bundled one isn't downloaded (e.g. sandboxed agents).
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  (!process.env.CI && existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalTeardown: './e2e/support/global-teardown.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    launchOptions: { executablePath },
  },
  projects: [
    // Runs first-run setup once per run (the E2E database starts empty) and signs in.
    { name: 'auth', testMatch: /auth\.setup\.ts/, use: { ...devices['Desktop Chrome'] } },
    {
      name: 'chromium',
      dependencies: ['auth'],
      // Every test starts signed in as the owner (see e2e/support/auth.ts).
      use: { ...devices['Desktop Chrome'], storageState: OWNER_STORAGE_STATE },
    },
  ],
  webServer: {
    // Creates and migrates the run's database, then starts Next.js on it.
    command: 'pnpm exec tsx e2e/support/server.ts',
    url: `${baseURL}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
