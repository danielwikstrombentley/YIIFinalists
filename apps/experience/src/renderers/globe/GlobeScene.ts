import {
  AdditiveBlending,
  BackSide,
  Color,
  Group,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type WebGLRenderer,
} from 'three';
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

export interface GlobeSceneOptions {
  textureProfileId?: GlobeTextureProfileId;
  idleParameters?: Partial<GlobeIdleParameters>;
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
    uCloudShadow: { value: number };
  };
  readonly cloudUniforms: { uCloudPhase: { value: number } };
  readonly atmosphereUniforms: {
    uGlowColor: { value: Color };
    uGlowStrength: { value: number };
  };
  readonly textureProfile: GlobeTextureProfile;

  private readonly idleParameters: GlobeIdleParameters;
  private readonly idleLoop: GlobeIdleLoop;
  private readonly ownedResources: Array<SphereGeometry | ShaderMaterial> = [];
  private disposed = false;

  constructor(options: GlobeSceneOptions = {}) {
    this.textureProfile = getGlobeTextureProfile(options.textureProfileId);
    this.idleParameters = { ...DEFAULT_GLOBE_IDLE_PARAMETERS, ...options.idleParameters };
    this.idleLoop = new GlobeIdleLoop(this.idleParameters);

    this.scene = new Scene();
    this.scene.background = new Color('#020714');
    this.camera = new PerspectiveCamera(42, 16 / 9, 0.1, 100);
    this.camera.position.set(0, 0.2, 15);

    this.globe = new Group();
    this.globe.name = 'globe-root';
    this.scene.add(this.globe);

    this.earthUniforms = {
      uSunDirection: { value: new Vector3(0.7, 0.25, 0.8).normalize() },
      uCloudShadow: { value: 0.12 },
    };
    this.earthMaterial = new ShaderMaterial({
      uniforms: this.earthUniforms,
      vertexShader: EARTH_SHADER.vertex,
      fragmentShader: EARTH_SHADER.fragment,
    });
    const earthGeometry = new SphereGeometry(5, 96, 64);
    this.earth = new Mesh(earthGeometry, this.earthMaterial);
    this.earth.name = 'earth';
    this.globe.add(this.earth);

    this.cloudUniforms = { uCloudPhase: { value: this.idleParameters.cloudPhase } };
    this.cloudMaterial = new ShaderMaterial({
      uniforms: this.cloudUniforms,
      vertexShader: CLOUD_SHADER.vertex,
      fragmentShader: CLOUD_SHADER.fragment,
      transparent: true,
      depthWrite: false,
    });
    const cloudGeometry = new SphereGeometry(5.045, 96, 64);
    this.cloudLayer = new Mesh(cloudGeometry, this.cloudMaterial);
    this.cloudLayer.name = 'cloud-layer';
    this.globe.add(this.cloudLayer);

    this.atmosphereUniforms = {
      uGlowColor: { value: new Color('#5eb9ff') },
      uGlowStrength: { value: 1.15 },
    };
    this.atmosphereMaterial = new ShaderMaterial({
      uniforms: this.atmosphereUniforms,
      vertexShader: ATMOSPHERE_SHADER.vertex,
      fragmentShader: ATMOSPHERE_SHADER.fragment,
      transparent: true,
      depthWrite: false,
      side: BackSide,
      blending: AdditiveBlending,
    });
    const atmosphereGeometry = new SphereGeometry(5.22, 96, 64);
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
    this.syncVisualState();
  }

  /** Updates GSAP-owned parameters without issuing render calls or creating a second ticker. */
  setIdleParameters(parameters: Partial<GlobeIdleParameters>): void {
    if (this.disposed) return;
    Object.assign(this.idleParameters, parameters);
    this.syncVisualState();
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

  get isDisposed(): boolean {
    return this.disposed;
  }

  get ownedResourceCount(): number {
    return this.ownedResources.length;
  }

  private syncVisualState(): void {
    this.globe.rotation.y = this.idleParameters.rotationY;
    this.cloudLayer.rotation.y = this.idleParameters.cloudPhase * Math.PI * 2;
    this.cloudUniforms.uCloudPhase.value = this.idleParameters.cloudPhase;

    const sunDirection = this.earthUniforms.uSunDirection.value;
    sunDirection
      .set(Math.cos(this.idleParameters.sunOrbit), 0.22, Math.sin(this.idleParameters.sunOrbit))
      .normalize();
    this.earthUniforms.uCloudShadow.value = 0.1 + this.cloudUniforms.uCloudPhase.value * 0.06;
    this.atmosphereUniforms.uGlowStrength.value = 1.05 + sunDirection.y * 0.25;
  }
}
