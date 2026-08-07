import { Cartesian3 } from 'cesium';
import { describe, expect, it, vi } from 'vitest';
import type { GeographicFraming } from '@yii/content-schema';
import {
  CesiumStageAdapter,
  type CesiumStageProject,
  type CesiumTilesetLike,
  type CesiumViewerLike,
} from '../../src/renderers/cesium/CesiumStageAdapter.js';
import { Ticker } from '../../src/orchestration/ticker.js';

const FRAMING: GeographicFraming = {
  scopeType: 'city',
  landingCamera: {
    destination: { lat: 51.5074, lon: -0.1278, height: 140 },
    orientation: { heading: 22, pitch: -32, roll: 0 },
    range: 16_000,
  },
  previewEmphasis: {},
  tileTier: 'photorealistic',
  canvasTreatment: {},
};

const PROJECT: CesiumStageProject = { id: 'meaningful-project', geographicFraming: FRAMING };

class TestEvent<Args extends unknown[] = []> {
  private readonly listeners = new Set<(...args: Args) => void>();

  addEventListener(listener: (...args: Args) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  raise(...args: Args): void {
    for (const listener of [...this.listeners]) listener(...args);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function createHarness() {
  const ticker = new Ticker();
  const initialTilesLoaded = new TestEvent();
  const tileLoad = new TestEvent<[unknown]>();
  const postRender = new TestEvent();
  const setView = vi.fn();
  const camera = {
    position: new Cartesian3(6_378_137, 0, 0),
    direction: new Cartesian3(-1, 0, 0),
    up: new Cartesian3(0, 0, 1),
    right: new Cartesian3(0, 1, 0),
    positionWC: new Cartesian3(6_378_137, 0, 0),
    directionWC: new Cartesian3(-1, 0, 0),
    upWC: new Cartesian3(0, 0, 1),
    frustum: { fov: Math.PI / 3, aspectRatio: 16 / 9 },
    setView,
  };
  const viewer = {
    camera,
    scene: {
      primitives: { add: vi.fn(), remove: vi.fn(() => true) },
      requestRender: vi.fn(),
      postRender,
      canvas: { clientWidth: 1_600, clientHeight: 900 },
    },
    render: vi.fn(),
    destroy: vi.fn(),
  } as unknown as CesiumViewerLike;
  const tileset = {
    show: true,
    initialTilesLoaded,
    tileLoad,
    tilesLoaded: false,
    destroy: vi.fn(),
  } as CesiumTilesetLike & {
    initialTilesLoaded: TestEvent;
    tilesLoaded: boolean;
  };
  const adapter = new CesiumStageAdapter({
    ticker,
    viewerFactory: () => viewer,
    ionAccessToken: 'test-token',
    ionGoogleTilesAssetId: 123,
    tilesetLoader: async () => tileset,
  });
  adapter.start(document.createElement('div'));
  return { adapter, ticker, viewer, tileset, initialTilesLoaded, tileLoad, postRender, setView };
}

describe('Cesium target-view meaningful readiness', () => {
  it('keeps prewarm hidden and pending until tile-ready plus the following post-render', async () => {
    const harness = createHarness();
    const operation = harness.adapter.prewarmProject(PROJECT);
    let settled = false;
    void operation.ready.then(() => {
      settled = true;
    });

    await flushAsyncWork();
    expect(harness.adapter.isRendering).toBe(true);
    expect(harness.adapter.isVisible).toBe(false);
    expect(harness.setView).toHaveBeenCalled();
    expect(settled, 'tileset construction alone must not resolve readiness').toBe(false);

    harness.tileset.tilesLoaded = true;
    harness.tileLoad.raise({ id: 'target-tile' });
    await flushAsyncWork();
    expect(settled, 'tile-ready must still wait for a subsequent completed frame').toBe(false);
    expect(harness.initialTilesLoaded.listenerCount).toBe(0);

    harness.postRender.raise();
    await expect(operation.ready).resolves.toMatchObject({
      status: 'ready',
      tier: 'photorealistic',
      meaningfulFrameReady: true,
    });
    expect(harness.adapter.transitionProbe().readiness.meaningfulFrameReadyAtMs).not.toBeNull();

    harness.adapter.dispose();
    harness.ticker.stop();
  });

  it('removes tile/post-render listeners and resolves cancelled on preview retarget', async () => {
    const harness = createHarness();
    const operation = harness.adapter.prewarmProject(PROJECT);
    await flushAsyncWork();
    expect(harness.initialTilesLoaded.listenerCount).toBe(1);

    operation.cancel();
    await expect(operation.ready).resolves.toMatchObject({ status: 'cancelled' });
    expect(harness.initialTilesLoaded.listenerCount).toBe(0);
    expect(harness.postRender.listenerCount).toBe(0);
    expect(harness.ticker.rendererCount).toBe(0);

    harness.adapter.dispose();
    harness.ticker.stop();
  });
});
