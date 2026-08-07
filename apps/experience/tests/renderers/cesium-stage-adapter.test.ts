import gsap from 'gsap';
import { Cartesian3 } from 'cesium';
import { describe, expect, it, vi } from 'vitest';
import type { GeographicFraming } from '@yii/content-schema';
import {
  CesiumStageAdapter,
  type CesiumStageProject,
  type CesiumTilesetLike,
  type CesiumViewerLike,
} from '../../src/renderers/cesium/CesiumStageAdapter.js';
import type { NativeCameraFlightOptions } from '../../src/renderers/cesium/camera-flight.js';
import { Ticker } from '../../src/orchestration/ticker.js';
import type { GeographicCameraPose } from '../../src/renderers/handover/geographic-camera-pose.js';

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
const SOURCE_POSE: GeographicCameraPose = {
  positionEcef: [6_378_137, 1_000, 2_000],
  directionEcef: [-1, 0, 0],
  upEcef: [0, 0, 1],
  verticalFovRadians: (42 * Math.PI) / 180,
  aspectRatio: 16 / 9,
};

function createViewer() {
  const render = vi.fn<() => void>();
  const destroy = vi.fn<() => void>();
  const add = vi.fn<(primitive: CesiumTilesetLike) => unknown>();
  const remove = vi.fn<(primitive: CesiumTilesetLike) => boolean>(() => true);
  const requestRender = vi.fn<() => void>();
  const camera = {
    position: { x: 6_378_137, y: 0, z: 0 } as Cartesian3,
    direction: { x: -1, y: 0, z: 0 } as Cartesian3,
    up: { x: 0, y: 0, z: 1 } as Cartesian3,
    right: { x: 0, y: 1, z: 0 } as Cartesian3,
    positionWC: { x: 6_378_137, y: 0, z: 0 },
    directionWC: { x: -1, y: 0, z: 0 },
    upWC: { x: 0, y: 0, z: 1 },
    frustum: {
      fov: 2 * Math.atan(Math.tan(Math.PI / 8) * (16 / 9)),
      aspectRatio: 16 / 9,
    },
    setView: vi.fn((options) => {
      Object.assign(camera.positionWC, options.destination);
      Object.assign(camera.directionWC, options.orientation.direction);
      Object.assign(camera.upWC, options.orientation.up);
    }),
    flyTo: vi.fn<(options: NativeCameraFlightOptions) => void>(() => {}),
    cancelFlight: vi.fn(),
  } satisfies NonNullable<CesiumViewerLike['camera']>;
  return {
    viewer: {
      render,
      destroy,
      camera,
      scene: {
        primitives: { add, remove },
        requestRender,
        canvas: { clientWidth: 1_600, clientHeight: 900 },
      },
    } satisfies CesiumViewerLike,
    render,
    destroy,
    add,
    remove,
    setView: camera.setView,
    flyTo: camera.flyTo,
    cancelFlight: camera.cancelFlight,
  };
}

function createTileset() {
  const destroy = vi.fn<() => void>();
  return { tileset: { show: true, destroy } satisfies CesiumTilesetLike, destroy };
}

