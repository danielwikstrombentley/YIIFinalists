import { expect, test, type Page } from '@playwright/test';

// T021 (red-first): This specification deliberately defines the private E2E bridge that T028
// must provide when `?e2e=1` is present. The bridge owns a real SimulatorTransport and must
// inject through the normal input boundary; it must never bypass it by sending machine events
// directly. It is not rendered on the public stage or enabled during normal kiosk operation.
interface E2eRuntime {
  simulator: {
    injectAction(type: string, payload: unknown): void;
  };
  stateHistory(): unknown[];
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
      if (!runtime) throw new Error('US1 E2E runtime bridge is unavailable.');
      runtime.simulator.injectAction(actionType, actionPayload);
    },
    { actionType: type, actionPayload: payload },
  );
}

async function stateHistory(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const runtime = (window as Window & { __YII_E2E__?: E2eRuntime }).__YII_E2E__;
    if (!runtime) throw new Error('US1 E2E runtime bridge is unavailable.');
    return runtime.stateHistory().map((state) => JSON.stringify(state));
  });
}

test.describe('US1: category and cinematic globe preview', () => {
  test('US1 scenario 1: category selection routes through idle and previews the first finalist', async ({
    page,
  }) => {
    await openIdleStage(page);

    await injectAction(page, 'category.select', { categoryId: 'cat-1' });

    const stage = page.locator('#stage');
    await expect(stage).toHaveAttribute('data-machine-state', '{"categoryActive":"preview"}');
    await expect(page.locator('[data-testid="globe-marker"][data-visible="true"]')).toHaveCount(3);
    await expect(page.getByTestId('preview-metadata')).toBeVisible();
    await expect(page.getByTestId('preview-metadata')).toHaveAttribute(
      'data-project-id',
      'cat-1-proj-1',
    );
    await expect(page.getByTestId('preview-metadata')).toContainText('Sample Project 1.1');
    await expect(page.getByTestId('preview-metadata')).toContainText('Sample Organisation');
    await expect(page.getByTestId('preview-metadata')).toContainText('Sampleland');
    await expect(page.locator('[data-testid="globe-marker"][data-emphasized="true"]')).toHaveCount(
      1,
    );
    await expect(
      page.locator('[data-testid="globe-marker"][data-project-id="cat-1-proj-1"]'),
    ).toHaveAttribute('data-emphasized', 'true');

    expect((await stateHistory(page)).slice(-2)).toEqual([
      '"idle"',
      '{"categoryActive":"preview"}',
    ]);
  });

  test('US1 scenario 2: wheel navigation reframes at space level and updates metadata without flicker', async ({
    page,
  }) => {
    await openIdleStage(page);
    await injectAction(page, 'category.select', { categoryId: 'cat-1' });

    const metadata = page.getByTestId('preview-metadata');
    await expect(metadata).toBeVisible();
    await injectAction(page, 'preview.hover', { direction: 'next' });

    await expect(metadata).toBeVisible();
    await expect(metadata).toHaveAttribute('data-project-id', 'cat-1-proj-2');
    await expect(metadata).toContainText('Sample Project 1.2');
    await expect(page.getByTestId('globe-renderer')).toHaveAttribute('data-camera-level', 'space');
    await expect(
      page.locator('[data-testid="globe-marker"][data-project-id="cat-1-proj-2"]'),
    ).toHaveAttribute('data-emphasized', 'true');
  });

  test('US1 scenario 3: a rapid wheel burst settles on the final hover without queued destinations', async ({
    page,
  }) => {
    await openIdleStage(page);
    await injectAction(page, 'category.select', { categoryId: 'cat-1' });

    await page.evaluate(() => {
      const runtime = (window as Window & { __YII_E2E__?: E2eRuntime }).__YII_E2E__;
      if (!runtime) throw new Error('US1 E2E runtime bridge is unavailable.');
      const { simulator } = runtime;
      simulator.injectAction('preview.hover', { projectId: 'cat-1-proj-2' });
      simulator.injectAction('preview.hover', { projectId: 'cat-1-proj-1' });
      simulator.injectAction('preview.hover', { projectId: 'cat-1-proj-3' });
    });

    await expect(page.getByTestId('preview-metadata')).toHaveAttribute(
      'data-project-id',
      'cat-1-proj-3',
    );
    await expect(page.getByTestId('globe-renderer')).toHaveAttribute(
      'data-preview-motion',
      'settled',
    );
    await expect(page.getByTestId('globe-renderer')).toHaveAttribute('data-queued-targets', '0');
    await expect(page.locator('[data-testid="globe-marker"][data-emphasized="true"]')).toHaveCount(
      1,
    );
    await expect(
      page.locator('[data-testid="globe-marker"][data-project-id="cat-1-proj-3"]'),
    ).toHaveAttribute('data-emphasized', 'true');
  });

  test('US1 scenario 4: the idle loop continues and the public surface contains no instructions', async ({
    page,
  }) => {
    await openIdleStage(page);

    const globe = page.getByTestId('globe-renderer');
    await expect(globe).toHaveAttribute('data-idle-loop', 'running');
    const initialFrame = await globe.getAttribute('data-idle-frame');
    await expect.poll(() => globe.getAttribute('data-idle-frame')).not.toBe(initialFrame);

    await expect(page.locator('[data-testid="globe-marker"][data-visible="true"]')).toHaveCount(36);
    await expect(page.getByTestId('preview-metadata')).toHaveCount(0);
    await expect(page.locator('#stage')).toHaveText('');
    await expect(page.locator('[data-testid="public-instructions"]')).toHaveCount(0);
  });
});
