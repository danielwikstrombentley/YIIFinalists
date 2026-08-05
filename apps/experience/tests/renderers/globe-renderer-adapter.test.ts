import gsap from 'gsap';
import { AgXToneMapping, SRGBColorSpace, type WebGLRenderer } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  GlobeRendererAdapter,
  type GlobeRendererAdapterProject,
} from '../../src/renderers/globe/GlobeRendererAdapter.js';
import {
  DEFAULT_IDLE_ORBIT_PARAMETERS,
  GlobeCameraRig,
} from '../../src/renderers/globe/camera-rig.js';
import { GlobeScene } from '../../src/renderers/globe/GlobeScene.js';
import type {
  RetargetMotionDriver,
  RetargetMotionOptions,
} from '../../src/orchestration/gsap-motion.js';
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

const immediateMotionDriver: RetargetMotionDriver = {
  retarget<T extends object>(target: T, destination: Partial<T>, options: RetargetMotionOptions) {
    Object.assign(target, destination);
    options.onUpdate();
    options.onComplete();
    return { cancel: () => {} };
  },
};

describe('GlobeRendererAdapter', () => {
  it('uses an explicit display color space and cinematic tone mapping', () => {
    const ticker = new Ticker();
    const renderer = createRenderer();
    const adapter = new GlobeRendererAdapter({
      projects: PROJECTS,
      ticker,
      rendererFactory: () => renderer,
    });

    expect(renderer.outputColorSpace).toBe(SRGBColorSpace);
    expect(renderer.toneMapping).toBe(AgXToneMapping);
    expect(renderer.toneMappingExposure).toBe(1);

    adapter.dispose();
    ticker.stop();
  });

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
    expect(adapter.scene.previewDaylightActive).toBe(false);
    adapter.dispose();
    ticker.stop();
  });

  it('keeps the camera-facing finalist hemisphere in daylight during preview', () => {
    const ticker = new Ticker();
    const adapter = new GlobeRendererAdapter({
      projects: PROJECTS,
      ticker,
      rendererFactory: () => createRenderer(),
    });
    const stage = document.createElement('div');

    adapter.start(stage);
    adapter.previewProject(PROJECTS[1]!);
    gsap.ticker.tick();
    adapter.scene.advance(10);

    const cameraDirection = adapter.cameraRig.camera.position.clone().normalize();
    expect(adapter.scene.previewDaylightActive).toBe(true);
    expect(adapter.scene.earthUniforms.uSunDirection.value.angleTo(cameraDirection)).toBeLessThan(
      0.0001,
    );

    adapter.enterIdle();
    expect(adapter.scene.previewDaylightActive).toBe(false);

    adapter.dispose();
    ticker.stop();
  });

  it('restores the original globe and camera axes after leaving a preview', () => {
    const ticker = new Ticker();
    const scene = new GlobeScene({ motionDriver: immediateMotionDriver });
    const cameraRig = new GlobeCameraRig({
      camera: scene.camera,
      motionDriver: immediateMotionDriver,
    });
    const adapter = new GlobeRendererAdapter({
      projects: PROJECTS,
      ticker,
      scene,
      cameraRig,
      rendererFactory: () => createRenderer(),
    });

    scene.setIdleParameters({ rotationY: 1.2, sunOrbit: 1.1 });
    adapter.previewProject(PROJECTS[1]!);
    adapter.enterIdle();

    expect(scene.globe.rotation.y).toBeCloseTo(0);
    expect(cameraRig.orbit).toEqual(DEFAULT_IDLE_ORBIT_PARAMETERS);
    expect(scene.idleLoopRunning).toBe(true);

    adapter.dispose();
    ticker.stop();
  });
});
