import { describe, expect, it, vi } from 'vitest';
import type { GeographicFraming } from '@yii/content-schema';
import { PreloadManager } from '../../src/content/preload.js';
import {
  CesiumPrewarmController,
  type CesiumPrewarmStage,
} from '../../src/renderers/cesium/prewarm.js';
import type {
  CesiumStageOperation,
  CesiumStageProject,
} from '../../src/renderers/cesium/CesiumStageAdapter.js';

const FRAMING: GeographicFraming = {
  scopeType: 'city',
  landingCamera: {
    destination: { lat: 10, lon: 20, height: 400 },
    orientation: { heading: 0, pitch: -30, roll: 0 },
    range: 800,
  },
  previewEmphasis: {},
  tileTier: 'safe-composition',
  canvasTreatment: {},
};

const FIRST_PROJECT: CesiumStageProject = { id: 'first-project', geographicFraming: FRAMING };
const SECOND_PROJECT: CesiumStageProject = { id: 'second-project', geographicFraming: FRAMING };

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createStageOperation() {
  const deferred = createDeferred<{
    projectId: string;
    tier: 'safe-composition';
    fallback: true;
    status: 'ready';
  }>();
  const cancel = vi.fn();
  return {
    handle: { ready: deferred.promise, cancel } satisfies CesiumStageOperation,
    deferred,
    cancel,
  };
}

describe('CesiumPrewarmController', () => {
  it('cancels a retargeted warm, exposes only the current readiness signal, and resolves when both workstreams are ready', async () => {
    const first = createStageOperation();
    const second = createStageOperation();
    const stage: CesiumPrewarmStage = {
      prewarmProject: vi.fn().mockReturnValueOnce(first.handle).mockReturnValueOnce(second.handle),
    };
    const landingAssetPreloader = { preload: vi.fn(async () => {}) };
    const controller = new CesiumPrewarmController({
      stage,
      preloadManager: new PreloadManager(),
      landingAssetPreloader,
    });

    const firstWarm = controller.warm(FIRST_PROJECT);
    const secondWarm = controller.warm(SECOND_PROJECT);

    expect(first.cancel).toHaveBeenCalledTimes(1);
    await expect(firstWarm.ready).resolves.toMatchObject({
      projectId: 'first-project',
      status: 'cancelled',
    });
    expect(controller.readinessFor('first-project')).toBeNull();
    expect(controller.readinessFor('second-project')).toBe(secondWarm.ready);

    second.deferred.resolve({
      projectId: 'second-project',
      tier: 'safe-composition',
      fallback: true,
      status: 'ready',
    });
    await expect(secondWarm.ready).resolves.toMatchObject({
      projectId: 'second-project',
      status: 'ready',
      landingAssetsReady: true,
    });
  });

  it('uses the content preload cache so a repeated project warm does not decode landing assets twice', async () => {
    const first = createStageOperation();
    const second = createStageOperation();
    const stage: CesiumPrewarmStage = {
      prewarmProject: vi.fn().mockReturnValueOnce(first.handle).mockReturnValueOnce(second.handle),
    };
    const landingAssetPreloader = { preload: vi.fn(async () => {}) };
    const controller = new CesiumPrewarmController({
      stage,
      preloadManager: new PreloadManager(),
      landingAssetPreloader,
    });

    const firstWarm = controller.warm(FIRST_PROJECT);
    first.deferred.resolve({
      projectId: 'first-project',
      tier: 'safe-composition',
      fallback: true,
      status: 'ready',
    });
    await firstWarm.ready;

    const secondWarm = controller.warm(FIRST_PROJECT);
    second.deferred.resolve({
      projectId: 'first-project',
      tier: 'safe-composition',
      fallback: true,
      status: 'ready',
    });
    await secondWarm.ready;

    expect(landingAssetPreloader.preload).toHaveBeenCalledTimes(1);
  });
});
