import { expect, test, type Page } from '@playwright/test';

// T037 (red-first): this specification defines the simulator-driven public playback contract
// which T043/T044 must satisfy. Every interaction goes through the same InputBoundary as a real
// console action; the data attributes are non-visible E2E probes, never public controls.
interface E2eRuntime {
  simulator: {
    injectAction(type: string, payload: unknown): void;
  };
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
      if (!runtime) throw new Error('US3 E2E runtime bridge is unavailable.');
      runtime.simulator.injectAction(actionType, actionPayload);
    },
    { actionType: type, actionPayload: payload },
  );
}

async function arriveAtProjectLanding(page: Page): Promise<void> {
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
}

async function startContent(page: Page, position: number): Promise<void> {
  await injectAction(page, 'content.select', { position });
  await expect(page.locator('#stage')).toHaveAttribute('data-machine-state', '"contentPlaying"');
}

test.describe('US3: content playback, voiceover, final hold, replay, and switching', () => {
  test('US3 scenario 1: an active position starts one visual sequence and its voiceover together', async ({
    page,
  }) => {
    await arriveAtProjectLanding(page);
    await startContent(page, 1);

    const story = page.getByTestId('story-content');
    await expect(story).toBeVisible();
    await expect(story).toHaveAttribute('data-content-position', '1');
    await expect(story).toHaveAttribute('data-playback-phase', 'playing');
    await expect(page.getByTestId('voiceover-player')).toHaveAttribute('data-status', 'playing');
    await expect(page.getByTestId('voiceover-player')).toHaveAttribute(
      'data-content-position',
      '1',
    );
  });

  test('US3 scenario 2: completion holds the defined final frame without auto-returning to landing', async ({
    page,
  }) => {
    await arriveAtProjectLanding(page);
    await startContent(page, 1);

    const stage = page.locator('#stage');
    const story = page.getByTestId('story-content');
    await expect(stage).toHaveAttribute('data-machine-state', '"contentFinalHold"', {
      timeout: 7_000,
    });
    await expect(story).toHaveAttribute('data-playback-phase', 'final-hold');
    await expect(story).toHaveAttribute('data-final-frame-held', 'true');
    await page.waitForTimeout(300);
    await expect(stage).toHaveAttribute('data-machine-state', '"contentFinalHold"');
    await expect(page.getByTestId('landing-hero')).toHaveCount(0);
  });

  test('US3 scenarios 3 and 6: duplicate bounce is filtered, while a deliberate re-press restores a new opening run', async ({
    page,
  }) => {
    await arriveAtProjectLanding(page);
    await startContent(page, 1);

    const story = page.getByTestId('story-content');
    await expect(story).toBeVisible();
    const initialRun = await story.getAttribute('data-playback-run');
    expect(initialRun).not.toBeNull();

    await injectAction(page, 'content.select', { position: 1 });
    await page.waitForTimeout(150);
    await expect(story).toHaveAttribute('data-playback-run', initialRun ?? '');

    await page.waitForTimeout(1_050);
    await injectAction(page, 'content.select', { position: 1 });
    await expect(story).not.toHaveAttribute('data-playback-run', initialRun ?? '');
    await expect(story).toHaveAttribute('data-opening-state-restored', 'true');
    await expect(page.getByTestId('voiceover-player')).toHaveAttribute('data-status', 'playing');
  });

  test('US3 scenario 4: a different active position cleanly replaces the old story and voiceover', async ({
    page,
  }) => {
    await arriveAtProjectLanding(page);
    await startContent(page, 1);
    await expect(page.getByTestId('story-content')).toHaveAttribute('data-content-position', '1');

    await injectAction(page, 'content.select', { position: 2 });
    await expect(page.getByTestId('story-content')).toHaveAttribute('data-content-position', '2');
    await expect(page.getByTestId('voiceover-player')).toHaveAttribute(
      'data-content-position',
      '2',
    );
    await expect(page.getByTestId('voiceover-player')).toHaveAttribute('data-status', 'playing');
    await expect(page.getByTestId('story-content')).toHaveCount(1);
  });

  test('US3 scenario 5: an inactive content position has no visible effect', async ({ page }) => {
    await arriveAtProjectLanding(page);
    await startContent(page, 1);

    const story = page.getByTestId('story-content');
    await expect(story).toBeVisible();
    const run = await story.getAttribute('data-playback-run');
    await injectAction(page, 'content.select', { position: 5 });
    await page.waitForTimeout(150);

    await expect(page.locator('#stage')).toHaveAttribute('data-machine-state', '"contentPlaying"');
    await expect(story).toHaveAttribute('data-content-position', '1');
    await expect(story).toHaveAttribute('data-playback-run', run ?? '');
  });
});
