import { WebGLRenderer } from 'three';
import { sharedTicker, type Ticker } from '../../orchestration/ticker.js';
import { GlobeCameraRig, type GlobePreviewProject } from './camera-rig.js';
import { GlobeMarkerSystem, type GlobeMarkerProject } from './markers.js';
import { GlobeScene, type GlobeSceneOptions } from './GlobeScene.js';

/** A cleanup-registry-compatible handle returned by every state-scoped adapter operation. */
export interface GlobeOperationHandle {
  cancel(): void;
}

export interface GlobeRendererAdapterProject extends GlobeMarkerProject, GlobePreviewProject {}

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
    this.resizeToContainer();
    this.addResizeListener();
    this.syncTestAttributes();
    if (!this.unregisterRenderer) {
      this.unregisterRenderer = this.ticker.registerRenderer((deltaSeconds) => {
        this.render(deltaSeconds);
      });
      this.ticker.start();
    }
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
    this.scene.startIdleLoop();
    this.syncTestAttributes();
    return once(() => {
      if (this.disposed || this.idleOperation !== operation) return;
      this.scene.stopIdleLoop();
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
  previewProject(projectRef: GlobeRendererAdapterProject | string): GlobeOperationHandle {
    if (this.disposed) return once(() => {});
    const project = this.resolveProject(projectRef);
    const operation = ++this.previewOperation;
    this.markers.setPreviewProject(project.id);
    const cameraHandle = this.cameraRig.previewProject(project);
    this.syncTestAttributes();
    return once(() => {
      if (this.disposed || this.previewOperation !== operation) return;
      cameraHandle.cancel();
      this.markers.setPreviewProject(null);
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
    this.scene.render(this.renderer);
    this.renderedFrame += 1;
    this.syncTestAttributes();
  }

  /** E2E hooks only: attributes carry no text and are never part of the public presentation. */
  private syncTestAttributes(): void {
    this.canvas.dataset.cameraLevel = 'space';
    this.canvas.dataset.previewMotion = this.cameraRig.isPreviewInFlight
      ? 'retargeting'
      : 'settled';
    this.canvas.dataset.queuedTargets = '0';
    this.canvas.dataset.idleLoop = this.scene.idleLoopRunning ? 'running' : 'stopped';
    this.canvas.dataset.idleFrame = String(this.renderedFrame);
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
