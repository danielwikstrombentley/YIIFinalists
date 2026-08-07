import { Cartesian3, Matrix4 as CesiumMatrix4, SceneTransforms, Viewer } from 'cesium';
import type { GeographicFraming } from '@yii/content-schema';
import { sharedTicker, type Ticker } from '../../orchestration/ticker.js';
import {
  transitionNowMs,
  type CameraPoseProbe,
  type RendererTransitionProbe,
  type TargetProjectionProbe,
} from '../handover/transition-observability.js';
import {
  geographicPoseToProbe,
  landingPoseFromCameraPose,
  threeFovToCesium,
  type GeographicCameraPose,
} from '../handover/geographic-camera-pose.js';
import {
  FallbackSurface,
  initialStageTier,
  nextStageTier,
  type CesiumStageTier,
  type TierDegradation,
} from './fallback-tiers.js';
import { loadIonTileset, type CesiumEventLike, type CesiumTilesetLike } from './tileset.js';

export type { CesiumTilesetLike } from './tileset.js';

/** The validated subset of a project the geographic stage is allowed to consume. */
export interface CesiumStageProject {
  id: string;
  geographicFraming: GeographicFraming;
}

export interface CesiumPrimitiveCollectionLike {
  add(primitive: CesiumTilesetLike): unknown;
  remove(primitive: CesiumTilesetLike): boolean;
}

export interface CesiumViewerLike {
  scene: {
    primitives: CesiumPrimitiveCollectionLike;
    requestRender?(): void;
    postRender?: CesiumEventLike;
    canvas?: {
      clientWidth?: number;
      clientHeight?: number;
      width?: number;
      height?: number;
    };
  };
  camera?: {
    position?: Cartesian3;
    direction?: Cartesian3;
    up?: Cartesian3;
    right?: Cartesian3;
    positionWC?: { x: number; y: number; z: number };
    directionWC?: { x: number; y: number; z: number };
    upWC?: { x: number; y: number; z: number };
    frustum?: {
      fov?: number;
      fovy?: number;
      aspectRatio?: number;
    };
    setView?(options: {
      destination: Cartesian3;
      orientation: { direction: Cartesian3; up: Cartesian3 };
      endTransform?: CesiumMatrix4;
    }): void;
  };
  render(): void;
  destroy(): void;
}

export interface CesiumViewerOptions {
  animation: false;
  baseLayer: false;
  baseLayerPicker: false;
  fullscreenButton: false;
  geocoder: false;
  globe: false;
  homeButton: false;
  infoBox: false;
  navigationHelpButton: false;
  requestRenderMode: false;
  sceneModePicker: false;
  selectionIndicator: false;
  shouldAnimate: false;
  showRenderLoopErrors: false;
  skyAtmosphere: false;
  skyBox: false;
  timeline: false;
  useDefaultRenderLoop: false;
}

export interface LocalFallbackHandle {
  dispose(): void;
}

export interface CesiumStageReady {
  projectId: string;
  tier: CesiumStageTier;
  fallback: boolean;
  meaningfulFrameReady: boolean;
  status: 'ready' | 'cancelled';
}

export interface CesiumStageHandle {
  cancel(): void;
}

export interface CesiumStageOperation extends CesiumStageHandle {
  ready: Promise<CesiumStageReady>;
}

export interface CesiumStageAdapterOptions {
  ticker?: Ticker;
  viewerFactory?: (container: HTMLElement, options: CesiumViewerOptions) => CesiumViewerLike;
  tilesetLoader?: (request: { assetId: number; accessToken: string }) => Promise<CesiumTilesetLike>;
  /** Allows content/package ownership to supply a richer local scene without changing stage flow. */
  localFallbackLoader?: (project: CesiumStageProject) => Promise<LocalFallbackHandle | void>;
  /** Values must come from kiosk-local runtime config, never `import.meta.env` or source control. */
  ionAccessToken?: string;
  ionGoogleTilesAssetId?: number | string;
  tileLatencyTimeoutMs?: number;
  meaningfulFrameTimeoutMs?: number;
  onDegradation?: (event: TierDegradation) => void;
}

