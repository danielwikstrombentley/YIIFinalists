import {
  NoColorSpace,
  NormalBlending,
  SRGBColorSpace,
  Texture,
  Vector3,
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
    expect(globe.atmosphere.geometry.parameters.radius).toBe(5.18);
    expect(globe.atmosphereMaterial.blending).toBe(NormalBlending);

    globe.dispose();
  });

  it('centralizes independent surface, cloud, and atmosphere tuning as shader uniforms', () => {
    const globe = new GlobeScene({
      visualTuning: {
        dayExposure: 0.76,
        nightSaturation: 1.3,
        cloudOpacity: 0.41,
        cloudDriftStrength: 0.044,
        cloudWarpStrength: 0.019,
        cloudEvolutionStrength: 0.1,
        atmosphereHaloThickness: 0.09,
        atmosphereHaloStrength: 0.7,
        atmosphereHaloSoftness: 2.1,
        atmosphereHaloColor: '#77ccff',
        atmosphereHaloBrightness: 1.6,
        atmosphereHaloSaturation: 1.3,
      },
    });

    expect(globe.earthUniforms.uDayExposure.value).toBe(0.76);
    expect(globe.earthUniforms.uNightSaturation.value).toBe(1.3);
    expect(globe.cloudUniforms.uCloudOpacity.value).toBe(0.41);
    expect(globe.cloudUniforms.uCloudDriftStrength.value).toBe(0.044);
    expect(globe.cloudUniforms.uCloudWarpStrength.value).toBe(0.019);
    expect(globe.cloudUniforms.uCloudEvolutionStrength.value).toBe(0.1);
    expect(globe.earthUniforms.uCloudDriftStrength).toBe(globe.cloudUniforms.uCloudDriftStrength);
    expect(globe.earthUniforms.uCloudWarpStrength).toBe(globe.cloudUniforms.uCloudWarpStrength);
    expect(globe.earthUniforms.uCloudEvolutionStrength).toBe(
      globe.cloudUniforms.uCloudEvolutionStrength,
    );
    expect(globe.atmosphere.geometry.parameters.radius).toBe(5.09);
    expect(globe.atmosphereUniforms.uAtmosphereRadius.value).toBe(5.09);
    expect(globe.atmosphereUniforms.uHaloStrength.value).toBe(0.7);
    expect(globe.atmosphereUniforms.uHaloSoftness.value).toBe(2.1);
    expect(globe.atmosphereUniforms.uHaloBrightness.value).toBe(1.6);
    expect(globe.atmosphereUniforms.uHaloSaturation.value).toBe(1.3);
    expect(globe.atmosphereUniforms.uRayleighColor.value.getHexString()).toBe('77ccff');

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
    expect(globe.earthUniforms.uCloudMap).toBe(globe.cloudUniforms.uCloudMap);
    expect(globe.earthUniforms.uHasCloudMap).toBe(globe.cloudUniforms.uHasCloudMap);
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

  it('renders through an adapter-owned renderer with deforming clouds and shared solar lighting', () => {
    const globe = new GlobeScene();
    const renderer = createRenderer();

    globe.setIdleParameters({ rotationY: 0.75, cloudPhase: 0.4, sunOrbit: 1.2 });
    const initialCloudTime = 0.4 * globe.visualTuning.cloudCycleSeconds;
    globe.advance(2.5);
    globe.render(renderer);

    expect(renderer.render).toHaveBeenCalledWith(globe.scene, globe.camera);
    expect(globe.globe.rotation.y).toBeCloseTo(0.75);
    expect(globe.cloudLayer.rotation.y).toBe(0);
    expect(globe.cloudUniforms.uCloudTime.value).toBeCloseTo(initialCloudTime + 2.5);
    expect(globe.earthUniforms.uCloudTime).toBe(globe.cloudUniforms.uCloudTime);
    expect(globe.earthUniforms.uSunDirection.value.length()).toBeCloseTo(1);
    expect(globe.cloudUniforms.uSunDirection).toBe(globe.earthUniforms.uSunDirection);
    expect(globe.atmosphereUniforms.uSunDirection).toBe(globe.earthUniforms.uSunDirection);

    globe.dispose();
  });

  it('front-lights a previewed hemisphere and restores the idle solar orbit afterwards', () => {
    const globe = new GlobeScene();
    const renderer = createRenderer();
    const previewDirection = new Vector3(-2, 1, 4).normalize();

    globe.setPreviewDaylightDirection(previewDirection);
    globe.render(renderer);

    expect(globe.previewDaylightActive).toBe(true);
    expect(globe.earthUniforms.uSunDirection.value.angleTo(previewDirection)).toBeLessThan(0.0001);
    expect(globe.cloudUniforms.uSunDirection).toBe(globe.earthUniforms.uSunDirection);
    expect(globe.atmosphereUniforms.uSunDirection).toBe(globe.earthUniforms.uSunDirection);

    globe.clearPreviewDaylight();
    globe.setIdleParameters({ sunOrbit: Math.PI / 2 });
    globe.render(renderer);

    const idleDirection = new Vector3(0, 0.22, 1).normalize();
    expect(globe.previewDaylightActive).toBe(false);
    expect(globe.earthUniforms.uSunDirection.value.angleTo(idleDirection)).toBeLessThan(0.0001);

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
