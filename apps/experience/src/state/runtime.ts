import type { Project } from '@yii/content-schema';
import type { GlobeRendererAdapter } from '../renderers/globe/GlobeRendererAdapter.js';

/** Runtime-only presentation boundary injected after the validated release is loaded. */
export interface GlobePresentation {
  readonly adapter: GlobeRendererAdapter;
  readonly projectIds: readonly string[];
  getProject(projectId: string): Project | undefined;
}

/**
 * Mutable adapter registry kept in machine context. The state machine owns *when* adapter
 * operations run; the app shell owns construction after release validation completes.
 */
export interface ExperienceRuntime {
  readonly globe: GlobePresentation | null;
  setGlobe(globe: GlobePresentation | null): void;
}

export function createExperienceRuntime(): ExperienceRuntime {
  let globe: GlobePresentation | null = null;
  return {
    get globe() {
      return globe;
    },
    setGlobe(nextGlobe) {
      globe = nextGlobe;
    },
  };
}
