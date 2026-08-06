import {
  BackSide,
  Color,
  DataTexture,
  Group,
  Mesh,
  NoColorSpace,
  PerspectiveCamera,
  Quaternion,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Texture,
  TextureLoader,
  Vector3,
  type WebGLRenderer,
} from 'three';
import {
  gsapRetargetMotionDriver,
  type CancellableMotion,
  type RetargetMotionDriver,
} from '../../orchestration/gsap-motion.js';
import { MOTION_DURATIONS_MS, MOTION_EASINGS } from '../../orchestration/motion-tokens.js';
import {
  DEFAULT_GLOBE_IDLE_PARAMETERS,
  GlobeIdleLoop,
  type GlobeIdleParameters,
} from './idle-loop.js';
import atmosphereShaderSource from './shaders/atmosphere.glsl?raw';
import cloudsShaderSource from './shaders/clouds.glsl?raw';
import earthShaderSource from './shaders/earth.glsl?raw';
import {
  getGlobeTextureProfile,
  type GlobeTextureProfile,
  type GlobeTextureProfileId,
} from './textures.js';

interface ShaderPair {
  vertex: string;
  fragment: string;
}

function splitShaderSource(source: string): ShaderPair {
  const [vertexSource, fragmentSource] = source.split('/* fragment */');
  if (!vertexSource || !fragmentSource) {
    throw new Error('Globe shader source must contain vertex and fragment sections.');
  }
  return {
    vertex: vertexSource.replace('/* vertex */', '').trim(),
    fragment: fragmentSource.trim(),
  };
}

const EARTH_SHADER = splitShaderSource(earthShaderSource);
const CLOUD_SHADER = splitShaderSource(cloudsShaderSource);
const ATMOSPHERE_SHADER = splitShaderSource(atmosphereShaderSource);

const EARTH_RADIUS = 5;
const CLOUD_RADIUS = 5.025;
const IDENTITY_QUATERNION = new Quaternion();
const SETTLED_ANGLE_RADIANS = 0.0001;
// A visually imperceptible residual after a long/throttled tab frame should snap exactly to the
// preview hemisphere rather than asymptotically lingering just outside the shader-test tolerance.
const PREVIEW_DAYLIGHT_SETTLE_ANGLE_RADIANS = 0.0015;

export interface GlobeVisualTuning {
  /** Seconds per full Earth revolution; lower values rotate faster. */
  globeRotationCycleSeconds: number;
  /** Seconds per full day/night lighting revolution. */
  sunOrbitCycleSeconds: number;
  /** Approximate time for preview daylight to reach 95% of its new target. */
  previewDaylightTransitionSeconds: number;
  dayExposure: number;
  daySaturation: number;
  dayContrast: number;
  nightIntensity: number;
  nightSaturation: number;
  cloudOpacity: number;
  cloudShadowStrength: number;
  cloudCycleSeconds: number;
  cloudDriftStrength: number;
  cloudWarpStrength: number;
  cloudEvolutionStrength: number;
  /** Halo width in globe scene units; Earth radius is 5. */
  atmosphereHaloThickness: number;
  /** Single brightness/opacity multiplier for quick visual iteration. */
  atmosphereHaloStrength: number;
  /** Exponent controlling outer-edge diffusion; larger values produce a softer fade. */
  atmosphereHaloSoftness: number;
  /** Dominant daylight scattering hue. */
  atmosphereHaloColor: string;
  /** RGB radiance multiplier; does not alter halo opacity. */
  atmosphereHaloBrightness: number;
  /** Chroma restored after tone mapping; values above 1 counter highlight washout. */
  atmosphereHaloSaturation: number;
}

