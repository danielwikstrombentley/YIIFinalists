import {
  NoColorSpace,
  SRGBColorSpace,
  Texture,
  type TextureLoader,
  type WebGLRenderer,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { GlobeScene } from '../../src/renderers/globe/GlobeScene.js';
import { GLOBE_TEXTURE_BUDGET_BYTES } from '../../src/renderers/globe/textures.js';

// T023: the scene itself owns scene-graph resources; the later GlobeRendererAdapter (T026) owns
// its WebGLRenderer and the shared ticker registration. This keeps construction unit-testable in
// jsdom and prohibits a second render loop by construction.
function createRenderer() {
  return { render: vi.fn() } as unknown as WebGLRenderer;
}

function createTextureLoader() {
  const textures: Texture[] = [];
  const load = vi.fn((_: string, onLoad?: (texture: Texture) => void) => {
    const texture = new Texture();
    vi.spyOn(texture, 'dispose');
    textures.push(texture);
    onLoad?.(texture);
    return texture;
  });
  const loader = { load } as unknown as TextureLoader;
  return { loader, load, textures };
}

describe('GlobeScene', () => {
  it('builds the earth, animated cloud, and atmospheric layers within the GPU texture budget', () => {
    const globe = new GlobeScene();

    expect(globe.scene.getObjectByName('earth')).toBeDefined();
    expect(globe.scene.getObjectByName('cloud-layer')).toBeDefined();
    expect(globe.scene.getObjectByName('atmosphere')).toBeDefined();
    expect(globe.textureProfile.estimatedGpuBytes).toBeLessThanOrEqual(GLOBE_TEXTURE_BUDGET_BYTES);
    expect(globe.textureProfile.fallback).toBeNull();

    globe.dispose();
  });

  it('loads the supplied local 2K maps with colour-space roles and disposes them with the scene', () => {
    const { loader, load, textures } = createTextureLoader();
    const globe = new GlobeScene({ textureLoader: loader });

    expect(globe.textureProfile.id).toBe('mip-capped');
    expect(load).toHaveBeenCalledTimes(4);
    expect(load.mock.calls.map(([path]) => path)).toEqual([
      '/textures/2k_earth_daymap.jpg',
      '/textures/2k_earth_nightmap.jpg',
      '/textures/2k_earth_clouds.jpg',
      '/textures/2k_earth_normal_map.png',
    ]);
    expect(globe.earthUniforms.uHasDayMap.value).toBe(1);
    expect(globe.earthUniforms.uHasNightMap.value).toBe(1);
    expect(globe.earthUniforms.uHasNormalMap.value).toBe(1);
    expect(globe.cloudUniforms.uHasCloudMap.value).toBe(1);
    expect(textures[0]?.colorSpace).toBe(SRGBColorSpace);
    expect(textures[1]?.colorSpace).toBe(SRGBColorSpace);
    expect(textures[2]?.colorSpace).toBe(NoColorSpace);
    expect(textures[3]?.colorSpace).toBe(NoColorSpace);

    globe.dispose();
    for (const texture of textures) {
      expect(texture.dispose).toHaveBeenCalledOnce();
    }
  });

  it('retains procedural shader fallbacks when a local texture cannot load', () => {
    const loader = {
      load: vi.fn((...args: Parameters<TextureLoader['load']>) => {
        args[3]?.(new Error('missing local asset'));
        return new Texture();
      }),
    } as unknown as TextureLoader;
    const globe = new GlobeScene({ textureLoader: loader });

    expect(globe.earthUniforms.uHasDayMap.value).toBe(0);
    expect(globe.earthUniforms.uHasNightMap.value).toBe(0);
    expect(globe.earthUniforms.uHasNormalMap.value).toBe(0);
    expect(globe.cloudUniforms.uHasCloudMap.value).toBe(0);

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
