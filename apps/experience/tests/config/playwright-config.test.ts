import { describe, expect, it } from 'vitest';
import playwrightConfig from '../../playwright.config.ts';

function webServerCommand(): string {
  const webServer = playwrightConfig.webServer;
  if (!webServer || Array.isArray(webServer)) {
    throw new Error('Expected one Playwright web-server configuration.');
  }
  return webServer.command;
}

describe('Playwright isolated content fixture', () => {
  it('generates and serves the safe E2E release from test-results rather than the active local sample root', () => {
    const command = webServerCommand();

    expect(command).toContain(
      'seed:sample -- --tile-tier safe-composition --output "$PWD/test-results/e2e-content"',
    );
    expect(command).toContain('KIOSK_CONTENT_ROOT="$PWD/test-results/e2e-content"');
    expect(command).toContain('pnpm run dev');
  });
});