export interface CesiumIonConfiguration {
  ionAccessToken?: string;
  ionGoogleTilesAssetId?: number | string;
}

const DEFAULT_TILE_LATENCY_TIMEOUT_MS = 3_500;
const DEFAULT_MEANINGFUL_FRAME_TIMEOUT_MS = 12_000;

const DEFAULT_VIEWER_OPTIONS: CesiumViewerOptions = {
  animation: false,
  baseLayer: false,
  baseLayerPicker: false,
  fullscreenButton: false,
  geocoder: false,
  globe: false,
  homeButton: false,
  infoBox: false,
  navigationHelpButton: false,
  requestRenderMode: false,
  sceneModePicker: false,
  selectionIndicator: false,
  shouldAnimate: false,
  showRenderLoopErrors: false,
  skyAtmosphere: false,
  skyBox: false,
  timeline: false,
  useDefaultRenderLoop: false,
};

function createViewer(container: HTMLElement, options: CesiumViewerOptions): CesiumViewerLike {
  return new Viewer(container, options) as unknown as CesiumViewerLike;
}

function once(cancel: () => void): CesiumStageHandle {
  let cancelled = false;
  return {
    cancel() {
      if (cancelled) return;
      cancelled = true;
      cancel();
    },
  };
}

function normalizeIonAssetId(value: number | string | undefined): number | null {
  const assetId = typeof value === 'string' ? Number(value) : value;
  return Number.isInteger(assetId) && (assetId ?? 0) > 0 ? assetId! : null;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withLatencyTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`Cesium tiles exceeded the ${timeoutMs} ms readiness budget.`));
    }, timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

class MeaningfulFrameWaitCancelled extends Error {
  constructor() {
    super('Cesium meaningful-frame wait was cancelled.');
  }
}

/**
 * Owns the Cesium DOM/viewer/tileset resources. It has no navigation decisions: the XState
 * machine and HandoverController choose when to prewarm, show, cancel, or reset this stage.
 *
 * Resource ownership map: this adapter owns `element`, Viewer, tileset primitive, local fallback
 * handle, fallback surface, and exactly one shared-ticker registration. `dispose()` releases all
 * six idempotently; no Cesium default render loop or free-standing RAF is created.
 */
export class CesiumStageAdapter {
  readonly element: HTMLDivElement;

  private readonly ticker: Ticker;
  private readonly viewerFactory: NonNullable<CesiumStageAdapterOptions['viewerFactory']>;
  private readonly tilesetLoader: NonNullable<CesiumStageAdapterOptions['tilesetLoader']>;
  private readonly localFallbackLoader: CesiumStageAdapterOptions['localFallbackLoader'];
  private ionAccessToken: string | undefined;
  private ionGoogleTilesAssetId: number | string | undefined;
  private readonly tileLatencyTimeoutMs: number;
  private readonly meaningfulFrameTimeoutMs: number;
  private readonly onDegradation: ((event: TierDegradation) => void) | undefined;
  private readonly fallbackSurface: FallbackSurface;

  private viewer: CesiumViewerLike | null = null;
  private tileset: CesiumTilesetLike | null = null;
  private localFallback: LocalFallbackHandle | null = null;
  private unregisterRenderer: (() => void) | null = null;
  private activeProject: CesiumStageProject | null = null;
  private activeTier: CesiumStageTier | null = null;
  private operation = 0;
  private rendering = false;
  private visible = false;
  private renderedFrame = 0;
  private lastRenderAtMs: number | null = null;
  private resourceReadyAtMs: number | null = null;
  // Pass 0 intentionally exposes this missing readiness signal. Pass 2 sets it only after
  // target-view tile readiness followed by a completed Scene.postRender frame.
  private meaningfulFrameReadyAtMs: number | null = null;
  private matchedSourceCamera: CameraPoseProbe | null = null;
  private matchedSourceTargetProjection: TargetProjectionProbe | null = null;
  private matchedSourceFrameAtMs: number | null = null;
  private cancelMeaningfulFrameWait: (() => void) | null = null;
  private disposed = false;
  private viewerCreationError: Error | null = null;

