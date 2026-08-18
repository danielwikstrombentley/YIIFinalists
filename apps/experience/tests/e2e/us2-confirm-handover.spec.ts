import { expect, test, type Page } from '@playwright/test';
import {
  expectVisibleTransitionFrames,
  type VisibleFrameCheckOptions,
  type VisibleTransitionFrameReport,
} from './helpers/transition-frames.js';

// T029 (red-first): This specification defines the public, screenshot-derived handover contract
// that T030–T035 must satisfy. It uses the normal SimulatorTransport bridge, never direct machine
// events, and all non-visible selectors are explicit E2E probes rather than public controls.
interface E2eRuntime {
  simulator: {
    injectAction(type: string, payload: unknown): void;
  };
  stateHistory(): unknown[];
}

interface ConfirmedTransitionReport extends VisibleTransitionFrameReport {
  readyTier: string | null;
}

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
      if (!runtime) throw new Error('US2 E2E runtime bridge is unavailable.');
      runtime.simulator.injectAction(actionType, actionPayload);
    },
    { actionType: type, actionPayload: payload },
  );
}

async function previewProject(page: Page, projectId = 'cat-1-proj-1'): Promise<void> {
  await injectAction(page, 'category.select', { categoryId: 'cat-1' });
  await expect(page.locator('#stage')).toHaveAttribute(
    'data-machine-state',
    '{"categoryActive":"preview"}',
  );
  if (projectId !== 'cat-1-proj-1') {
    await injectAction(page, 'preview.hover', { projectId });
  }
  await expect(page.getByTestId('preview-metadata')).toHaveAttribute('data-project-id', projectId);
}

async function confirmPreview(
  page: Page,
  frameOptions: VisibleFrameCheckOptions = {},
): Promise<ConfirmedTransitionReport> {
  await expect(page.getByTestId('globe-renderer')).toHaveAttribute(
    'data-preview-motion',
    'settled',
  );
  await expect(page.getByTestId('cesium-stage')).toHaveAttribute(
    'data-meaningful-frame-ready-at-ms',
    /\d/,
    { timeout: 5_000 },
  );
  const readyTier = await page.getByTestId('cesium-stage').getAttribute('data-tier');
  await injectAction(page, 'project.select', {});
  await expect(page.getByTestId('handover-controller')).toHaveAttribute(
    'data-status',
    /^(approaching|flying|blending|covering|revealing)$/,
  );
  await expect(page.getByTestId('landing-hero')).toHaveCount(0);
  const report = await expectVisibleTransitionFrames(page, {
    ...frameOptions,
    maximumOpaqueStationaryHoldMs:
      readyTier === 'photorealistic' ? 100 : frameOptions.maximumOpaqueStationaryHoldMs,
  });
  await expect(page.locator('#stage')).toHaveAttribute('data-machine-state', '"projectLanding"', {
    timeout: 5_000,
  });
  return { ...report, readyTier };
}

