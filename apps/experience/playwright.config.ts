import { defineConfig, devices } from '@playwright/test';

// Playwright drives the public runtime via the hidden SimulatorTransport (research R7).
// `pnpm test:e2e` runs this config's chromium project. No hosted CI in this project — verification
// always runs "locally", so `.only`-focused tests are rejected unconditionally (forbidOnly) rather
// than gated on a CI env var that never exists here.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
