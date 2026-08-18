import { expect, test, type Page } from '@playwright/test';
import { expectVisibleTransitionFrames } from './helpers/transition-frames.js';

// T045 (red-first): simulator-driven public contract for US4. The bridge is intentionally
// dev/E2E-only; every action still crosses the normal SimulatorTransport and InputBoundary.
interface E2eRuntime {
  simulator: {
    injectAction(type: string, payload: unknown): void;
  };
}

type MajorState =
  | 'idle'
  | 'categoryActive.preview'
  | 'transitionToProject'
  | 'projectLanding'
  | 'contentPlaying'
  | 'contentFinalHold'
  | 'transitionToPreview';

const MAJOR_STATES: readonly MajorState[] = [
  'idle',
  'categoryActive.preview',
  'transitionToProject',
  'projectLanding',
  'contentPlaying',
  'contentFinalHold',
  'transitionToPreview',
];

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
      if (!runtime) throw new Error('US4 E2E runtime bridge is unavailable.');
      runtime.simulator.injectAction(actionType, actionPayload);
    },
    { actionType: type, actionPayload: payload },
  );
}

async function enterPreview(page: Page, categoryId = 'cat-1'): Promise<void> {
  await injectAction(page, 'category.select', { categoryId });
  await expect(page.locator('#stage')).toHaveAttribute(
    'data-machine-state',
    '{"categoryActive":"preview"}',
  );
  await expect(page.getByTestId('preview-metadata')).toHaveAttribute(
    'data-project-id',
    `${categoryId}-proj-1`,
  );
}

async function arriveAtState(page: Page, state: MajorState): Promise<void> {
  await openIdleStage(page);
  if (state === 'idle') return;

  await enterPreview(page);
  if (state === 'categoryActive.preview') return;

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
    '"transitionToProject"',
  );
  if (state === 'transitionToProject') return;

  await expect(page.locator('#stage')).toHaveAttribute('data-machine-state', '"projectLanding"', {
    timeout: 5_000,
  });
  if (state === 'projectLanding') return;

  if (state === 'transitionToPreview') {
    await injectAction(page, 'nav.back', {});
    await expect(page.locator('#stage')).toHaveAttribute(
      'data-machine-state',
      '"transitionToPreview"',
    );
    return;
  }

  await injectAction(page, 'content.select', { position: 1 });
  await expect(page.locator('#stage')).toHaveAttribute('data-machine-state', '"contentPlaying"');
  if (state === 'contentPlaying') return;

  await expect(page.locator('#stage')).toHaveAttribute('data-machine-state', '"contentFinalHold"', {
    timeout: 7_000,
  });
}

async function expectCategoryPreview(page: Page, categoryId: string): Promise<void> {
  await expect(page.locator('#stage')).toHaveAttribute(
    'data-machine-state',
    '{"categoryActive":"preview"}',
    { timeout: 8_000 },
  );
  await expect(page.getByTestId('preview-metadata')).toHaveAttribute(
    'data-project-id',
    `${categoryId}-proj-1`,
  );
  await expect(page.locator('[data-testid="globe-marker"][data-visible="true"]')).toHaveCount(3);
  await expect(page.locator('[data-testid="story-content"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="landing-hero"]')).toHaveCount(0);
}

async function expectIdlePresentation(page: Page): Promise<void> {
  await expect(page.locator('#stage')).toHaveAttribute('data-machine-state', '"idle"', {
    timeout: 8_000,
  });
  await expect(page.locator('[data-testid="globe-marker"][data-visible="true"]')).toHaveCount(36);
  await expect(page.getByTestId('globe-renderer')).toHaveAttribute('data-idle-loop', 'running');
  await expect(page.locator('[data-testid="story-content"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="landing-hero"]')).toHaveCount(0);
}

test.describe('US4: back, category changes, and return-to-idle from every major state', () => {
  test('US4 scenario 1: back during playback stops story media and restores the previous preview through the inverse handover', async ({
    page,
  }) => {
    await arriveAtState(page, 'contentPlaying');
    await expect(page.getByTestId('voiceover-player')).toHaveAttribute('data-status', 'playing');

    await injectAction(page, 'nav.back', {});
    await expect(page.locator('#stage')).toHaveAttribute(
      'data-machine-state',
      '"transitionToPreview"',
    );
    await expect(page.locator('[data-testid="story-content"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="voiceover-player"]')).toHaveCount(0);
    await expectVisibleTransitionFrames(page, { frameCount: 12, intervalMs: 80 });

    await expectCategoryPreview(page, 'cat-1');
  });

  test('US4 scenario 2: category selection reaches the new first preview from every major state', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    for (const state of MAJOR_STATES) {
      await arriveAtState(page, state);
      await injectAction(page, 'category.select', { categoryId: 'cat-2' });
      await expectCategoryPreview(page, 'cat-2');
    }
  });

  test('US4 scenario 2: an intentional same-category re-press starts a fresh category preview entry after the dedup window', async ({
    page,
  }) => {
    await arriveAtState(page, 'categoryActive.preview');
    await expect(page.getByTestId('globe-renderer')).toHaveAttribute(
      'data-preview-motion',
      'settled',
    );

    await page.waitForTimeout(1_050);
    await injectAction(page, 'category.select', { categoryId: 'cat-1' });
    await expect(page.getByTestId('globe-renderer')).toHaveAttribute(
      'data-preview-motion',
      'retargeting',
    );
    await expectCategoryPreview(page, 'cat-1');
    await expect(page.getByTestId('globe-renderer')).toHaveAttribute(
      'data-preview-motion',
      'settled',
    );
  });

  test('US4 scenario 3: return-to-idle removes active presentation from every major state', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    for (const state of MAJOR_STATES) {
      await arriveAtState(page, state);
      await injectAction(page, 'nav.idle', {});
      await expectIdlePresentation(page);
    }
  });

  test('US4 scenario 4: a simulated twelve-hour idle period never changes the current state', async ({
    page,
  }) => {
    await openIdleStage(page);
    await page.clock.install();
    await page.clock.fastForward('12:00:00');

    await expectIdlePresentation(page);
  });
});