test.describe('US2: confirm, concealed renderer handover, and geographic landing', () => {
  test('development keyboard 3 confirms the current preview through the simulator', async ({
    page,
  }) => {
    await openIdleStage(page);

    await page.keyboard.press('1');
    const stage = page.locator('#stage');
    await expect(stage).toHaveAttribute('data-machine-state', '{"categoryActive":"preview"}');
    const previewedProjectId = await page
      .getByTestId('preview-metadata')
      .getAttribute('data-project-id');
    if (!previewedProjectId) throw new Error('The development shortcut did not create a preview.');
    await expect(page.getByTestId('globe-renderer')).toHaveAttribute(
      'data-preview-motion',
      'settled',
    );

    await page.keyboard.press('3');
    await expectVisibleTransitionFrames(page);
    await expect(stage).toHaveAttribute('data-machine-state', '"projectLanding"', {
      timeout: 5_000,
    });
    await expect(page.getByTestId('landing-hero')).toHaveAttribute(
      'data-project-id',
      previewedProjectId,
    );
  });

  test('US2 scenario 1: confirm samples no black or stale frames and reveals a landing hero only', async ({
    page,
  }, testInfo) => {
    await openIdleStage(page);
    await previewProject(page);
    const transitionReport = await confirmPreview(page, { frameCount: 20, intervalMs: 70 });
    await testInfo.attach('transition-observability', {
      body: JSON.stringify(transitionReport, null, 2),
      contentType: 'application/json',
    });
    expect(
      transitionReport.samples.some(({ handoverStatus }) => handoverStatus !== 'unavailable'),
    ).toBe(true);
    if (transitionReport.readyTier === 'photorealistic') {
      expect(transitionReport.cameraComparison?.comparable).toBe(true);
      expect(
        transitionReport.cameraComparison?.aligned,
        JSON.stringify(transitionReport.cameraComparison),
      ).toBe(true);
      expect(
        transitionReport.targetProjectionDelta?.distance,
        'matched Cesium target must stay within 0.5% of the globe viewport',
      ).toBeLessThanOrEqual(0.005);
      expect(
        transitionReport.maximumLiveCameraDelta?.aligned,
        JSON.stringify(transitionReport.maximumLiveCameraDelta),
      ).toBe(true);
      expect(
        transitionReport.maximumLiveTargetProjectionDelta,
        'selected target must remain aligned through the live renderer overlap',
      ).toBeLessThanOrEqual(0.005);
      expect(transitionReport.longestOpaqueStationaryHoldMs).toBeLessThanOrEqual(100);
    }

    const hero = page.getByTestId('landing-hero');
    await expect(hero).toBeVisible();
    await expect(hero).toHaveAttribute('data-project-id', 'cat-1-proj-1');
    await expect(hero).toContainText('Sample Project 1.1');
    await expect(hero).toContainText('Sample Organisation');
    await expect(hero).toContainText('Sample City');
    await expect(
      page.locator('[data-testid="public-loading"], [data-testid="story-content"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-testid="voiceover-caption"], [data-testid="public-menu"]'),
    ).toHaveCount(0);
  });

  test('US2 scenario 2: landing contains no narration or content controls before a position is selected', async ({
    page,
  }) => {
    await openIdleStage(page);
    await previewProject(page);
    await confirmPreview(page);

    await expect(page.getByTestId('landing-hero')).toBeVisible();
    await expect(page.locator('[data-testid="voiceover-player"]')).toHaveCount(0);
    await expect(
      page.locator('[data-testid="content-option"], [data-testid="replay-control"]'),
    ).toHaveCount(0);
  });

  test('US2 scenario 3: a corridor project lands using its own approved framing', async ({
    page,
  }) => {
    await openIdleStage(page);
    await previewProject(page, 'cat-1-proj-2');
    await confirmPreview(page);

    const cesiumStage = page.getByTestId('cesium-stage');
    await expect(cesiumStage).toHaveAttribute('data-project-id', 'cat-1-proj-2');
    const framing = await cesiumStage.evaluate((element) => {
      const encoded = element.getAttribute('data-framing');
      if (!encoded) throw new Error('The Cesium stage did not expose its active framing probe.');
      return JSON.parse(encoded) as unknown;
    });
    expect(framing).toMatchObject({
      scopeType: 'corridor',
      landingCamera: {
        destination: { lat: -55, lon: -162, height: 1_200 },
        range: 16_000,
      },
    });
  });

  test('US2 scenario 4: category selection interrupts an in-flight handover and returns to the new preview', async ({
    page,
  }) => {
    await openIdleStage(page);
    await previewProject(page);
    await injectAction(page, 'project.select', {});
    await expect(page.locator('#stage')).toHaveAttribute(
      'data-machine-state',
      '"transitionToProject"',
    );
    // `transitionToProject` may begin while the code-split Cesium renderer is still loading.
    // Wait for an actual controller beat so this asserts cancellation *mid-handover*, rather
    // than merely pre-empting a queued renderer startup before it owns any visual resources.
    await expect(page.getByTestId('handover-controller')).toHaveAttribute(
      'data-status',
      /^(approaching|flying|blending|covering|revealing)$/,
    );
    await injectAction(page, 'category.select', { categoryId: 'cat-2' });

    await expect(page.locator('#stage')).toHaveAttribute(
      'data-machine-state',
      '{"categoryActive":"preview"}',
    );
    await expect(page.getByTestId('preview-metadata')).toHaveAttribute(
      'data-project-id',
      'cat-2-proj-1',
    );
    await expect(page.getByTestId('handover-controller')).toHaveAttribute(
      'data-status',
      'cancelled',
    );
    await expect(page.locator('[data-testid="globe-marker"][data-visible="true"]')).toHaveCount(3);
  });

  test('T046: a landed project reverses visibly back to the whole-globe idle composition', async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await openIdleStage(page);
    await previewProject(page);
    await confirmPreview(page);

    await injectAction(page, 'nav.idle', {});
    await expect(page.locator('#stage')).toHaveAttribute(
      'data-machine-state',
      '"transitionToPreview"',
    );
    await expect(page.getByTestId('handover-controller')).toHaveAttribute(
      'data-status',
      /^(approaching|flying|blending|covering|revealing)$/,
    );
    const reverseReport = await expectVisibleTransitionFrames(page, {
      frameCount: 12,
      intervalMs: 80,
    });
    await testInfo.attach('reverse-transition-observability', {
      body: JSON.stringify(reverseReport, null, 2),
      contentType: 'application/json',
    });
    expect(
      reverseReport.samples.some(({ handoverStatus }) => handoverStatus !== 'unavailable'),
    ).toBe(true);

    await expect(page.locator('#stage')).toHaveAttribute('data-machine-state', '"idle"', {
      timeout: 7_000,
    });
    await expect(page.getByTestId('globe-renderer')).toHaveCSS('opacity', '1');
    await expect(page.getByTestId('cesium-stage')).toHaveCSS('opacity', '0');
    expect(errors).toEqual([]);
  });

  test('T046: selecting a new category from a landing reverses before revealing its first preview', async ({
    page,
  }) => {
    await openIdleStage(page);
    await previewProject(page, 'cat-1-proj-1');
    await confirmPreview(page);

    await injectAction(page, 'category.select', { categoryId: 'cat-2' });
    await expect(page.locator('#stage')).toHaveAttribute(
      'data-machine-state',
      '"transitionToPreview"',
    );
    await expect(page.getByTestId('handover-controller')).toHaveAttribute(
      'data-status',
      /^(approaching|flying|blending|covering|revealing)$/,
    );
    await expect(page.getByTestId('handover-controller')).toHaveAttribute(
      'data-ownership',
      /^(overlap|globe)$/,
      { timeout: 5_000 },
    );

    await expect(page.locator('#stage')).toHaveAttribute(
      'data-machine-state',
      '{"categoryActive":"preview"}',
      { timeout: 7_000 },
    );
    await expect(page.getByTestId('preview-metadata')).toHaveAttribute(
      'data-project-id',
      'cat-2-proj-1',
    );
  });

  test('T083 repeated project-entry cycles restore one ticker owner and one reusable cover', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await openIdleStage(page);

    for (const categoryId of ['cat-1', 'cat-2']) {
      await injectAction(page, 'category.select', { categoryId });
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
      await expect(page.locator('#stage')).toHaveAttribute(
        'data-machine-state',
        '"projectLanding"',
        {
          timeout: 10_000,
        },
      );
      const landingSnapshot = await page.evaluate(() => window.__YII_E2E__?.transitionSnapshot());
      expect(landingSnapshot?.sharedTickerRendererCount).toBe(1);

      await injectAction(page, 'nav.idle', {});
      await expect(page.locator('#stage')).toHaveAttribute('data-machine-state', '"idle"');
      await expect(page.getByTestId('globe-renderer')).toHaveCSS('opacity', '1');
      const idleSnapshot = await page.evaluate(() => window.__YII_E2E__?.transitionSnapshot());
      expect(idleSnapshot?.sharedTickerRendererCount).toBe(1);
      const idleCameraPosition = idleSnapshot?.globe?.camera?.position;
      if (!idleCameraPosition) throw new Error('Idle globe camera probe is unavailable.');
      // A Cesium landing pose sits close to the WGS84 surface (about 6.4 Mm from the centre),
      // whereas the rig-owned whole-globe presentation is intentionally at space-level range.
      // Assert immediately after `nav.idle` so a stale external handover pose cannot hide behind
      // a later GSAP camera update.
      expect(Math.hypot(...idleCameraPosition)).toBeGreaterThan(10_000_000);
    }

    await expect(page.locator('[data-testid="handover-controller"]')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
});
