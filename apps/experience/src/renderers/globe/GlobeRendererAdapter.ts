import { AgXToneMapping, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import type { GeographicFraming } from '@yii/content-schema';
import { sharedTicker, type Ticker } from '../../orchestration/ticker.js';
import { MOTION_DURATIONS_MS } from '../../orchestration/motion-tokens.js';
import {
  transitionNowMs,
  type RendererTransitionProbe,
} from '../handover/transition-observability.js';
import {
  applyGeographicPoseToThreeCamera,
  captureThreeGeographicPose,
  geographicToThreeSpherePoint,
  geographicPoseToProbe,
  type GeographicCameraPose,
} from '../handover/geographic-pose-bridge.js';
import { GlobeCameraRig, type GlobePreviewProject } from './camera-rig.js';
import { GlobeMarkerSystem, type GlobeMarkerProject } from './markers.js';
import { GlobeScene, type GlobeSceneOptions } from './GlobeScene.js';

/** A cleanup-registry-compatible handle returned by every state-scoped adapter operation. */
export interface GlobeOperationHandle {
  cancel(): void;
}

export interface GlobeRendererAdapterProject extends GlobeMarkerProject, GlobePreviewProject {
  geographicFraming?: GeographicFraming;
}

export interface GlobeRendererAdapterOptions {
  /** Content-defined projects only; no project-specific renderer code is permitted (QR-005). */
  projects: readonly GlobeRendererAdapterProject[];
  ticker?: Ticker;
  scene?: GlobeScene;
  markers?: GlobeMarkerSystem;
  cameraRig?: GlobeCameraRig;
  canvas?: HTMLCanvasElement;
  rendererFactory?: (canvas: HTMLCanvasElement) => WebGLRenderer;
  sceneOptions?: GlobeSceneOptions;
}

export interface GlobePreviewOptions {
  durationMs?: number;
}

export interface GlobeExternalFrameControl {
  render(deltaSeconds: number): void;
  release(): void;
}

function createCanvas(): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    throw new Error('GlobeRendererAdapter requires a browser document or an injected canvas.');
  }
  return document.createElement('canvas');
}

function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  // jsdom and a degraded playback environment can lack a WebGL context. Keep the state machine
  // and safe stage alive rather than throwing from construction; a later recovery/diagnostics
  // task can surface the renderer degradation to operators without exposing public error text.
  if (typeof WebGLRenderingContext === 'undefined') return createNoopRenderer();
  try {
    const renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    const pixelRatio =
      typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);
    return renderer;
  } catch {
    return createNoopRenderer();
  }
}

function createNoopRenderer(): WebGLRenderer {
  return {
    dispose: () => undefined,
    render: () => undefined,
    setPixelRatio: () => undefined,
    setSize: () => undefined,
  } as unknown as WebGLRenderer;
}

function configureRendererColorPipeline(renderer: WebGLRenderer): void {
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = AgXToneMapping;
  renderer.toneMappingExposure = 1;
}

function once(cancel: () => void): GlobeOperationHandle {
  let cancelled = false;
  return {
    cancel() {
      if (cancelled) return;
      cancelled = true;
      cancel();
    },
  };
}

/**
 * Sole owner of the Three.js globe canvas, renderer, scene graph, marker system, camera rig,
 * and shared-ticker registration. It deliberately owns no navigation decisions: the machine
 * calls its cancellable operations on state entry and registers their `cancel` methods on exit.
 */
export class GlobeRendererAdapter {
  readonly canvas: HTMLCanvasElement;
  readonly scene: GlobeScene;
  readonly markers: GlobeMarkerSystem;
  readonly cameraRig: GlobeCameraRig;
  readonly renderer: WebGLRenderer;

  private readonly ticker: Ticker;
  private readonly projectsById = new Map<string, GlobeRendererAdapterProject>();
  private container: HTMLElement | null = null;
  private unregisterRenderer: (() => void) | null = null;
  private listeningForResize = false;
  private categoryOperation = 0;
  private previewOperation = 0;
  private idleOperation = 0;
  private renderedFrame = 0;
  private firstRenderAtMs: number | null = null;
  private lastRenderAtMs: number | null = null;
  private readonly probeProjection = new Vector3();
  private externalFrameControl = false;
  private active = false;
  private disposed = false;

