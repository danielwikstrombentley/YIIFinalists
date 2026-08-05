import gsap from 'gsap';
import type { WebGLRenderer } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  GlobeRendererAdapter,
  type GlobeRendererAdapterProject,
} from '../../src/renderers/globe/GlobeRendererAdapter.js';
import { Ticker } from '../../src/orchestration/ticker.js';

const PROJECTS: readonly GlobeRendererAdapterProject[] = [
  { id: 'cat-a-1', categoryId: 'cat-a', marker: { lat: 20, lon: -30 } },
  { id: 'cat-a-2', categoryId: 'cat-a', marker: { lat: 25, lon: -24 } },
  { id: 'cat-a-3', categoryId: 'cat-a', marker: { lat: 18, lon: -18 } },
  { id: 'cat-b-1', categoryId: 'cat-b', marker: { lat: -20, lon: 35 } },
  { id: 'cat-b-2', categoryId: 'cat-b', marker: { lat: -25, lon: 42 } },
  { id: 'cat-b-3', categoryId: 'cat-b', marker: { lat: -18, lon: 48 } },
];

function createRenderer() {
  return {
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  } as unknown as WebGLRenderer & {
    setPixelRatio: ReturnType<typeof vi.fn>;
    setSize: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };
}

describe('GlobeRendererAdapter', () => {
  it('owns one ticker registration while active and renders scene + marker updates through it', () => {
    const ticker = new Ticker();
    const renderer = createRenderer();
    const adapter = new GlobeRendererAdapter({
      projects: PROJECTS,
      ticker,
      rendererFactory: () => renderer,
    });
    const stage = document.createElement('div');

    adapter.start(stage);
    adapter.start(stage);
    expect(ticker.rendererCount).toBe(1);
    expect(stage.querySelector('canvas')).toBe(adapter.canvas);

    adapter.setCategoryFilter('cat-a');
    adapter.previewProject(PROJECTS[1]!);
    gsap.ticker.tick();

    expect(renderer.render).toHaveBeenCalledWith(adapter.scene.scene, adapter.scene.camera);
    expect(adapter.visibleProjectIds).toEqual(['cat-a-1', 'cat-a-2', 'cat-a-3']);
    expect(adapter.emphasizedProjectId).toBe('cat-a-2');

    adapter.stop();
    expect(ticker.rendererCount).toBe(0);
    ticker.stop();
  });

  it('releases its DOM, GPU, scene, marker, rig, and ticker resources idempotently', () => {
    const ticker = new Ticker();
    const renderer = createRenderer();
    const adapter = new GlobeRendererAdapter({
      projects: PROJECTS,
      ticker,
      rendererFactory: () => renderer,
    });
    const stage = document.createElement('div');

    adapter.start(stage);
    adapter.enterIdle();
    expect(adapter.idleLoopRunning).toBe(true);

    adapter.dispose();
    adapter.dispose();

    expect(adapter.isDisposed).toBe(true);
    expect(stage.querySelector('canvas')).toBeNull();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(ticker.rendererCount).toBe(0);
    expect(adapter.scene.isDisposed).toBe(true);
    expect(adapter.markers.isDisposed).toBe(true);
    ticker.stop();
  });

  it('returns idempotent cancellable handles for state-scoped preview work', () => {
    const ticker = new Ticker();
    const adapter = new GlobeRendererAdapter({
      projects: PROJECTS,
      ticker,
      rendererFactory: () => createRenderer(),
    });

    const handle = adapter.previewProject(PROJECTS[0]!);
    handle.cancel();
    handle.cancel();

    expect(adapter.emphasizedProjectId).toBeNull();
    adapter.dispose();
    ticker.stop();
  });
});
