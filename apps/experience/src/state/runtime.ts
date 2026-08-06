import type { Project } from '@yii/content-schema';
import type { GlobeRendererAdapter } from '../renderers/globe/GlobeRendererAdapter.js';
import type { CesiumStageAdapter } from '../renderers/cesium/CesiumStageAdapter.js';
import type { CesiumPrewarmController } from '../renderers/cesium/prewarm.js';
import type { HandoverController } from '../renderers/handover/HandoverController.js';

/** Runtime-only presentation boundary injected after the validated release is loaded. */
export interface GlobePresentation {
  readonly adapter: GlobeRendererAdapter;
  readonly projectIds: readonly string[];
  getProject(projectId: string): Project | undefined;
  /** Package-relative asset resolver bound to this validated release version. */
  resolveAssetUrl(packageRelativePath: string): string;
}

/** Runtime-only geographic resources owned by the renderer shell, not by React or the machine. */
export interface CesiumPresentation {
  readonly stage: CesiumStageAdapter;
  readonly prewarm: CesiumPrewarmController;
  readonly handover: HandoverController;
  preloadLandingOptions(project: Project): { cancel(): void };
  reset(): void;
  dispose(): void;
}

/**
 * Mutable adapter registry kept in machine context. The state machine owns *when* adapter
 * operations run; the app shell owns construction after release validation completes.
 */
export interface ExperienceRuntime {
  readonly globe: GlobePresentation | null;
  readonly cesium: CesiumPresentation | null;
  /** Resolves when the browser-owned Cesium presentation is ready, or null if it cannot start. */
  readonly cesiumReady: Promise<CesiumPresentation | null> | null;
  setGlobe(globe: GlobePresentation | null): void;
  setCesium(cesium: CesiumPresentation | null): void;
  setCesiumReady(ready: Promise<CesiumPresentation | null> | null): void;
}

export function createExperienceRuntime(): ExperienceRuntime {
  let globe: GlobePresentation | null = null;
  let cesium: CesiumPresentation | null = null;
  let cesiumReady: Promise<CesiumPresentation | null> | null = null;
  return {
    get globe() {
      return globe;
    },
    get cesium() {
      return cesium;
    },
    get cesiumReady() {
      return cesiumReady;
    },
    setGlobe(nextGlobe) {
      globe = nextGlobe;
    },
    setCesium(nextCesium) {
      cesium = nextCesium;
    },
    setCesiumReady(nextReady) {
      cesiumReady = nextReady;
    },
  };
}