  constructor(options: GlobeRendererAdapterOptions) {
    this.ticker = options.ticker ?? sharedTicker;
    this.canvas = options.canvas ?? createCanvas();
    this.canvas.dataset.testid = 'globe-renderer';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';

    this.scene = options.scene ?? new GlobeScene(options.sceneOptions);
    this.markers = options.markers ?? new GlobeMarkerSystem(options.projects);
    this.cameraRig = options.cameraRig ?? new GlobeCameraRig({ camera: this.scene.camera });
    if (this.cameraRig.camera !== this.scene.camera) {
      throw new Error('GlobeCameraRig must control the GlobeScene camera.');
    }
    this.renderer = (options.rendererFactory ?? createRenderer)(this.canvas);
    configureRendererColorPipeline(this.renderer);

    for (const project of options.projects) {
      if (this.projectsById.has(project.id)) {
        throw new Error(`Duplicate globe adapter project id "${project.id}".`);
      }
      this.projectsById.set(project.id, project);
    }
    this.scene.globe.add(this.markers.mesh);
    this.syncTestAttributes();
  }

  /**
   * Mounts the owned canvas and registers exactly one renderer callback with the app-wide ticker.
   * Calling it repeatedly is safe and returns a handle that can be placed in CleanupRegistry.
   */
  start(container?: HTMLElement): GlobeOperationHandle {
    if (this.disposed) return once(() => {});
    if (container) {
      this.container = container;
      if (this.canvas.parentElement !== container) container.append(this.canvas);
    }
    this.active = true;
    this.canvas.style.opacity = '1';
    this.canvas.style.transform = '';
    this.resizeToContainer();
    this.addResizeListener();
    this.syncTestAttributes();
    this.registerTickerRenderer();
    return once(() => this.stop());
  }

  /** Stops ticker rendering without releasing resources, allowing a later `start()` to reuse them. */
  stop(): void {
    if (this.disposed) return;
    this.active = false;
    this.unregisterRenderer?.();
    this.unregisterRenderer = null;
    this.removeResizeListener();
    this.scene.stopIdleLoop();
    this.syncTestAttributes();
  }

  /** Idle presentation: all markers visible, no preview emphasis, and the seamless loop running. */
  enterIdle(): GlobeOperationHandle {
    if (this.disposed) return once(() => {});
    const operation = ++this.idleOperation;
    this.markers.setCategoryFilter(null);
    this.markers.setPreviewProject(null);
    const cameraHandle = this.cameraRig.returnToIdle();
    const sceneHandle = this.scene.enterIdle();
    this.syncTestAttributes();
    return once(() => {
      if (this.disposed || this.idleOperation !== operation) return;
      cameraHandle.cancel();
      sceneHandle.cancel();
    });
  }

  /** Filters the content-driven marker set; cancellation restores the all-marker idle target. */
  setCategoryFilter(categoryId: string | null): GlobeOperationHandle {
    if (this.disposed) return once(() => {});
    const operation = ++this.categoryOperation;
    this.markers.setCategoryFilter(categoryId);
    this.syncTestAttributes();
    return once(() => {
      if (this.disposed || this.categoryOperation !== operation) return;
      this.markers.setPreviewProject(null);
      this.markers.setCategoryFilter(null);
    });
  }

  /** Retargets the camera and marker emphasis; a newer preview cancels the prior live movement. */
  previewProject(
    projectRef: GlobeRendererAdapterProject | string,
    options: GlobePreviewOptions = {},
  ): GlobeOperationHandle {
    if (this.disposed) return once(() => {});
    const project = this.resolveProject(projectRef);
    const operation = ++this.previewOperation;
    this.markers.setPreviewProject(project.id);
    const cameraHandle = this.cameraRig.previewProject(project, options);
    this.scene.setPreviewDaylightDirection(this.cameraRig.camera.position);
    this.syncTestAttributes();
    return once(() => {
      if (this.disposed || this.previewOperation !== operation) return;
      cameraHandle.cancel();
      this.markers.setPreviewProject(null);
      this.scene.clearPreviewDaylight();
      this.syncTestAttributes();
    });
  }