  constructor(options: CesiumStageAdapterOptions = {}) {
    if (typeof document === 'undefined') {
      throw new Error('CesiumStageAdapter requires a browser document.');
    }
    this.ticker = options.ticker ?? sharedTicker;
    this.viewerFactory = options.viewerFactory ?? createViewer;
    this.tilesetLoader = options.tilesetLoader ?? loadIonTileset;
    this.localFallbackLoader = options.localFallbackLoader;
    this.ionAccessToken = options.ionAccessToken;
    this.ionGoogleTilesAssetId = options.ionGoogleTilesAssetId;
    this.tileLatencyTimeoutMs = options.tileLatencyTimeoutMs ?? DEFAULT_TILE_LATENCY_TIMEOUT_MS;
    this.meaningfulFrameTimeoutMs =
      options.meaningfulFrameTimeoutMs ?? DEFAULT_MEANINGFUL_FRAME_TIMEOUT_MS;
    this.onDegradation = options.onDegradation;

    this.element = document.createElement('div');
    this.element.dataset.testid = 'cesium-stage';
    this.element.setAttribute('aria-hidden', 'true');
    Object.assign(this.element.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '1',
      overflow: 'hidden',
      opacity: '0',
      pointerEvents: 'none',
    });
    this.fallbackSurface = new FallbackSurface(this.element);
    this.syncTestAttributes();
  }

  /** Mounts the viewer but deliberately does not activate a render callback until a project opens. */
  start(container: HTMLElement): CesiumStageHandle {
    if (this.disposed) return once(() => {});
    if (this.element.parentElement !== container) container.append(this.element);
    this.ensureViewer();
    this.syncTestAttributes();
    return once(() => this.deactivate());
  }

  /** Accepts kiosk-local runtime configuration after mount; credentials never enter the bundle. */
  configureIon(configuration: CesiumIonConfiguration): void {
    if (this.disposed) return;
    this.ionAccessToken = configuration.ionAccessToken;
    this.ionGoogleTilesAssetId = configuration.ionGoogleTilesAssetId;
  }

  /** Prepares a project off-screen; T032 consumes this for preview-time readiness warming. */
  prewarmProject(project: CesiumStageProject): CesiumStageOperation {
    return this.beginProject(project, false, true);
  }

  /** Starts rendering the requested project as the active geographic presentation. */
  activateProject(project: CesiumStageProject): CesiumStageOperation {
    return this.beginProject(project, true, true);
  }

  /** Claims a previously ready prewarm at the concealed cover moment without loading it twice. */
  activatePreparedProject(project: CesiumStageProject): CesiumStageOperation {
    if (this.activeProject?.id !== project.id || !this.activeTier) {
      return this.activateProject(project);
    }
    this.setRendering(true);
    this.setPresentationVisible(true);
    return {
      ready: Promise.resolve({
        projectId: project.id,
        tier: this.activeTier,
        fallback: this.activeTier !== 'photorealistic',
        meaningfulFrameReady: this.meaningfulFrameReadyAtMs !== null,
        status: 'ready',
      }),
      cancel: () => this.deactivate(),
    };
  }

  /** Watchdog escape hatch: make the local safe visual available before revealing the cover. */
  showSafeComposition(project: CesiumStageProject): CesiumStageOperation {
    if (this.disposed) {
      return { ...once(() => {}), ready: Promise.resolve(this.cancelledResult(project)) };
    }
    this.operation += 1;
    this.clearProjectResources();
    this.activeProject = project;
    this.activeTier = 'safe-composition';
    this.resourceReadyAtMs = transitionNowMs();
    this.meaningfulFrameReadyAtMs = this.resourceReadyAtMs;
    this.clearMatchedSourceProbe();
    this.setRendering(true);
    this.setPresentationVisible(true);
    this.activateSafeCompositionTier();
    this.syncTestAttributes();
    return {
      ready: Promise.resolve({
        projectId: project.id,
        tier: 'safe-composition',
        fallback: true,
        meaningfulFrameReady: true,
        status: 'ready',
      }),
      cancel: () => this.reset(),
    };
  }

  /** Handover choreography controls visibility independently from off-screen prewarming. */
  setPresentationVisible(visible: boolean): void {
    if (this.disposed) return;
    this.visible = visible;
    this.element.style.opacity = visible ? '1' : '0';
    this.syncTestAttributes();
  }

  /** Stops rendering while retaining an already warmed tileset for a possible handover reuse. */
  deactivate(): void {
    if (this.disposed) return;
    this.setPresentationVisible(false);
    this.setRendering(false);
  }

  /** Cancels work and returns the stage to a reusable, unselected state. */
  reset(): void {
    if (this.disposed) return;
    this.operation += 1;
    this.clearProjectResources();
    this.activeProject = null;
    this.activeTier = null;
    this.resourceReadyAtMs = null;
    this.meaningfulFrameReadyAtMs = null;
    this.clearMatchedSourceProbe();
    this.deactivate();
    this.fallbackSurface.hide();
    this.syncTestAttributes();
  }

  /** Complete, idempotent resource disposal. A later recovery creates a fresh adapter instance. */
  dispose(): void {
    if (this.disposed) return;
    this.reset();
    this.viewer?.destroy();
    this.viewer = null;
    this.fallbackSurface.dispose();
    this.element.remove();
    this.disposed = true;
  }

  get isRendering(): boolean {
    return this.rendering;
  }

  get isVisible(): boolean {
    return this.visible;
  }

  get tier(): CesiumStageTier | null {
    return this.activeTier;
  }

  /**
   * Sets Cesium to the exact captured globe pose while it is still hidden, renders one completed
   * proof frame, and retains that frame's camera/projection diagnostics after the landing reset.
   */
  matchSourceCamera(pose: GeographicCameraPose, project: CesiumStageProject): boolean {
    if (this.disposed || this.visible || this.activeProject?.id !== project.id) return false;
    if (!this.applyCameraPose(pose, true)) return false;
    if (!this.viewer) return false;
    this.viewer.render();
    this.recordRenderedFrame();
    this.matchedSourceCamera = this.currentCameraProbe() ?? geographicPoseToProbe(pose);
    this.matchedSourceTargetProjection = this.projectActiveTarget();
    this.matchedSourceFrameAtMs = this.lastRenderAtMs;
    this.syncTestAttributes();
    return true;
  }

  /** Resets the hidden camera to the approved target/range pose before the legacy cover reveal. */
  setLandingCamera(project: CesiumStageProject): boolean {
    if (this.disposed || this.activeProject?.id !== project.id) return false;
    return this.applyCameraPose(
      landingPoseFromCameraPose(project.geographicFraming.landingCamera),
      false,
    );
  }

  /**
   * Non-visible transition diagnostic. It captures Cesium's native ECEF basis and reports the
   * currently absent meaningful-frame timestamp rather than treating tileset construction as a
   * rendered target view.
   */
  transitionProbe(): RendererTransitionProbe {
    const opacity = styleOpacity(this.element);

    return {
      renderer: 'cesium',
      rendering: this.rendering && !this.disposed,
      visible: this.visible && !this.disposed && opacity > 0,
      opacity,
      frameCount: this.renderedFrame,
      lastRenderAtMs: this.lastRenderAtMs,
      camera: this.currentCameraProbe(),
      targetProjection: this.projectActiveTarget(),
      matchedSourceCamera: this.matchedSourceCamera,
      matchedSourceTargetProjection: this.matchedSourceTargetProjection,
      matchedSourceFrameAtMs: this.matchedSourceFrameAtMs,
      readiness: {
        resourceReadyAtMs: this.resourceReadyAtMs,
        meaningfulFrameReadyAtMs: this.meaningfulFrameReadyAtMs,
      },
    };
  }

  private beginProject(
    project: CesiumStageProject,
    visible: boolean,
    rendering: boolean,
  ): CesiumStageOperation {
    if (this.disposed) {
      return { ...once(() => {}), ready: Promise.resolve(this.cancelledResult(project)) };
    }

    this.ensureViewer();
    this.operation += 1;
    const operation = this.operation;
    this.clearProjectResources();
    this.activeProject = project;
    this.activeTier = null;
    this.resourceReadyAtMs = null;
    this.meaningfulFrameReadyAtMs = null;
    this.clearMatchedSourceProbe();
    this.setRendering(rendering);
    this.setPresentationVisible(visible);
    // The safe surface is visible behind the opaque handover cover while remote readiness is
    // pending, guaranteeing that no asynchronous wait can create a black stage.
    this.fallbackSurface.show('safe-composition');
    this.syncTestAttributes();

    const ready = this.resolveProjectTier(project, operation);
    const handle = once(() => {
      if (!this.isCurrent(operation)) return;
      this.operation += 1;
      this.clearProjectResources();
      this.activeProject = null;
      this.activeTier = null;
      this.deactivate();
      this.fallbackSurface.hide();
      this.syncTestAttributes();
    });
    return { ...handle, ready };
  }

  private async resolveProjectTier(
    project: CesiumStageProject,
    operation: number,
  ): Promise<CesiumStageReady> {
    let tier = initialStageTier(project.geographicFraming);

    while (this.isCurrent(operation)) {
      try {
        if (tier === 'photorealistic') {
          await this.activatePhotorealisticTier(project, operation);
        } else if (tier === 'local-fallback-scene') {
          await this.activateLocalFallbackTier(project, operation);
        } else {
          this.activateSafeCompositionTier();
        }

        if (!this.isCurrent(operation)) return this.cancelledResult(project);
        if (tier !== 'photorealistic') this.meaningfulFrameReadyAtMs = transitionNowMs();
        this.activeTier = tier;
        this.resourceReadyAtMs = transitionNowMs();
        this.syncTestAttributes();
        return {
          projectId: project.id,
          tier,
          fallback: tier !== 'photorealistic',
          meaningfulFrameReady: this.meaningfulFrameReadyAtMs !== null,
          status: 'ready',
        };
      } catch (error) {
        if (!this.isCurrent(operation)) return this.cancelledResult(project);
        const next = nextStageTier(tier);
        if (!next) {
          // `safe-composition` itself is local and must not fail into an empty public frame.
          this.activateSafeCompositionTier();
          this.activeTier = 'safe-composition';
          this.resourceReadyAtMs = transitionNowMs();
          this.meaningfulFrameReadyAtMs = this.resourceReadyAtMs;
          this.syncTestAttributes();
          return {
            projectId: project.id,
            tier: 'safe-composition',
            fallback: true,
            meaningfulFrameReady: true,
            status: 'ready',
          };
        }
        this.onDegradation?.({
          from: tier,
          to: next,
          projectId: project.id,
          reason: describeError(error),
        });
        tier = next;
      }
    }

    return this.cancelledResult(project);
  }

  private async activatePhotorealisticTier(
    project: CesiumStageProject,
    operation: number,
  ): Promise<void> {
    if (!this.viewer) {
      throw (
        this.viewerCreationError ?? new Error('Cesium viewer is unavailable for tile rendering.')
      );
    }
    const assetId = normalizeIonAssetId(this.ionGoogleTilesAssetId);
    if (!assetId || !this.ionAccessToken) {
      throw new Error('Cesium ion configuration is unavailable from kiosk runtime config.');
    }
    if (!this.setLandingCamera(project)) {
      throw new Error('Cesium target camera is unavailable for meaningful-frame prewarm.');
    }

    const tileset = await withLatencyTimeout(
      this.tilesetLoader({ assetId, accessToken: this.ionAccessToken }),
      this.tileLatencyTimeoutMs,
    );
    if (!this.isCurrent(operation)) {
      tileset.destroy?.();
      return;
    }

    try {
      const meaningfulFrame = this.waitForMeaningfulFrame(tileset, operation);
      tileset.show = true;
      this.tileset = tileset;
      this.viewer.scene.primitives.add(tileset);
      this.fallbackSurface.hide();
      this.viewer.scene.requestRender?.();
      await meaningfulFrame;
    } catch (error) {
      if (this.tileset === tileset) this.releaseTileset(tileset);
      throw error;
    }
  }

  private async activateLocalFallbackTier(
    project: CesiumStageProject,
    operation: number,
  ): Promise<void> {
    const handle = await this.localFallbackLoader?.(project);
    if (!this.isCurrent(operation)) {
      handle?.dispose();
      return;
    }
    this.localFallback = handle ?? null;
    this.fallbackSurface.show('local-fallback-scene');
  }

  private activateSafeCompositionTier(): void {
    this.fallbackSurface.show('safe-composition');
  }

  private waitForMeaningfulFrame(tileset: CesiumTilesetLike, operation: number): Promise<void> {
    const postRender = this.viewer?.scene.postRender;
    const initialTilesLoaded = tileset.initialTilesLoaded;
    const tileLoad = tileset.tileLoad;
    if (!postRender || (!initialTilesLoaded && !tileLoad && !tileset.tilesLoaded)) {
      return Promise.reject(
        new Error(
          'Cesium target-view readiness events are unavailable for photorealistic prewarm.',
        ),
      );
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let removeTileListener: (() => void) | null = null;
      let removeTileLoadListener: (() => void) | null = null;
      let removePostRenderListener: (() => void) | null = null;
      let postRenderQueued = false;
      const timeout = window.setTimeout(() => {
        settle(
          reject,
          new Error(
            `Cesium target frame exceeded the ${this.meaningfulFrameTimeoutMs} ms readiness budget.`,
          ),
        );
      }, this.meaningfulFrameTimeoutMs);

      const cleanup = (): void => {
        window.clearTimeout(timeout);
        removeTileListener?.();
        removeTileListener = null;
        removeTileLoadListener?.();
        removeTileLoadListener = null;
        removePostRenderListener?.();
        removePostRenderListener = null;
        if (this.cancelMeaningfulFrameWait === cancel) this.cancelMeaningfulFrameWait = null;
      };
      const settle = <T>(callback: (value: T) => void, value: T): void => {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      };
      const waitForFollowingPostRender = (): void => {
        if (settled || postRenderQueued || !this.isCurrent(operation)) return;
        postRenderQueued = true;
        removeTileListener?.();
        removeTileListener = null;
        removeTileLoadListener?.();
        removeTileLoadListener = null;
        // Queue after the tile-ready callback's frame so only a subsequent postRender can settle.
        queueMicrotask(() => {
          if (settled || !this.isCurrent(operation)) return;
          removePostRenderListener = postRender.addEventListener(() => {
            if (!this.isCurrent(operation)) return;
            this.meaningfulFrameReadyAtMs = transitionNowMs();
            settle(resolve, undefined);
          });
        });
      };
      const cancel = (): void => settle(reject, new MeaningfulFrameWaitCancelled());
      this.cancelMeaningfulFrameWait = cancel;

      if (tileset.tilesLoaded) {
        waitForFollowingPostRender();
      } else if (initialTilesLoaded) {
        removeTileListener = initialTilesLoaded.addEventListener(waitForFollowingPostRender);
        if (tileLoad) {
          removeTileLoadListener = tileLoad.addEventListener(waitForFollowingPostRender);
        }
      } else if (tileLoad) {
        removeTileLoadListener = tileLoad.addEventListener(waitForFollowingPostRender);
      }
    });
  }

  private ensureViewer(): void {
    if (this.viewer || this.viewerCreationError || this.disposed) return;
    try {
      this.viewer = this.viewerFactory(this.element, DEFAULT_VIEWER_OPTIONS);
    } catch (error) {
      // The safe/local fallback tiers are DOM-backed and remain usable if GPU/WebGL startup
      // fails; a photorealistic request detects this error and degrades rather than blanking.
      this.viewerCreationError =
        error instanceof Error
          ? error
          : new Error(`Cesium viewer startup failed: ${String(error)}`);
    }
  }

  private setRendering(rendering: boolean): void {
    if (this.disposed || this.rendering === rendering) return;
    this.rendering = rendering;
    if (rendering) {
      this.unregisterRenderer = this.ticker.registerRenderer(() => this.render());
      this.ticker.start();
    } else {
      this.unregisterRenderer?.();
      this.unregisterRenderer = null;
    }
    this.syncTestAttributes();
  }

  private render(): void {
    if (!this.rendering || this.disposed) return;
    if (this.viewer) {
      this.viewer.render();
      this.recordRenderedFrame();
    }
    this.syncTestAttributes();
  }

  private recordRenderedFrame(): void {
    this.renderedFrame += 1;
    this.lastRenderAtMs = transitionNowMs();
  }

  private applyCameraPose(pose: GeographicCameraPose, matchFrustum: boolean): boolean {
    const camera = this.viewer?.camera;
    if (!camera?.setView) return false;
    const basis = orthonormalCameraBasis(pose);
    const destination = new Cartesian3(...pose.positionEcef);
    if (matchFrustum && camera.frustum) {
      camera.frustum.aspectRatio = pose.aspectRatio;
      camera.frustum.fov = threeFovToCesium(pose.verticalFovRadians, pose.aspectRatio);
    }
    camera.setView({
      destination,
      orientation: basis,
      endTransform: CesiumMatrix4.IDENTITY,
    });
    // Cesium's public setView direction/up path converts through local HPR and can introduce a
    // measurable basis drift at whole-Earth range. With the identity transform established above,
    // assign the documented mutable camera vectors directly so the hard-cut proof is exact.
    if (camera.position && camera.direction && camera.up && camera.right) {
      Cartesian3.clone(destination, camera.position);
      Cartesian3.clone(basis.direction, camera.direction);
      Cartesian3.clone(basis.up, camera.up);
      Cartesian3.normalize(
        Cartesian3.cross(camera.direction, camera.up, camera.right),
        camera.right,
      );
    }
    this.viewer?.scene.requestRender?.();
    return true;
  }

  private clearMatchedSourceProbe(): void {
    this.matchedSourceCamera = null;
    this.matchedSourceTargetProjection = null;
    this.matchedSourceFrameAtMs = null;
  }

  private cameraAspectRatio(): number | null {
    const frustumAspect = this.viewer?.camera?.frustum?.aspectRatio;
    if (frustumAspect && Number.isFinite(frustumAspect) && frustumAspect > 0) {
      return frustumAspect;
    }
    const canvas = this.viewer?.scene.canvas;
    const width = canvas?.clientWidth ?? canvas?.width ?? this.element.clientWidth;
    const height = canvas?.clientHeight ?? canvas?.height ?? this.element.clientHeight;
    return width > 0 && height > 0 ? width / height : null;
  }

  private currentCameraProbe(): CameraPoseProbe | null {
    const camera = this.viewer?.camera;
    const position = camera?.positionWC;
    const direction = camera?.directionWC;
    const up = camera?.upWC;
    const aspectRatio = this.cameraAspectRatio();
    const verticalFovRadians = this.cameraVerticalFovRadians(aspectRatio);
    return position && direction && up && aspectRatio && verticalFovRadians
      ? {
          coordinateSpace: 'ecef',
          position: [position.x, position.y, position.z],
          direction: [direction.x, direction.y, direction.z],
          up: [up.x, up.y, up.z],
          verticalFovRadians,
          aspectRatio,
        }
      : null;
  }

  private cameraVerticalFovRadians(aspectRatio: number | null): number | null {
    const frustum = this.viewer?.camera?.frustum;
    if (frustum?.fovy && Number.isFinite(frustum.fovy) && frustum.fovy > 0) {
      return frustum.fovy;
    }
    if (!frustum?.fov || !Number.isFinite(frustum.fov) || frustum.fov <= 0 || !aspectRatio) {
      return null;
    }
    // Cesium's perspective `fov` is horizontal for landscape viewports and vertical otherwise.
    return aspectRatio > 1 ? 2 * Math.atan(Math.tan(frustum.fov / 2) / aspectRatio) : frustum.fov;
  }

  private projectActiveTarget(): RendererTransitionProbe['targetProjection'] {
    const project = this.activeProject;
    const scene = this.viewer?.scene;
    if (!project || !scene) return null;

    try {
      const { destination } = project.geographicFraming.landingCamera;
      const target = Cartesian3.fromDegrees(destination.lon, destination.lat, destination.height);
      const point = SceneTransforms.worldToWindowCoordinates(
        scene as unknown as Parameters<typeof SceneTransforms.worldToWindowCoordinates>[0],
        target,
      );
      const canvas = scene.canvas;
      const width = canvas?.clientWidth ?? canvas?.width ?? this.element.clientWidth;
      const height = canvas?.clientHeight ?? canvas?.height ?? this.element.clientHeight;
      if (!point || width <= 0 || height <= 0) return null;
      const x = point.x / width;
      const y = point.y / height;
      return {
        projectId: project.id,
        x,
        y,
        visible: x >= 0 && x <= 1 && y >= 0 && y <= 1,
      };
    } catch {
      // A structural test double or a scene before its first render may not support projection.
      return null;
    }
  }

  private clearProjectResources(): void {
    this.cancelMeaningfulFrameWait?.();
    this.cancelMeaningfulFrameWait = null;
    const tileset = this.tileset;
    if (tileset) this.releaseTileset(tileset);
    this.localFallback?.dispose();
    this.localFallback = null;
  }

  private releaseTileset(tileset: CesiumTilesetLike): void {
    if (this.tileset === tileset) this.tileset = null;
    if (!tileset.isDestroyed?.()) {
      tileset.show = false;
      this.viewer?.scene.primitives.remove(tileset);
      // Cesium's default PrimitiveCollection owns its children and destroys a removed tileset.
      // Test/mocked collections and an intentionally non-owning collection may not, so destroy
      // explicitly only if the collection did not already do so. Calling `destroy()` twice makes
      // Cesium throw DeveloperError and can stop the XState actor handling category/idle input.
      if (!tileset.isDestroyed?.()) tileset.destroy?.();
    }
  }

  private isCurrent(operation: number): boolean {
    return !this.disposed && operation === this.operation;
  }

  private cancelledResult(project: CesiumStageProject): CesiumStageReady {
    return {
      projectId: project.id,
      tier: this.activeTier ?? initialStageTier(project.geographicFraming),
      fallback: true,
      meaningfulFrameReady: false,
      status: 'cancelled',
    };
  }

  private syncTestAttributes(): void {
    this.element.dataset.projectId = this.activeProject?.id ?? '';
    this.element.dataset.tier = this.activeTier ?? 'uninitialized';
    this.element.dataset.visible = String(this.visible);
    this.element.dataset.rendering = String(this.rendering);
    this.element.dataset.frameCount = String(this.renderedFrame);
    if (this.lastRenderAtMs === null) {
      delete this.element.dataset.lastRenderAtMs;
    } else {
      this.element.dataset.lastRenderAtMs = String(this.lastRenderAtMs);
    }
    if (this.resourceReadyAtMs === null) {
      delete this.element.dataset.resourceReadyAtMs;
    } else {
      this.element.dataset.resourceReadyAtMs = String(this.resourceReadyAtMs);
    }
    if (this.meaningfulFrameReadyAtMs === null) {
      delete this.element.dataset.meaningfulFrameReadyAtMs;
    } else {
      this.element.dataset.meaningfulFrameReadyAtMs = String(this.meaningfulFrameReadyAtMs);
    }
    if (this.matchedSourceFrameAtMs === null) {
      delete this.element.dataset.matchedSourceFrameAtMs;
    } else {
      this.element.dataset.matchedSourceFrameAtMs = String(this.matchedSourceFrameAtMs);
    }
    if (this.activeProject) {
      this.element.dataset.framing = JSON.stringify(this.activeProject.geographicFraming);
    } else {
      delete this.element.dataset.framing;
    }
  }
}

function styleOpacity(element: HTMLElement): number {
  const opacity = Number.parseFloat(element.style.opacity);
  return Number.isFinite(opacity) ? opacity : 1;
}

function orthonormalCameraBasis(pose: GeographicCameraPose): {
  direction: Cartesian3;
  up: Cartesian3;
} {
  const direction = Cartesian3.normalize(new Cartesian3(...pose.directionEcef), new Cartesian3());
  const right = Cartesian3.normalize(
    Cartesian3.cross(direction, new Cartesian3(...pose.upEcef), new Cartesian3()),
    new Cartesian3(),
  );
  const up = Cartesian3.normalize(
    Cartesian3.cross(right, direction, new Cartesian3()),
    new Cartesian3(),
  );
  return { direction, up };
}
