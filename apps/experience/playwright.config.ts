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
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    // Run the real Vite + kiosk sidecar development stack rather than `vite preview`: it serves
    // the seeded local content through the dev proxy and exercises React StrictMode as operators
    // do during development (the preview-only setup could not cover either boundary).
    command: 'pnpm --filter content-pipeline seed:sample && pnpm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