function createCollectionOwnedTileset() {
  let destroyed = false;
  const destroy = vi.fn(() => {
    if (destroyed) throw new Error('Tileset destroy() must not be called twice.');
    destroyed = true;
  });
  const isDestroyed = vi.fn(() => destroyed);
  return {
    tileset: {
      show: true,
      destroy,
      isDestroyed,
    } satisfies CesiumTilesetLike,
    destroy,
    isDestroyed,
  };
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

  it('reports its ECEF camera, actual render time, and immediate local-fallback readiness', async () => {
    const ticker = new Ticker();
    const viewer = createViewer();
    const adapter = new CesiumStageAdapter({ ticker, viewerFactory: () => viewer.viewer });
    adapter.start(document.createElement('div'));
    await adapter.activateProject(SAFE_PROJECT).ready;
    gsap.ticker.tick();

    const probe = adapter.transitionProbe();
    expect(probe).toMatchObject({
      renderer: 'cesium',
      rendering: true,
      visible: true,
      camera: {
        coordinateSpace: 'ecef',
        position: [6_378_137, 0, 0],
        verticalFovRadians: Math.PI / 4,
        aspectRatio: 16 / 9,
      },
    });
    expect(probe.frameCount).toBeGreaterThan(0);
    expect(probe.lastRenderAtMs).not.toBeNull();
    expect(probe.readiness.resourceReadyAtMs).not.toBeNull();
    expect(probe.readiness.meaningfulFrameReadyAtMs).not.toBeNull();

    adapter.dispose();
    ticker.stop();
  });

  it('renders an exact source-pose frame while hidden before resetting to landing and activation', async () => {
    const viewer = createViewer();
    const adapter = new CesiumStageAdapter({ viewerFactory: () => viewer.viewer });
    adapter.start(document.createElement('div'));
    await adapter.prewarmProject(SAFE_PROJECT).ready;

    expect(adapter.isVisible).toBe(false);
    expect(adapter.matchSourceCamera(SOURCE_POSE, SAFE_PROJECT)).toBe(true);
    expect(adapter.isVisible).toBe(false);
    expect(viewer.render).toHaveBeenCalledTimes(1);
    expect(viewer.viewer.camera.frustum.fov).toBeCloseTo(
      2 * Math.atan(Math.tan(SOURCE_POSE.verticalFovRadians / 2) * SOURCE_POSE.aspectRatio),
    );
    expect(adapter.transitionProbe()).toMatchObject({
      matchedSourceCamera: {
        coordinateSpace: 'ecef',
        position: SOURCE_POSE.positionEcef,
        verticalFovRadians: SOURCE_POSE.verticalFovRadians,
      },
    });
    expect(adapter.transitionProbe().matchedSourceFrameAtMs).not.toBeNull();

    expect(adapter.setLandingCamera(SAFE_PROJECT)).toBe(true);
    expect(viewer.setView).toHaveBeenCalledTimes(2);
    await adapter.activatePreparedProject(SAFE_PROJECT).ready;
    expect(adapter.isVisible).toBe(true);
    expect(adapter.transitionProbe().matchedSourceCamera).not.toBeNull();

    adapter.dispose();
  });

  it('transfers rendering to external frame control and exposes one native landing flight', async () => {
    const ticker = new Ticker();
    const viewer = createViewer();
    const adapter = new CesiumStageAdapter({ ticker, viewerFactory: () => viewer.viewer });
    adapter.start(document.createElement('div'));
    await adapter.activateProject(SAFE_PROJECT).ready;
    expect(ticker.rendererCount).toBe(1);

    const external = adapter.beginExternalFrameControl();
    expect(ticker.rendererCount).toBe(0);
    external.render(1 / 60);
    expect(viewer.render).toHaveBeenCalledTimes(1);

    const flight = adapter.startLandingFlight(SAFE_PROJECT, 4_200);
    expect(flight).not.toBeNull();
    expect(viewer.flyTo).toHaveBeenCalledWith(expect.objectContaining({ duration: 4.2 }));
    const nativeOptions = viewer.flyTo.mock.calls[0]?.[0];
    nativeOptions?.complete?.();
    await expect(flight?.finished).resolves.toEqual({ status: 'completed' });

    external.release();
    expect(ticker.rendererCount).toBe(1);
    adapter.dispose();
    ticker.stop();
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

  it('does not double-destroy a tileset that Cesium destroys while removing its primitive', async () => {
    const viewer = createViewer();
    const tileset = createCollectionOwnedTileset();
    viewer.remove.mockImplementation((primitive) => {
      primitive.destroy?.();
      return true;
    });
    const adapter = new CesiumStageAdapter({
      viewerFactory: () => viewer.viewer,
      ionAccessToken: 'test-token',
      ionGoogleTilesAssetId: 123,
      tilesetLoader: async () => tileset.tileset,
    });
    adapter.start(document.createElement('div'));
    await adapter.prewarmProject(PHOTOREALISTIC_PROJECT).ready;

    expect(() => adapter.reset()).not.toThrow();
    expect(() => adapter.reset()).not.toThrow();
    expect(viewer.remove).toHaveBeenCalledWith(tileset.tileset);
    expect(tileset.destroy).toHaveBeenCalledTimes(1);
    expect(tileset.isDestroyed).toHaveBeenCalled();
    adapter.dispose();
  });
});
