import { PreloadManager, type PreloadTarget } from '../../content/preload.js';
import type { CesiumStageOperation, CesiumStageProject } from './CesiumStageAdapter.js';
import type { CesiumStageTier } from './fallback-tiers.js';

export interface CesiumPrewarmStage {
  prewarmProject(project: CesiumStageProject): CesiumStageOperation;
}

export interface LandingAssetPreloader {
  /** Loads package-local landing assets only; a cancellation signal aborts stale retarget work. */
  preload(project: CesiumStageProject, signal: AbortSignal): Promise<void>;
}

export interface CesiumPrewarmResult {
  projectId: string;
  tier: CesiumStageTier;
  fallback: boolean;
  meaningfulFrameReady: boolean;
  landingAssetsReady: boolean;
  status: 'ready' | 'cancelled' | 'failed';
  error?: unknown;
}

export interface CesiumPrewarmHandle {
  ready: Promise<CesiumPrewarmResult>;
  cancel(): void;
}

interface ActivePrewarm {
  project: CesiumStageProject;
  projectId: string;
  target: PreloadTarget;
  stageOperation: CesiumStageOperation;
  ready: Promise<CesiumPrewarmResult>;
  settled: boolean;
  resolve(result: CesiumPrewarmResult): void;
}

/**
 * Prepares the likely-next landing off-screen while the globe remains authoritative. This class
 * owns only warming resources; HandoverController later consumes `readinessFor()` to decide when
 * the cover may safely reveal the Cesium stage.
 */
export class CesiumPrewarmController {
  private readonly stage: CesiumPrewarmStage;
  private readonly preloadManager: PreloadManager;
  private readonly landingAssetPreloader: LandingAssetPreloader;
  private active: ActivePrewarm | null = null;
  private readonly readiness = new Map<string, Promise<CesiumPrewarmResult>>();

  constructor(options: {
    stage: CesiumPrewarmStage;
    preloadManager: PreloadManager;
    landingAssetPreloader: LandingAssetPreloader;
  }) {
    this.stage = options.stage;
    this.preloadManager = options.preloadManager;
    this.landingAssetPreloader = options.landingAssetPreloader;
  }

  warm(project: CesiumStageProject): CesiumPrewarmHandle {
    if (this.active?.projectId === project.id) {
      return { ready: this.active.ready, cancel: () => this.cancelProject(project.id) };
    }

    this.cancel();
    const target: PreloadTarget = { kind: 'project-landing', ref: project.id };
    const stageOperation = this.stage.prewarmProject(project);
    const landingAssets = this.preloadManager.preload(target, (signal) =>
      this.landingAssetPreloader.preload(project, signal),
    );

    let resolve!: (result: CesiumPrewarmResult) => void;
    const ready = new Promise<CesiumPrewarmResult>((resolveReady) => {
      resolve = resolveReady;
    });
    const active: ActivePrewarm = {
      project,
      projectId: project.id,
      target,
      stageOperation,
      ready,
      settled: false,
      resolve,
    };
    this.active = active;
    this.readiness.set(project.id, ready);

    void Promise.all([stageOperation.ready, landingAssets]).then(
      ([stageReady]) => {
        if (this.active !== active) return;
        if (stageReady.status === 'cancelled') {
          this.settle(active, {
            projectId: project.id,
            tier: stageReady.tier,
            fallback: stageReady.fallback,
            meaningfulFrameReady: false,
            landingAssetsReady: false,
            status: 'cancelled',
          });
          return;
        }
        this.settle(active, {
          projectId: project.id,
          tier: stageReady.tier,
          fallback: stageReady.fallback,
          meaningfulFrameReady: stageReady.meaningfulFrameReady,
          landingAssetsReady: true,
          status: 'ready',
        });
      },
      (error: unknown) => {
        if (this.active !== active) return;
        this.settle(active, {
          projectId: project.id,
          tier: project.geographicFraming.tileTier,
          fallback: true,
          meaningfulFrameReady: false,
          landingAssetsReady: false,
          status: 'failed',
          error,
        });
      },
    );

    return { ready, cancel: () => this.cancelProject(project.id) };
  }

  /** The handover boundary asks for the exact project readiness it is about to reveal. */
  readinessFor(projectId: string): Promise<CesiumPrewarmResult> | null {
    return this.readiness.get(projectId) ?? null;
  }

  /** Cancels any current preview warm, including its tileset and package-local asset decode. */
  cancel(): void {
    const active = this.active;
    if (!active) return;
    this.active = null;
    active.stageOperation.cancel();
    this.preloadManager.cancel(active.target);
    this.readiness.delete(active.projectId);
    this.settle(active, {
      projectId: active.projectId,
      tier: active.project.geographicFraming.tileTier,
      fallback: true,
      meaningfulFrameReady: false,
      landingAssetsReady: false,
      status: 'cancelled',
    });
  }

  dispose(): void {
    this.cancel();
    this.readiness.clear();
  }

  private cancelProject(projectId: string): void {
    if (this.active?.projectId === projectId) this.cancel();
  }

  private settle(active: ActivePrewarm, result: CesiumPrewarmResult): void {
    if (active.settled) return;
    active.settled = true;
    active.resolve(result);
  }
}