/** Centralized first-pass values for iterative LED-wall visual review. */
export const DEFAULT_GLOBE_VISUAL_TUNING: Readonly<GlobeVisualTuning> = {
  globeRotationCycleSeconds: 120,
  sunOrbitCycleSeconds: 180,
  previewDaylightTransitionSeconds: 4.2,
  dayExposure: 0.74,
  daySaturation: 0.76,
  dayContrast: 0.92,
  nightIntensity: 1.62,
  nightSaturation: 1.2,
  cloudOpacity: 0.54,
  cloudShadowStrength: 0.18,
  cloudCycleSeconds: 64,
  cloudDriftStrength: 0.05,
  cloudWarpStrength: 0.023,
  cloudEvolutionStrength: 0.12,
  atmosphereHaloThickness: 0.18,
  atmosphereHaloStrength: 1.35,
  atmosphereHaloSoftness: 4.75,
  atmosphereHaloColor: '#00a2ff',
  atmosphereHaloBrightness: 1.45,
  atmosphereHaloSaturation: 1.45,
};

export interface GlobeSceneOptions {
  textureProfileId?: GlobeTextureProfileId;
  idleParameters?: Partial<GlobeIdleParameters>;
  visualTuning?: Partial<GlobeVisualTuning>;
  /** Injectable for deterministic preview/idle visual-motion tests. */
  motionDriver?: RetargetMotionDriver;
  /** Injectable for deterministic tests; omitted in non-WebGL environments uses procedural fallback. */
  textureLoader?: TextureLoader | null;
}

type GlobeResource = SphereGeometry | ShaderMaterial | Texture;

