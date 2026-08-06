import { Viewer } from 'cesium';
import type { GeographicFraming } from '@yii/content-schema';
import { sharedTicker, type Ticker } from '../../orchestration/ticker.js';
import {
  FallbackSurface,
  initialStageTier,
  nextStageTier,
  type CesiumStageTier,
  type TierDegradation,
} from './fallback-tiers.js';
import { loadIonTileset, type CesiumTilesetLike } from './tileset.js';

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
  onDegradation?: (event: TierDegradation) => void;
}

const DEFAULT_TILE_LATENCY_TIMEOUT_MS = 3_500;

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
  private readonly ionAccessToken: string | undefined;
  private readonly ionGoogleTilesAssetId: number | string | undefined;
  private readonly tileLatencyTimeoutMs: number;
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
  private disposed = false;

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

  /** Prepares a project off-screen; T032 consumes this for preview-time readiness warming. */
  prewarmProject(project: CesiumStageProject): CesiumStageOperation {
    return this.beginProject(project, false, false);
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
    this.setRendering(true);
    this.setPresentationVisible(true);
    this.activateSafeCompositionTier();
    this.syncTestAttributes();
    return {
      ready: Promise.resolve({
        projectId: project.id,
        tier: 'safe-composition',
        fallback: true,
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
        this.activeTier = tier;
        this.syncTestAttributes();
        return {
          projectId: project.id,
          tier,
          fallback: tier !== 'photorealistic',
          status: 'ready',
        };
      } catch (error) {
        if (!this.isCurrent(operation)) return this.cancelledResult(project);
        const next = nextStageTier(tier);
        if (!next) {
          // `safe-composition` itself is local and must not fail into an empty public frame.
          this.activateSafeCompositionTier();
          this.activeTier = 'safe-composition';
          this.syncTestAttributes();
          return {
            projectId: project.id,
            tier: 'safe-composition',
            fallback: true,
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
    _project: CesiumStageProject,
    operation: number,
  ): Promise<void> {
    const assetId = normalizeIonAssetId(this.ionGoogleTilesAssetId);
    if (!assetId || !this.ionAccessToken) {
      throw new Error('Cesium ion configuration is unavailable from kiosk runtime config.');
    }

    const tileset = await withLatencyTimeout(
      this.tilesetLoader({ assetId, accessToken: this.ionAccessToken }),
      this.tileLatencyTimeoutMs,
    );
    if (!this.isCurrent(operation)) {
      tileset.destroy?.();
      return;
    }

    tileset.show = true;
    this.viewer?.scene.primitives.add(tileset);
    this.tileset = tileset;
    this.fallbackSurface.hide();
    this.viewer?.scene.requestRender?.();
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

  private ensureViewer(): void {
    if (this.viewer || this.disposed) return;
    this.viewer = this.viewerFactory(this.element, DEFAULT_VIEWER_OPTIONS);
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
    this.viewer?.render();
  }

  private clearProjectResources(): void {
    const tileset = this.tileset;
    this.tileset = null;
    if (tileset) {
      tileset.show = false;
      this.viewer?.scene.primitives.remove(tileset);
      tileset.destroy?.();
    }
    this.localFallback?.dispose();
    this.localFallback = null;
  }

  private isCurrent(operation: number): boolean {
    return !this.disposed && operation === this.operation;
  }

  private cancelledResult(project: CesiumStageProject): CesiumStageReady {
    return {
      projectId: project.id,
      tier: this.activeTier ?? initialStageTier(project.geographicFraming),
      fallback: true,
      status: 'cancelled',
    };
  }

  private syncTestAttributes(): void {
    this.element.dataset.projectId = this.activeProject?.id ?? '';
    this.element.dataset.tier = this.activeTier ?? 'uninitialized';
    this.element.dataset.visible = String(this.visible);
    this.element.dataset.rendering = String(this.rendering);
    if (this.activeProject) {
      this.element.dataset.framing = JSON.stringify(this.activeProject.geographicFraming);
    } else {
      delete this.element.dataset.framing;
    }
  }
}
