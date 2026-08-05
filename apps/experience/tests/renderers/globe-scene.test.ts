import type { WebGLRenderer } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { GlobeScene } from '../../src/renderers/globe/GlobeScene.js';
import { GLOBE_TEXTURE_BUDGET_BYTES } from '../../src/renderers/globe/textures.js';

// T023: the scene itself owns scene-graph resources; the later GlobeRendererAdapter (T026) owns
// its WebGLRenderer and the shared ticker registration. This keeps construction unit-testable in
// jsdom and prohibits a second render loop by construction.
function createRenderer() {
  return { render: vi.fn() } as unknown as WebGLRenderer;
}

describe('GlobeScene', () => {
  it('builds the earth, animated cloud, and atmospheric layers within the GPU texture budget', () => {
    const globe = new GlobeScene();

    expect(globe.scene.getObjectByName('earth')).toBeDefined();
    expect(globe.scene.getObjectByName('cloud-layer')).toBeDefined();
    expect(globe.scene.getObjectByName('atmosphere')).toBeDefined();
    expect(globe.textureProfile.estimatedGpuBytes).toBeLessThanOrEqual(GLOBE_TEXTURE_BUDGET_BYTES);
    expect(globe.textureProfile.fallback).toEqual({ id: 'mip-capped' });

    globe.dispose();
  });

  it('renders through an adapter-owned renderer and applies the GSAP-driven idle parameters', () => {
    const globe = new GlobeScene();
    const renderer = createRenderer();

    globe.setIdleParameters({ rotationY: 0.75, cloudPhase: 0.4, sunOrbit: 1.2 });
    globe.render(renderer);

    expect(renderer.render).toHaveBeenCalledWith(globe.scene, globe.camera);
    expect(globe.globe.rotation.y).toBeCloseTo(0.75);
    expect(globe.cloudUniforms.uCloudPhase.value).toBeCloseTo(0.4);
    expect(globe.earthUniforms.uSunDirection.value.length()).toBeCloseTo(1);

    globe.dispose();
  });

  it('starts no render loop of its own and releases all owned scene resources on repeated dispose', () => {
    const globe = new GlobeScene();

    expect(globe.ownsRenderLoop).toBe(false);
    globe.startIdleLoop();
    expect(globe.idleLoopRunning).toBe(true);

    globe.dispose();
    expect(globe.idleLoopRunning).toBe(false);
    expect(globe.isDisposed).toBe(true);
    expect(globe.ownedResourceCount).toBe(0);
    expect(() => globe.dispose()).not.toThrow();
  });
});