  /** Category entry is intentionally more cinematic than rapid wheel retargets. */
  previewCategoryProject(projectRef: GlobeRendererAdapterProject | string): GlobeOperationHandle {
    return this.previewProject(projectRef, {
      durationMs: MOTION_DURATIONS_MS.categoryPreviewEntry,
    });
  }

  /** Allows the stage owner to update a physical canvas size without creating a second RAF loop. */
  resize(width: number, height: number): void {
    if (this.disposed || width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    this.scene.resize(width, height);
  }

  /** Full, idempotent ownership cleanup for renderer, DOM, scene, markers, rig, and ticker hook. */
  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.cameraRig.dispose();
    this.markers.dispose();
    this.scene.dispose();
    this.renderer.dispose();
    this.canvas.remove();
    this.projectsById.clear();
    this.disposed = true;
  }

  get visibleProjectIds(): string[] {
    return this.markers.targetVisibleProjectIds();
  }

  get emphasizedProjectId(): string | null {
    return this.markers.emphasizedProjectId;
  }

  get idleLoopRunning(): boolean {
    return this.scene.idleLoopRunning;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  captureGeographicPose(): GeographicCameraPose {
    if (this.disposed) throw new Error('Cannot capture a disposed globe camera.');
    this.scene.globe.updateWorldMatrix(true, false);
    return captureThreeGeographicPose(this.scene.camera, this.scene.globe.matrixWorld);
  }

  /** Pass 3 uses this temporary external-camera port only inside handover-owned frame control. */
  applyGeographicPose(pose: GeographicCameraPose): void {
    if (this.disposed) return;
    this.scene.globe.updateWorldMatrix(true, false);
    applyGeographicPoseToThreeCamera(this.scene.camera, pose, this.scene.globe.matrixWorld);
  }

  /**
   * Temporarily transfers frame ordering to HandoverController without changing resource owner.
   * The globe's independent root rotation is frozen so a captured source pose remains exact.
   */
  beginExternalFrameControl(): GlobeExternalFrameControl {
    if (this.disposed || this.externalFrameControl) {
      throw new Error('Globe external frame control is unavailable.');
    }
    const restartIdleLoop = this.scene.idleLoopRunning;
    const restoreMarkerVisibility = this.markers.mesh.visible;
    this.externalFrameControl = true;
    this.unregisterRenderer?.();
    this.unregisterRenderer = null;
    this.scene.stopIdleLoop();
    this.markers.mesh.visible = false;
    let released = false;
    return {
      render: (deltaSeconds) => {
        if (!released) this.render(deltaSeconds);
      },
      release: () => {
        if (released) return;
        released = true;
        this.externalFrameControl = false;
        this.markers.mesh.visible = restoreMarkerVisibility;
        if (restartIdleLoop && this.active) this.scene.startIdleLoop();
        this.registerTickerRenderer();
      },
    };
  }

  /**
   * Non-visible transition diagnostic expressed in the same WGS84 ECEF basis as Cesium.
   */
  transitionProbe(projectId: string | null = this.emphasizedProjectId): RendererTransitionProbe {
    const camera = this.scene.camera;
    const geographicPose = this.captureGeographicPose();

    let targetProjection: RendererTransitionProbe['targetProjection'] = null;
    const project = projectId ? this.projectsById.get(projectId) : undefined;
    if (project) {
      geographicToThreeSpherePoint(
        project.geographicFraming?.landingCamera.destination.lat ?? project.marker.lat,
        project.geographicFraming?.landingCamera.destination.lon ?? project.marker.lon,
        undefined,
        this.probeProjection,
        project.geographicFraming?.landingCamera.destination.height ?? 0,
      );
      this.scene.scene.updateMatrixWorld(true);
      this.scene.globe.localToWorld(this.probeProjection);
      this.probeProjection.project(camera);
      targetProjection = {
        projectId: project.id,
        x: (this.probeProjection.x + 1) / 2,
        y: (1 - this.probeProjection.y) / 2,
        visible:
          this.probeProjection.x >= -1 &&
          this.probeProjection.x <= 1 &&
          this.probeProjection.y >= -1 &&
          this.probeProjection.y <= 1 &&
          this.probeProjection.z >= -1 &&
          this.probeProjection.z <= 1,
      };
    }

    const opacity = styleOpacity(this.canvas);
    return {
      renderer: 'globe',
      rendering: this.active && !this.disposed,
      visible: !this.disposed && this.canvas.style.display !== 'none' && opacity > 0,
      opacity,
      frameCount: this.renderedFrame,
      lastRenderAtMs: this.lastRenderAtMs,
      camera: geographicPoseToProbe(geographicPose),
      targetProjection,
      matchedSourceCamera: null,
      matchedSourceTargetProjection: null,
      matchedSourceFrameAtMs: null,
      readiness: {
        resourceReadyAtMs: this.firstRenderAtMs,
        meaningfulFrameReadyAtMs: this.firstRenderAtMs,
      },
    };
  }

  private resolveProject(
    projectRef: GlobeRendererAdapterProject | string,
  ): GlobeRendererAdapterProject {
    const projectId = typeof projectRef === 'string' ? projectRef : projectRef.id;
    const project = this.projectsById.get(projectId);
    if (!project) throw new Error(`Unknown globe adapter project id "${projectId}".`);
    return project;
  }

  private render(deltaSeconds: number): void {
    if (!this.active || this.disposed) return;
    this.markers.advance(deltaSeconds);
    if (this.scene.previewDaylightActive) {
      this.scene.setPreviewDaylightDirection(this.cameraRig.camera.position);
    }
    this.scene.advance(deltaSeconds);
    this.scene.render(this.renderer);
    this.renderedFrame += 1;
    this.lastRenderAtMs = transitionNowMs();
    this.firstRenderAtMs ??= this.lastRenderAtMs;
    this.syncTestAttributes();
  }

  private registerTickerRenderer(): void {
    if (this.disposed || !this.active || this.externalFrameControl || this.unregisterRenderer) {
      return;
    }
    this.unregisterRenderer = this.ticker.registerRenderer((deltaSeconds) => {
      this.render(deltaSeconds);
    });
    this.ticker.start();
  }

  /** E2E hooks only: attributes carry no text and are never part of the public presentation. */
  private syncTestAttributes(): void {
    this.canvas.dataset.cameraLevel = 'space';
    this.canvas.dataset.previewMotion = this.cameraRig.isPreviewInFlight
      ? 'retargeting'
      : 'settled';
    this.canvas.dataset.queuedTargets = '0';
    this.canvas.dataset.idleLoop = this.scene.idleLoopRunning ? 'running' : 'stopped';
    this.canvas.dataset.previewDaylight = this.scene.previewDaylightActive
      ? 'camera-facing'
      : 'idle';
    this.canvas.dataset.idleFrame = String(this.renderedFrame);
    this.canvas.dataset.rendering = String(this.active && !this.disposed);
    this.canvas.dataset.frameCount = String(this.renderedFrame);
    if (this.lastRenderAtMs === null) {
      delete this.canvas.dataset.lastRenderAtMs;
    } else {
      this.canvas.dataset.lastRenderAtMs = String(this.lastRenderAtMs);
    }
  }

  private readonly resizeToContainer = (): void => {
    const width = this.container?.clientWidth ?? this.canvas.clientWidth;
    const height = this.container?.clientHeight ?? this.canvas.clientHeight;
    const viewportWidth = typeof window === 'undefined' ? 1 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? 1 : window.innerHeight;
    this.resize(width || viewportWidth || 1, height || viewportHeight || 1);
  };

  private addResizeListener(): void {
    if (this.listeningForResize || typeof window === 'undefined') return;
    window.addEventListener('resize', this.resizeToContainer);
    this.listeningForResize = true;
  }

  private removeResizeListener(): void {
    if (!this.listeningForResize || typeof window === 'undefined') return;
    window.removeEventListener('resize', this.resizeToContainer);
    this.listeningForResize = false;
  }
}

function styleOpacity(element: HTMLElement): number {
  const opacity = Number.parseFloat(element.style.opacity);
  return Number.isFinite(opacity) ? opacity : 1;
}
