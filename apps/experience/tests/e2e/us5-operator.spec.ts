import { expect, test, type Page } from '@playwright/test';

// T049 (red-first): the hidden operator surface is activated through the ordinary
// SimulatorTransport -> InputBoundary path. The known test configuration uses actions that are
// valid but inert at idle; no browser-side shortcut or direct machine event is permitted.
interface E2eRuntime {
  simulator: {
    injectAction(type: string, payload: unknown): void;
  };
}

const OPERATOR_ACTIVATION_SEQUENCE = [
  ['nav.back', {}],
  ['nav.idle', {}],
  ['project.select', {}],
] as const;

const SC006_COVERAGE = [
  'category.select',
  'preview.hover',
  'project.select',
  'content.select',
  'content.replay',
  'nav.back',
  'nav.idle',
  'operator.reset',
  'duplicate-burst',
  'deliberate-repeat',
  'invalid-id',
  'unknown-type',
  'rapid-hover-stream',
  'disconnect',
  'reconnect',
  'transition-midpoint-interrupt',
  'force-media-failure',
  'renderer-recover',
] as const;

async function openIdleStage(page: Page): Promise<void> {
  await page.goto('/?e2e=1');
  const stage = page.locator('#stage');
  await expect(stage).toBeVisible();
  await expect(stage).toHaveAttribute('data-machine-state', '"idle"', { timeout: 2_000 });
}

async function injectAction(page: Page, type: string, payload: unknown): Promise<void> {
  await page.evaluate(
    ({ actionType, actionPayload }) => {
      const runtime = (window as Window & { __YII_E2E__?: E2eRuntime }).__YII_E2E__;
      if (!runtime) throw new Error('US5 E2E runtime bridge is unavailable.');
      runtime.simulator.injectAction(actionType, actionPayload);
    },
    { actionType: type, actionPayload: payload },
  );
}

async function openOperatorOverlay(page: Page): Promise<void> {
  for (const [type, payload] of OPERATOR_ACTIVATION_SEQUENCE) {
    await injectAction(page, type, payload);
  }
  await expect(page.getByTestId('operator-overlay')).toBeVisible();
}

async function arriveAtContent(page: Page): Promise<void> {
  await openIdleStage(page);
  await injectAction(page, 'category.select', { categoryId: 'cat-1' });
  await expect(page.locator('#stage')).toHaveAttribute(
    'data-machine-state',
    '{"categoryActive":"preview"}',
  );
  await expect(page.getByTestId('globe-renderer')).toHaveAttribute(
    'data-preview-motion',
    'settled',
  );
  await expect(page.getByTestId('cesium-stage')).toHaveAttribute(
    'data-meaningful-frame-ready-at-ms',
    /\d/,
  );
  await injectAction(page, 'project.select', {});
  await expect(page.locator('#stage')).toHaveAttribute('data-machine-state', '"projectLanding"', {
    timeout: 5_000,
  });
  await injectAction(page, 'content.select', { position: 1 });
  await expect(page.locator('#stage')).toHaveAttribute('data-machine-state', '"contentPlaying"');
}

function publicTechnicalText(page: Page) {
  return page.locator(
    '#stage, [data-testid="preview-metadata"], [data-testid="landing-hero"], [data-testid="story-content"]',
  );
}

test.describe('US5: operator diagnostics, simulator, and recovery', () => {
  test('US5 scenario 1: concealed activation reveals a separate operator layer with complete simulator coverage and closes without changing public state', async ({
    page,
  }) => {
    await openIdleStage(page);
    const stage = page.locator('#stage');
    await expect(page.getByTestId('operator-overlay')).toHaveCount(0);

    await openOperatorOverlay(page);
    const overlay = page.getByTestId('operator-overlay');
    await expect(overlay).not.toBeAttachedTo(stage);
    await expect(stage).toHaveAttribute('data-machine-state', '"idle"');

    const coverage = page.getByTestId('simulator-coverage');
    await expect(coverage).toBeVisible();
    for (const scenario of SC006_COVERAGE) {
      await expect(coverage.locator(`[data-simulator-scenario="${scenario}"]`)).toHaveAttribute(
        'data-available',
        'true',
      );
    }

    await page.getByTestId('operator-overlay-close').click();
    await expect(overlay).toHaveCount(0);
    await expect(stage).toHaveAttribute('data-machine-state', '"idle"');
  });

  test('US5 scenario 2: disconnect and reconnect update hidden diagnostics while the presentation continues and accepted input resumes', async ({
    page,
  }) => {
    await openIdleStage(page);
    await injectAction(page, 'category.select', { categoryId: 'cat-1' });
    await expect(page.locator('#stage')).toHaveAttribute(
      'data-machine-state',
      '{"categoryActive":"preview"}',
    );
    await openOperatorOverlay(page);

    const transport = page.getByTestId('diagnostics-transport-simulator');
    await expect(transport).toHaveAttribute('data-status', 'connected');
    await expect(transport).toHaveAttribute('data-last-action', 'category.select');

    await page.getByTestId('simulator-disconnect').click();
    await expect(transport).toHaveAttribute('data-status', 'disconnected');
    await expect(transport).toHaveAttribute('data-last-message-at', /\d/);
    await expect(page.locator('#stage')).toHaveAttribute(
      'data-machine-state',
      '{"categoryActive":"preview"}',
    );

    await page.getByTestId('simulator-reconnect').click();
    await expect(transport).toHaveAttribute('data-status', 'connected');
    await page.getByTestId('simulator-preview-next').click();
    await expect(page.getByTestId('preview-metadata')).toHaveAttribute('data-project-id', 'cat-1-proj-2');
  });

  test('US5 scenario 3: forced media failure applies an in-composition fallback and records an operator-only failure', async ({
    page,
  }) => {
    await arriveAtContent(page);
    await openOperatorOverlay(page);

    await page.getByTestId('simulator-force-media-failure').click();
    await expect(page.getByTestId('story-content')).toHaveAttribute('data-media-fallback', 'true');
    await expect(page.getByTestId('diagnostics-asset-failures')).toContainText('media');
    await expect(publicTechnicalText(page)).not.toContainText(/media failure|diagnostics|error/i);
  });

  test('US5 scenario 4: renderer recovery reaches a known safe idle presentation without public technical output', async ({
    page,
  }) => {
    await arriveAtContent(page);
    await openOperatorOverlay(page);

    await page.getByTestId('recovery-renderer-cesium').click();
    await expect(page.locator('#stage')).toHaveAttribute('data-machine-state', '"idle"', {
      timeout: 8_000,
    });
    await expect(page.getByTestId('globe-renderer')).toHaveAttribute('data-idle-loop', 'running');
    await expect(page.getByTestId('diagnostics-state')).toHaveAttribute('data-state-path', 'idle');
    await expect(publicTechnicalText(page)).not.toContainText(
      /diagnostics|telemetry|renderer recover|error|stack/i,
    );
  });
});