function solidTexture(
  color: readonly [number, number, number, number],
  colorSpace: typeof SRGBColorSpace | typeof NoColorSpace,
): DataTexture {
  const texture = new DataTexture(new Uint8Array(color), 1, 1, RGBAFormat);
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

function defaultTextureLoader(): TextureLoader | null {
  // Unit tests and degraded WebGL environments retain the procedural shader fallback rather than
  // attempting browser-image requests. A real playback browser receives the local texture loader.
  if (
    typeof document === 'undefined' ||
    typeof window === 'undefined' ||
    typeof WebGLRenderingContext === 'undefined'
  ) {
    return null;
  }
  return new TextureLoader();
}

function positiveFraction(value: number): number {
  return ((value % 1) + 1) % 1;
}

function nearestEquivalentAngle(current: number, target: number): number {
  const fullTurn = Math.PI * 2;
  const delta = ((((target - current + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI;
  return current + delta;
}

/**
 * Three.js scene graph for idle/category/preview presentation (research R3).
 *
 * It owns only scene-graph objects and GSAP idle parameters. The later adapter owns the canvas,
 * WebGLRenderer, lifecycle wiring, and registration with the app-owned `Ticker`; this class never
 * starts a second render loop or calls `requestAnimationFrame`.
 */
export class GlobeScene {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly globe: Group;
  readonly earth: Mesh<SphereGeometry, ShaderMaterial>;
  readonly cloudLayer: Mesh<SphereGeometry, ShaderMaterial>;
  readonly atmosphere: Mesh<SphereGeometry, ShaderMaterial>;
  readonly earthMaterial: ShaderMaterial;
  readonly cloudMaterial: ShaderMaterial;
  readonly atmosphereMaterial: ShaderMaterial;
  readonly earthUniforms: {
    uSunDirection: { value: Vector3 };
    uDayMap: { value: Texture };
    uNightMap: { value: Texture };
    uNormalMap: { value: Texture };
    uCloudMap: { value: Texture };
    uHasDayMap: { value: number };
    uHasNightMap: { value: number };
    uHasNormalMap: { value: number };
    uHasCloudMap: { value: number };
    uCloudTime: { value: number };
    uCloudCycleSeconds: { value: number };
    uCloudDriftStrength: { value: number };
    uCloudWarpStrength: { value: number };
    uCloudEvolutionStrength: { value: number };
    uCloudShadowStrength: { value: number };
    uDayExposure: { value: number };
    uDaySaturation: { value: number };
    uDayContrast: { value: number };
    uNightIntensity: { value: number };
    uNightSaturation: { value: number };
  };
  readonly cloudUniforms: {
    uSunDirection: { value: Vector3 };
    uCloudMap: { value: Texture };
    uHasCloudMap: { value: number };
    uCloudTime: { value: number };
    uCloudCycleSeconds: { value: number };
    uCloudDriftStrength: { value: number };
    uCloudWarpStrength: { value: number };
    uCloudEvolutionStrength: { value: number };
    uCloudOpacity: { value: number };
  };
  readonly atmosphereUniforms: {
    uSunDirection: { value: Vector3 };
    uRayleighColor: { value: Color };
    uSunsetColor: { value: Color };
    uPlanetRadius: { value: number };
    uAtmosphereRadius: { value: number };
    uHaloStrength: { value: number };
    uHaloSoftness: { value: number };
    uHaloBrightness: { value: number };
    uHaloSaturation: { value: number };
  };
  readonly textureProfile: GlobeTextureProfile;
  readonly visualTuning: GlobeVisualTuning;

  private readonly idleParameters: GlobeIdleParameters;
  private readonly idleLoop: GlobeIdleLoop;
  private readonly motionDriver: RetargetMotionDriver;
  private readonly ownedResources: GlobeResource[] = [];
  private readonly previewSunDirection = new Vector3();
  private readonly previewSunRotation = new Quaternion();
  private cloudTimeSeconds: number;
  private idleReturnMotion: CancellableMotion | null = null;
  private idleReturnGeneration = 0;
  private previewDaylight = false;
  private disposed = false;

  constructor(options: GlobeSceneOptions = {}) {
    this.textureProfile = getGlobeTextureProfile(options.textureProfileId);
    this.idleParameters = { ...DEFAULT_GLOBE_IDLE_PARAMETERS, ...options.idleParameters };
    this.visualTuning = { ...DEFAULT_GLOBE_VISUAL_TUNING, ...options.visualTuning };
    this.motionDriver = options.motionDriver ?? gsapRetargetMotionDriver;
    this.cloudTimeSeconds =
      positiveFraction(this.idleParameters.cloudPhase) * this.visualTuning.cloudCycleSeconds;
    this.idleLoop = new GlobeIdleLoop(this.idleParameters, {
      rotationCycleSeconds: this.visualTuning.globeRotationCycleSeconds,
      sunOrbitCycleSeconds: this.visualTuning.sunOrbitCycleSeconds,
    });

    this.scene = new Scene();
    this.scene.background = new Color('#020714');
    this.camera = new PerspectiveCamera(42, 16 / 9, 0.1, 100);
    this.camera.position.set(0, 0.2, 15);

    this.globe = new Group();
    this.globe.name = 'globe-root';
    this.scene.add(this.globe);

    const dayFallback = solidTexture([4, 30, 65, 255], SRGBColorSpace);
    const nightFallback = solidTexture([1, 3, 12, 255], SRGBColorSpace);
    const cloudFallback = solidTexture([0, 0, 0, 255], NoColorSpace);
    const normalFallback = solidTexture([128, 128, 255, 255], NoColorSpace);
    this.ownedResources.push(dayFallback, nightFallback, cloudFallback, normalFallback);

    const sunDirectionUniform = {
      value: new Vector3(0.7, 0.25, 0.8).normalize(),
    };
    const cloudMapUniform = { value: cloudFallback as Texture };
    const hasCloudMapUniform = { value: 0 };
    const cloudTimeUniform = { value: this.cloudTimeSeconds };
    const cloudCycleUniform = { value: this.visualTuning.cloudCycleSeconds };
    const cloudDriftUniform = { value: this.visualTuning.cloudDriftStrength };
    const cloudWarpUniform = { value: this.visualTuning.cloudWarpStrength };
    const cloudEvolutionUniform = { value: this.visualTuning.cloudEvolutionStrength };

    this.earthUniforms = {
      uSunDirection: sunDirectionUniform,
      uDayMap: { value: dayFallback },
      uNightMap: { value: nightFallback },
      uNormalMap: { value: normalFallback },
      uCloudMap: cloudMapUniform,
      uHasDayMap: { value: 0 },
      uHasNightMap: { value: 0 },
      uHasNormalMap: { value: 0 },
      uHasCloudMap: hasCloudMapUniform,
      uCloudTime: cloudTimeUniform,
      uCloudCycleSeconds: cloudCycleUniform,
      uCloudDriftStrength: cloudDriftUniform,
      uCloudWarpStrength: cloudWarpUniform,
      uCloudEvolutionStrength: cloudEvolutionUniform,
      uCloudShadowStrength: { value: this.visualTuning.cloudShadowStrength },
      uDayExposure: { value: this.visualTuning.dayExposure },
      uDaySaturation: { value: this.visualTuning.daySaturation },
      uDayContrast: { value: this.visualTuning.dayContrast },
      uNightIntensity: { value: this.visualTuning.nightIntensity },
      uNightSaturation: { value: this.visualTuning.nightSaturation },
    };
    this.earthMaterial = new ShaderMaterial({
      uniforms: this.earthUniforms,
      vertexShader: EARTH_SHADER.vertex,
      fragmentShader: EARTH_SHADER.fragment,
    });
    const earthGeometry = new SphereGeometry(EARTH_RADIUS, 96, 64);
    this.earth = new Mesh(earthGeometry, this.earthMaterial);
    this.earth.name = 'earth';
    this.globe.add(this.earth);

    this.cloudUniforms = {
      uSunDirection: sunDirectionUniform,
      uCloudMap: cloudMapUniform,
      uHasCloudMap: hasCloudMapUniform,
      uCloudTime: cloudTimeUniform,
      uCloudCycleSeconds: cloudCycleUniform,
      uCloudDriftStrength: cloudDriftUniform,
      uCloudWarpStrength: cloudWarpUniform,
      uCloudEvolutionStrength: cloudEvolutionUniform,
      uCloudOpacity: { value: this.visualTuning.cloudOpacity },
    };
    this.cloudMaterial = new ShaderMaterial({
      uniforms: this.cloudUniforms,
      vertexShader: CLOUD_SHADER.vertex,
      fragmentShader: CLOUD_SHADER.fragment,
      transparent: true,
      depthWrite: false,
    });
    const cloudGeometry = new SphereGeometry(CLOUD_RADIUS, 96, 64);
    this.cloudLayer = new Mesh(cloudGeometry, this.cloudMaterial);
    this.cloudLayer.name = 'cloud-layer';
    this.globe.add(this.cloudLayer);

    const atmosphereRadius =
      EARTH_RADIUS + Math.max(0.001, this.visualTuning.atmosphereHaloThickness);
    this.atmosphereUniforms = {
      uSunDirection: sunDirectionUniform,
      uRayleighColor: { value: new Color(this.visualTuning.atmosphereHaloColor) },
      uSunsetColor: { value: new Color('#e47b58') },
      uPlanetRadius: { value: EARTH_RADIUS },
      uAtmosphereRadius: { value: atmosphereRadius },
      uHaloStrength: { value: this.visualTuning.atmosphereHaloStrength },
      uHaloSoftness: { value: this.visualTuning.atmosphereHaloSoftness },
      uHaloBrightness: { value: this.visualTuning.atmosphereHaloBrightness },
      uHaloSaturation: { value: this.visualTuning.atmosphereHaloSaturation },
    };
    this.atmosphereMaterial = new ShaderMaterial({
      uniforms: this.atmosphereUniforms,
      vertexShader: ATMOSPHERE_SHADER.vertex,
      fragmentShader: ATMOSPHERE_SHADER.fragment,
      transparent: true,
      depthWrite: false,
      side: BackSide,
    });
    const atmosphereGeometry = new SphereGeometry(atmosphereRadius, 96, 64);
    this.atmosphere = new Mesh(atmosphereGeometry, this.atmosphereMaterial);
    this.atmosphere.name = 'atmosphere';
    this.globe.add(this.atmosphere);

    this.ownedResources.push(
      earthGeometry,
      this.earthMaterial,
      cloudGeometry,
      this.cloudMaterial,
      atmosphereGeometry,
      this.atmosphereMaterial,
    );
    const textureLoader =
      options.textureLoader === undefined ? defaultTextureLoader() : options.textureLoader;
    if (textureLoader) this.loadTextureProfile(textureLoader);
    this.syncVisualState();
  }

  /** Updates GSAP-owned parameters without issuing render calls or creating a second ticker. */
  setIdleParameters(parameters: Partial<GlobeIdleParameters>): void {
    if (this.disposed) return;
    Object.assign(this.idleParameters, parameters);
    if (parameters.cloudPhase !== undefined && Number.isFinite(parameters.cloudPhase)) {
      this.cloudTimeSeconds =
        positiveFraction(parameters.cloudPhase) * this.visualTuning.cloudCycleSeconds;
    }
    this.syncVisualState();
  }

  /**
   * Locks daylight to the camera-facing preview hemisphere. The adapter refreshes this direction
   * from the moving camera during a finalist retarget, so the location being presented stays in
   * day mode without creating another motion or render loop.
   */
  setPreviewDaylightDirection(direction: Vector3): void {
    if (this.disposed || direction.lengthSq() === 0) return;
    if (!this.previewDaylight) {
      // Capture the current idle solar state before beginning the blend, rather than snapping the
      // target finalist directly from night to day.
      this.syncVisualState();
      this.previewDaylight = true;
    }
    this.previewSunDirection.copy(direction).normalize();
  }

  /** Restores the automatic solar path from the currently blended daylight direction. */
  clearPreviewDaylight(): void {
    if (this.disposed || !this.previewDaylight) return;
    const sunDirection = this.earthUniforms.uSunDirection.value;
    this.idleParameters.sunOrbit = Math.atan2(sunDirection.z, sunDirection.x);
    this.previewDaylight = false;
  }

  /** Advances shader time from the adapter's one shared ticker; this creates no timer of its own. */
  advance(deltaSeconds: number): void {
    if (this.disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    this.cloudTimeSeconds += deltaSeconds;
    this.cloudUniforms.uCloudTime.value = this.cloudTimeSeconds;
    this.advancePreviewDaylight(deltaSeconds);
  }

  /**
   * Returns the Earth to its original idle orientation and solar phase, then starts the continuous
   * idle loop. Its cancellable handle is owned by the adapter's idle state lifecycle.
   */
  enterIdle(): CancellableMotion {
    if (this.disposed) return { cancel: () => {} };

    this.stopIdleLoop();
    this.cancelIdleReturn();
    this.clearPreviewDaylight();

    const destination = {
      rotationY: nearestEquivalentAngle(
        this.idleParameters.rotationY,
        DEFAULT_GLOBE_IDLE_PARAMETERS.rotationY,
      ),
      sunOrbit: nearestEquivalentAngle(
        this.idleParameters.sunOrbit,
        DEFAULT_GLOBE_IDLE_PARAMETERS.sunOrbit,
      ),
    };
    const alreadyAligned =
      Math.abs(destination.rotationY - this.idleParameters.rotationY) < SETTLED_ANGLE_RADIANS &&
      Math.abs(destination.sunOrbit - this.idleParameters.sunOrbit) < SETTLED_ANGLE_RADIANS;

    if (alreadyAligned) {
      Object.assign(this.idleParameters, destination);
      this.syncVisualState();
      this.startIdleLoop();
      return { cancel: () => this.stopIdleLoop() };
    }

    const generation = ++this.idleReturnGeneration;
    let settled = false;
    const motion = this.motionDriver.retarget(this.idleParameters, destination, {
      durationMs: MOTION_DURATIONS_MS.idleReturn,
      ease: MOTION_EASINGS.gentle,
      onUpdate: () => this.syncVisualState(),
      onComplete: () => {
        if (this.disposed || generation !== this.idleReturnGeneration) return;
        settled = true;
        this.syncVisualState();
        this.idleReturnMotion = null;
        this.startIdleLoop();
      },
    });

    if (!settled && generation === this.idleReturnGeneration) {
      this.idleReturnMotion = motion;
    }

    let cancelled = false;
    return {
      cancel: () => {
        if (cancelled) return;
        cancelled = true;
        if (generation !== this.idleReturnGeneration) return;
        motion.cancel();
        this.idleReturnMotion = null;
        this.idleReturnGeneration += 1;
        this.stopIdleLoop();
      },
    };
  }

  /** Starts only the GSAP parameter timeline; the adapter-owned ticker performs rendering. */
  startIdleLoop(): void {
    if (this.disposed) return;
    this.idleLoop.start();
  }

  stopIdleLoop(): void {
    this.idleLoop.stop();
  }

  /** Called by `GlobeRendererAdapter` from the shared application ticker. */
  render(renderer: Pick<WebGLRenderer, 'render'>): void {
    if (this.disposed) return;
    this.syncVisualState();
    renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    if (this.disposed || width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Scene-graph cleanup is idempotent; the adapter can safely call it on every teardown path. */
  dispose(): void {
    if (this.disposed) return;
    this.cancelIdleReturn();
    this.stopIdleLoop();
    for (const resource of this.ownedResources) resource.dispose();
    this.ownedResources.length = 0;
    this.globe.clear();
    this.scene.remove(this.globe);
    this.disposed = true;
  }

  get ownsRenderLoop(): false {
    return false;
  }

  get idleLoopRunning(): boolean {
    return this.idleLoop.running;
  }

  get previewDaylightActive(): boolean {
    return this.previewDaylight;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  get ownedResourceCount(): number {
    return this.ownedResources.length;
  }

  private syncVisualState(): void {
    this.globe.rotation.y = this.idleParameters.rotationY;
    this.cloudLayer.rotation.y = 0;
    this.cloudUniforms.uCloudTime.value = this.cloudTimeSeconds;

    const sunDirection = this.earthUniforms.uSunDirection.value;
    if (this.previewDaylight) return;
    sunDirection
      .set(Math.cos(this.idleParameters.sunOrbit), 0.22, Math.sin(this.idleParameters.sunOrbit))
      .normalize();
  }

  private advancePreviewDaylight(deltaSeconds: number): void {
    if (!this.previewDaylight) return;

    const sunDirection = this.earthUniforms.uSunDirection.value;
    const angle = sunDirection.angleTo(this.previewSunDirection);
    if (angle < PREVIEW_DAYLIGHT_SETTLE_ANGLE_RADIANS) {
      sunDirection.copy(this.previewSunDirection);
      return;
    }

    const durationSeconds = Math.max(this.visualTuning.previewDaylightTransitionSeconds, 0.001);
    const progress = 1 - Math.exp((-3 * deltaSeconds) / durationSeconds);
    this.previewSunRotation.setFromUnitVectors(sunDirection, this.previewSunDirection);
    this.previewSunRotation.slerp(IDENTITY_QUATERNION, 1 - progress);
    sunDirection.applyQuaternion(this.previewSunRotation).normalize();
    if (sunDirection.angleTo(this.previewSunDirection) < PREVIEW_DAYLIGHT_SETTLE_ANGLE_RADIANS) {
      sunDirection.copy(this.previewSunDirection);
    }
  }

  private cancelIdleReturn(): void {
    this.idleReturnMotion?.cancel();
    this.idleReturnMotion = null;
    this.idleReturnGeneration += 1;
  }

  private loadTextureProfile(textureLoader: TextureLoader): void {
    for (const asset of this.textureProfile.assets) {
      try {
        const texture = textureLoader.load(
          asset.path,
          (loadedTexture) => this.useTexture(asset.id, loadedTexture),
          undefined,
          () => {
            // The procedural maps remain active for a missing or failed local asset. The public
            // experience therefore stays visually complete while a later diagnostics task records
            // the failure for operators.
          },
        );
        this.ownedResources.push(texture);
      } catch {
        // TextureLoader can throw synchronously in a degraded browser; retain procedural fallback.
      }
    }
  }

  private useTexture(assetId: GlobeTextureProfile['assets'][number]['id'], texture: Texture): void {
    if (this.disposed) {
      texture.dispose();
      return;
    }

    texture.wrapS = RepeatWrapping;
    texture.colorSpace = assetId === 'day' || assetId === 'night' ? SRGBColorSpace : NoColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;

    switch (assetId) {
      case 'day':
        this.earthUniforms.uDayMap.value = texture;
        this.earthUniforms.uHasDayMap.value = 1;
        break;
      case 'night':
        this.earthUniforms.uNightMap.value = texture;
        this.earthUniforms.uHasNightMap.value = 1;
        break;
      case 'clouds':
        this.cloudUniforms.uCloudMap.value = texture;
        this.cloudUniforms.uHasCloudMap.value = 1;
        break;
      case 'normal':
        this.earthUniforms.uNormalMap.value = texture;
        this.earthUniforms.uHasNormalMap.value = 1;
        break;
    }
  }
}
