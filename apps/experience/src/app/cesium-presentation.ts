import type { Project } from '@yii/content-schema';
import { PreloadManager, type PreloadTarget } from '../content/preload.js';
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

function optionAssetTargets(project: Project): PreloadTarget[] {
  return project.contentOptions.flatMap((option) => [
    ...option.mediaRefs.map((asset) => ({ kind: 'option-media' as const, ref: asset.file })),
    { kind: 'option-voiceover' as const, ref: option.voiceover.file },
  ]);
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
  const stage = new CesiumStageAdapter();
  stage.start(stageElement);
  // The renderer and its safe surface are available synchronously, preserving a visible stage
  // while configuration loads. State-owned preview/handover work waits for this promise before
  // it asks the adapter to choose a streamed or fallback tier.
  const configurationReady = configureFromKiosk(stage);

  const preloadManager = new PreloadManager();
  const prewarm = new CesiumPrewarmController({
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
  const handover = new HandoverController({
    stage: stageElement,
    globe: {
      element: globe.adapter.canvas,
      suspendRendering: () => globe.adapter.stop(),
      resumeRendering: () => {
        globe.adapter.start(stageElement);
      },
      // The machine's category-preview entry action restores the exact selected project after an
      // interruption. This immediate resume preserves the existing canvas meanwhile.
      restorePreview: () => {
        globe.adapter.start(stageElement);
      },
    },
    cesium: stage,
    prewarm,
  });
  let prewarmGeneration = 0;

  return {
    stage,
    prewarm,
    handover,
    configurationReady,
    prewarmPreview(project) {
      const generation = ++prewarmGeneration;
      void configurationReady.then(() => {
        // Category/hover changes can arrive while configuration is still in flight. Only the
        // current preview gets to warm tiles; `CesiumPrewarmController.warm()` cancels the prior
        // real warm after configuration has become available.
        if (generation !== prewarmGeneration) return;
        prewarm.warm(project);
      });
    },
    preloadLandingOptions(project) {
      const targets = optionAssetTargets(project);
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
    reset() {
      prewarmGeneration += 1;
      prewarm.cancel();
      preloadManager.clear();
      stage.reset();
    },
    dispose() {
      prewarmGeneration += 1;
      handover.dispose();
      prewarm.dispose();
      preloadManager.clear();
      stage.dispose();
    },
  };
}
