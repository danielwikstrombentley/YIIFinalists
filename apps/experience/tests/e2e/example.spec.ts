import { expect, test } from '@playwright/test';

// Smoke test only — proves the Playwright pipeline can boot the built app (T002). Real US1-US4
// journeys are added starting at T021 via the hidden SimulatorTransport.
test('boots to the full-screen stage mount point', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#stage')).toBeVisible();
});
