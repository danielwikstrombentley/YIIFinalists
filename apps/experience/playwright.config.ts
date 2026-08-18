import { defineConfig, devices } from '@playwright/test';

// Playwright drives the public runtime via the hidden SimulatorTransport (research R7).
// `pnpm test:e2e` runs this config's chromium project. No hosted CI in this project — verification
// always runs "locally", so `.only`-focused tests are rejected unconditionally (forbidOnly) rather
// than gated on a CI env var that never exists here.
export default defineConfig({
  testDir: './tests/e2e',
  // Each visitor journey owns a Three.js globe plus a Cesium renderer. Running several journeys
  // concurrently exhausts local Chromium/WebGL contexts and makes otherwise-valid stage startup
  // nondeterministic, so the installation's single-screen runtime is verified one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    // Run the real Vite + kiosk sidecar development stack rather than `vite preview`: it serves
    // the seeded local content through the dev proxy and exercises React StrictMode as operators
    // do during development (the preview-only setup could not cover either boundary). The
    // offline-safe fixture intentionally lives beneath test-results so an E2E run cannot
    // overwrite the developer-selected assets/sample profile (including photorealistic Cesium).
    command:
      'pnpm --filter content-pipeline seed:sample -- --tile-tier safe-composition --output "$PWD/test-results/e2e-content" && KIOSK_CONTENT_ROOT="$PWD/test-results/e2e-content" pnpm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
