import type { Project } from '@yii/content-schema';
import { contentOptionPreloadTargets, PreloadManager } from '../content/preload.js';
import { CesiumStageAdapter } from '../renderers/cesium/CesiumStageAdapter.js';
import { CesiumPrewarmController } from '../renderers/cesium/prewarm.js';
import { HandoverController } from '../renderers/handover/HandoverController.js';
import type { CesiumPresentation, GlobePresentation } from '../state/runtime.js';

interface KioskCesiumConfig {
  ionAccessToken?: string;
  ionGoogleTilesAssetId?: string;
}

function landingAssetPaths(project: Project): string[] {
  const { boundaries = [], routes = [], regions = [] } = project.geographicFraming;
  return [...boundaries, ...routes, ...regions];
}

async function preloadPackageAssets(
  paths: readonly string[],
  resolveAssetUrl: (path: string) => string,
  signal: AbortSignal,
): Promise<void> {
  await Promise.all(
    paths.map(async (path) => {
      if (signal.aborted) throw new Error('Package asset preload was cancelled.');
      const response = await fetch(resolveAssetUrl(path), { signal });
      if (!response.ok) {
        throw new Error(`Unable to preload package asset "${path}": HTTP ${response.status}.`);
      }
      await response.arrayBuffer();
    }),
  );
}

function isKioskCesiumConfig(value: unknown): value is KioskCesiumConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Record<string, unknown>;
  return (
    (config.ionAccessToken === undefined || typeof config.ionAccessToken === 'string') &&
    (config.ionGoogleTilesAssetId === undefined || typeof config.ionGoogleTilesAssetId === 'string')
  );
}

/**
 * Acquires Cesium credentials only from the event-local kiosk sidecar. The values are never
 * embedded in the application bundle; a failed lookup simply leaves the adapter on its approved
 * local fallback tiers.
 */
async function configureFromKiosk(stage: CesiumStageAdapter): Promise<void> {
  try {
    const response = await fetch('/runtime-config.json', { cache: 'no-store' });
    if (!response.ok) return;
    const config = (await response.json()) as unknown;
    if (isKioskCesiumConfig(config)) stage.configureIon(config);
  } catch {
    // The adapter's local fallback remains available during an offline sidecar/config failure.
  }
}

/**
 * Builds the renderer-owned geographic presentation boundary after the validated release and
 * globe have mounted. The machine decides when each operation runs; this module owns only the
 * DOM/GPU/preload resources and exposes cancellable handles to that machine.
 */
export function createCesiumPresentation(
  stageElement: HTMLElement,
  globe: GlobePresentation,
): CesiumPresentation {
  let stage!: CesiumStageAdapter;
  let preloadManager!: PreloadManager;
  let prewarm!: CesiumPrewarmController;
  let handover!: HandoverController;
  let configurationReady!: Promise<void>;
  let prewarmGeneration = 0;
  let disposed = false;

  const initialize = (): void => {
    stage = new CesiumStageAdapter();
    stage.start(stageElement);
    // The renderer and its safe surface are available synchronously, preserving a visible stage
    // while configuration loads. State-owned preview/handover work waits for this promise before
    // it asks the adapter to choose a streamed or fallback tier.
    configurationReady = configureFromKiosk(stage);
    preloadManager = new PreloadManager();
    prewarm = new CesiumPrewarmController({
      stage,
      preloadManager,
      landingAssetPreloader: {
        preload(project, signal) {
          return preloadPackageAssets(
            landingAssetPaths(project as Project),
            globe.resolveAssetUrl,
            signal,
          );
        },
      },
    });
    handover = new HandoverController({
      stage: stageElement,
      globe: {
        element: globe.adapter.canvas,
        captureGeographicPose: () => globe.adapter.captureGeographicPose(),
        captureTargetProjection: (projectId) =>
          globe.adapter.transitionProbe(projectId).targetProjection,
        applyGeographicPose: (pose) => globe.adapter.applyGeographicPose(pose),
        beginExternalFrameControl: () => globe.adapter.beginExternalFrameControl(),
        suspendRendering: () => globe.adapter.stop(),
        resumeRendering: () => {
          globe.adapter.start(stageElement);
        },
        // The machine's category-preview entry action restores the exact selected project after
        // an interruption. This immediate resume preserves the existing canvas meanwhile.
        restorePreview: () => {
          globe.adapter.start(stageElement);
          globe.adapter.restorePreviewCamera();
        },
      },
      cesium: stage,
      prewarm,
    });
  };

  const release = (): void => {
    prewarmGeneration += 1;
    handover.dispose();
    prewarm.dispose();
    preloadManager.clear();
    stage.dispose();
  };

  initialize();

  return {
    get stage() {
      return stage;
    },
    get prewarm() {
      return prewarm;
    },
    get handover() {
      return handover;
    },
    get configurationReady() {
      return configurationReady;
    },
    prewarmPreview(project) {
      const generation = ++prewarmGeneration;
      const ready = configurationReady;
      void ready.then(() => {
        // Category/hover changes can arrive while configuration is still in flight. Only the
        // current preview gets to warm tiles; `CesiumPrewarmController.warm()` cancels the prior
        // real warm after configuration has become available.
        if (disposed || generation !== prewarmGeneration || ready !== configurationReady) return;
        prewarm.warm(project);
      });
    },
    preloadLandingOptions(project) {
      const targets = contentOptionPreloadTargets(project.contentOptions);
      for (const target of targets) {
        void preloadManager
          .preload(target, (signal) =>
            preloadPackageAssets([target.ref], globe.resolveAssetUrl, signal),
          )
          .catch(() => {
            // Option media failures are represented by their declared runtime fallback later;
            // preloading itself must never block entry to a landing composition.
          });
      }
      return {
        cancel() {
          for (const target of targets) preloadManager.cancel(target);
        },
      };
    },
    clearPreloadCache() {
      prewarm.cancel();
      preloadManager.clear();
    },
    rebuild() {
      if (disposed) return;
      release();
      initialize();
    },
    reset() {
      if (disposed) return;
      prewarmGeneration += 1;
      prewarm.cancel();
      preloadManager.clear();
      stage.reset();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      release();
    },
  };
}
