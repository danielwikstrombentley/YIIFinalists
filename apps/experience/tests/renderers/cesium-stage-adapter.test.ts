import gsap from 'gsap';
import { describe, expect, it, vi } from 'vitest';
import type { GeographicFraming } from '@yii/content-schema';
import {
  CesiumStageAdapter,
  type CesiumStageProject,
  type CesiumTilesetLike,
  type CesiumViewerLike,
} from '../../src/renderers/cesium/CesiumStageAdapter.js';
import { Ticker } from '../../src/orchestration/ticker.js';

const CITY_FRAMING: GeographicFraming = {
  scopeType: 'city',
  landingCamera: {
    destination: { lat: 10, lon: 20, height: 400 },
    orientation: { heading: 0, pitch: -30, roll: 0 },
    range: 800,
  },
  previewEmphasis: { markerScale: 1.2 },
  tileTier: 'safe-composition',
  canvasTreatment: { darken: 0.15 },
};

const SAFE_PROJECT: CesiumStageProject = { id: 'safe-project', geographicFraming: CITY_FRAMING };
const PHOTOREALISTIC_PROJECT: CesiumStageProject = {
  id: 'photo-project',
  geographicFraming: { ...CITY_FRAMING, tileTier: 'photorealistic' },
};

function createViewer() {
  const render = vi.fn<() => void>();
  const destroy = vi.fn<() => void>();
  const add = vi.fn<(primitive: CesiumTilesetLike) => unknown>();
  const remove = vi.fn<(primitive: CesiumTilesetLike) => boolean>(() => true);
  const requestRender = vi.fn<() => void>();
  return {
    viewer: {
      render,
      destroy,
      scene: {
        primitives: { add, remove },
        requestRender,
      },
    } satisfies CesiumViewerLike,
    render,
    destroy,
    add,
    remove,
  };
}

function createTileset() {
  const destroy = vi.fn<() => void>();
  return { tileset: { show: true, destroy } satisfies CesiumTilesetLike, destroy };
}

describe('CesiumStageAdapter', () => {
  it('disables Cesium’s default loop and renders only while its adapter is active', async () => {
    const ticker = new Ticker();
    const viewer = createViewer();
    const viewerFactory = vi.fn(() => viewer.viewer);
    const adapter = new CesiumStageAdapter({ ticker, viewerFactory });
    const stage = document.createElement('div');

    adapter.start(stage);
    expect(viewerFactory).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      expect.objectContaining({ globe: false, useDefaultRenderLoop: false }),
    );
    expect(ticker.rendererCount).toBe(0);

    await adapter.activateProject(SAFE_PROJECT).ready;
    expect(ticker.rendererCount).toBe(1);
    gsap.ticker.tick();
    expect(viewer.render).toHaveBeenCalledTimes(1);

    adapter.deactivate();
    expect(ticker.rendererCount).toBe(0);
    adapter.dispose();
    ticker.stop();
  });

  it('degrades a failing ion tileset to a visible local fallback without blanking', async () => {
    const viewer = createViewer();
    const degradations: string[] = [];
    const adapter = new CesiumStageAdapter({
      viewerFactory: () => viewer.viewer,
      ionAccessToken: 'test-token',
      ionGoogleTilesAssetId: 123,
      tilesetLoader: vi.fn().mockRejectedValue(new Error('tiles unavailable')),
      onDegradation: (event) => degradations.push(`${event.from}->${event.to}`),
    });
    const stage = document.createElement('div');
    adapter.start(stage);

    const result = await adapter.activateProject(PHOTOREALISTIC_PROJECT).ready;

    expect(result).toMatchObject({ projectId: 'photo-project', tier: 'local-fallback-scene' });
    expect(degradations).toEqual(['photorealistic->local-fallback-scene']);
    expect(adapter.element.dataset.tier).toBe('local-fallback-scene');
    expect(adapter.element.dataset.visible).toBe('true');
    expect(adapter.element.querySelector('[data-testid="cesium-fallback-surface"]')).not.toBeNull();
    adapter.dispose();
  });

  it('falls through to the safe composition when tile readiness exceeds its watchdog timeout', async () => {
    const viewer = createViewer();
    const degradations: string[] = [];
    const adapter = new CesiumStageAdapter({
      viewerFactory: () => viewer.viewer,
      ionAccessToken: 'test-token',
      ionGoogleTilesAssetId: 123,
      tilesetLoader: () => new Promise<CesiumTilesetLike>(() => {}),
      localFallbackLoader: () => Promise.reject(new Error('local scene unavailable')),
      tileLatencyTimeoutMs: 1,
      onDegradation: (event) => degradations.push(`${event.from}->${event.to}`),
    });
    adapter.start(document.createElement('div'));

    const result = await adapter.activateProject(PHOTOREALISTIC_PROJECT).ready;

    expect(result).toMatchObject({ tier: 'safe-composition', fallback: true });
    expect(degradations).toEqual([
      'photorealistic->local-fallback-scene',
      'local-fallback-scene->safe-composition',
    ]);
    adapter.dispose();
  });

  it('releases its tileset, viewer, ticker hook, and DOM resources idempotently', async () => {
    const ticker = new Ticker();
    const viewer = createViewer();
    const tileset = createTileset();
    const adapter = new CesiumStageAdapter({
      ticker,
      viewerFactory: () => viewer.viewer,
      ionAccessToken: 'test-token',
      ionGoogleTilesAssetId: 123,
      tilesetLoader: async () => tileset.tileset,
    });
    const stage = document.createElement('div');
    adapter.start(stage);
    await adapter.activateProject(PHOTOREALISTIC_PROJECT).ready;

    adapter.dispose();
    adapter.dispose();

    expect(viewer.remove).toHaveBeenCalledWith(tileset.tileset);
    expect(tileset.destroy).toHaveBeenCalledTimes(1);
    expect(viewer.destroy).toHaveBeenCalledTimes(1);
    expect(ticker.rendererCount).toBe(0);
    expect(stage.querySelector('[data-testid="cesium-stage"]')).toBeNull();
    ticker.stop();
  });
});
