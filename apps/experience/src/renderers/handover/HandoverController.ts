import gsap from 'gsap';
import { MOTION_DURATIONS_MS } from '../../orchestration/motion-tokens.js';
import type { CesiumStageOperation, CesiumStageProject } from '../cesium/CesiumStageAdapter.js';
import type { CesiumPrewarmHandle, CesiumPrewarmResult } from '../cesium/prewarm.js';
import {
  transitionNowMs,
  type CameraPoseProbe,
  type HandoverTransitionProbe,
  type RendererOwnership,
  type TargetProjectionProbe,
} from './transition-observability.js';
import { geographicPoseToProbe, type GeographicCameraPose } from './geographic-camera-pose.js';

export type HandoverStatus =
  'idle' | 'approaching' | 'covering' | 'revealing' | 'settled' | 'fallback' | 'cancelled';

export interface HandoverResult {
  projectId: string;
  generation: number;
  status: 'completed' | 'fallback' | 'cancelled';
  reason?: string;
}

export interface HandoverOperation {
  completion: Promise<HandoverResult>;
  cancel(): void;
}

/**
 * The minimal GSAP timeline surface owned by a renderer handover. An injectable factory makes
 * choreography tests deterministic while preserving GSAP as the only production motion engine.
 */
export interface HandoverTimeline {
  set(target: HTMLElement, vars: Record<string, unknown>): HandoverTimeline;
  to(target: HTMLElement, vars: Record<string, unknown>): HandoverTimeline;
  call(callback: () => void): HandoverTimeline;
  play(): HandoverTimeline;
  pause(): HandoverTimeline;
  kill(): void;
}

/** The globe port makes the controller the sole owner of the two-renderer overlap window. */
export interface HandoverGlobeStage {
  element: HTMLElement;
  captureGeographicPose(): GeographicCameraPose;
  captureTargetProjection(projectId: string): TargetProjectionProbe | null;
  /** Stops its ticker callback after reveal; never called before the cover/swap window. */
  suspendRendering(): void;
  /** Reattaches its ticker callback during an interrupted forward handover. */
  resumeRendering(): void;
  /** Restores the last preview framing and presentation after cancellation. */
  restorePreview(): void;
}

export interface HandoverCesiumStage {
  matchSourceCamera(pose: GeographicCameraPose, project: CesiumStageProject): boolean;
  setLandingCamera(project: CesiumStageProject): boolean;
  activatePreparedProject(project: CesiumStageProject): CesiumStageOperation;
  showSafeComposition(project: CesiumStageProject): CesiumStageOperation;
  deactivate(): void;
}

export interface HandoverPrewarm {
  warm(project: CesiumStageProject): CesiumPrewarmHandle;
  readinessFor(projectId: string): Promise<CesiumPrewarmResult> | null;
  cancel(): void;
}

export interface HandoverControllerOptions {
  stage: HTMLElement;
  globe: HandoverGlobeStage;
  cesium: HandoverCesiumStage;
  prewarm: HandoverPrewarm;
  durationMs?: number;
  maxCoverDurationMs?: number;
  onStatusChange?: (status: HandoverStatus) => void;
  timelineFactory?: () => HandoverTimeline;
}

interface ActiveHandover {
  project: CesiumStageProject;
  sourcePose: GeographicCameraPose;
  sourceTargetProjection: TargetProjectionProbe | null;
  generation: number;
  timeline: HandoverTimeline;
  completion: Promise<HandoverResult>;
  settled: boolean;
  resolve(result: HandoverResult): void;
}

function createAtmosphericCover(stage: HTMLElement): HTMLDivElement {
  const cover = document.createElement('div');
  cover.dataset.testid = 'handover-controller';
  cover.dataset.status = 'idle';
  cover.setAttribute('aria-hidden', 'true');
  Object.assign(cover.style, {
    position: 'absolute',
    inset: '0',
    zIndex: '3',
    pointerEvents: 'none',
    opacity: '0',
    background:
      'radial-gradient(ellipse at 50% 50%, rgba(155, 205, 221, 0.98) 0%, rgba(71, 124, 151, 0.98) 42%, rgba(16, 40, 56, 1) 100%)',
  });
  stage.append(cover);
  return cover;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withDeadline<T>(promise: Promise<T>, remainingMs: number): Promise<T> {
  if (remainingMs <= 0) return Promise.reject(new Error('Handover cover watchdog elapsed.'));
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Handover cover watchdog elapsed.')),
      remainingMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Owns the only legal period where both renderers draw: from full cover through reveal. The
 * cover never waits unboundedly for streamed tiles; readiness failure/latency reveals a local
 * safe composition instead. Machine wiring sends its generation-checked result in T035.
 */
export class HandoverController {
  readonly cover: HTMLDivElement;

  private readonly globe: HandoverGlobeStage;
  private readonly cesium: HandoverCesiumStage;
  private readonly prewarm: HandoverPrewarm;
  private readonly durationMs: number;
  private readonly maxCoverDurationMs: number;
  private readonly onStatusChange: ((status: HandoverStatus) => void) | undefined;
  private readonly timelineFactory: () => HandoverTimeline;
  private active: ActiveHandover | null = null;
  private generation = 0;
  private status: HandoverStatus = 'idle';
  private progress = 0;
  private ownership: RendererOwnership = 'globe';
  private lastProjectId: string | null = null;
  private lastSourceCamera: CameraPoseProbe | null = null;
  private lastSourceTargetProjection: TargetProjectionProbe | null = null;
  private startedAtMs: number | null = null;
  private statusChangedAtMs = transitionNowMs();
  private progressChangedAtMs = this.statusChangedAtMs;
  private disposed = false;

  constructor(options: HandoverControllerOptions) {
    this.globe = options.globe;
    this.cesium = options.cesium;
    this.prewarm = options.prewarm;
    this.durationMs = options.durationMs ?? MOTION_DURATIONS_MS.handover;
    this.maxCoverDurationMs = options.maxCoverDurationMs ?? 1_000;
    this.onStatusChange = options.onStatusChange;
    this.timelineFactory =
      options.timelineFactory ??
      (() => gsap.timeline({ paused: true }) as unknown as HandoverTimeline);
    this.cover = createAtmosphericCover(options.stage);
    this.syncProbeAttributes();
  }

  get currentGeneration(): number {
    return this.generation;
  }

  get currentStatus(): HandoverStatus {
    return this.status;
  }

  get transitionProbe(): HandoverTransitionProbe {
    return {
      projectId: this.active?.project.id ?? this.lastProjectId,
      sourceCamera: this.lastSourceCamera,
      sourceTargetProjection: this.lastSourceTargetProjection,
      status: this.status,
      progress: this.progress,
      coverOpacity: styleOpacity(this.cover),
      ownership: this.ownership,
      startedAtMs: this.startedAtMs,
      statusChangedAtMs: this.statusChangedAtMs,
      progressChangedAtMs: this.progressChangedAtMs,
    };
  }

  startForward(project: CesiumStageProject): HandoverOperation {
    this.cancel();
    const generation = ++this.generation;
    const sourcePose = this.globe.captureGeographicPose();
    const sourceTargetProjection = this.globe.captureTargetProjection(project.id);
    const warm = this.prewarm.readinessFor(project.id) ?? this.prewarm.warm(project).ready;
    let resolve!: (result: HandoverResult) => void;
    const completion = new Promise<HandoverResult>((resolveCompletion) => {
      resolve = resolveCompletion;
    });
    const timeline = this.timelineFactory();
    const active: ActiveHandover = {
      project,
      sourcePose,
      sourceTargetProjection,
      generation,
      timeline,
      completion,
      settled: false,
      resolve,
    };
    this.active = active;
    this.lastProjectId = project.id;
    this.lastSourceCamera = geographicPoseToProbe(sourcePose);
    this.lastSourceTargetProjection = sourceTargetProjection;
    this.startedAtMs = transitionNowMs();
    this.ownership = 'globe';
    this.setProgress(active, 0);
    this.setStatus('approaching');

    const approachDuration = (this.durationMs * 0.45) / 1_000;
    const coverDuration = (this.durationMs * 0.25) / 1_000;
    timeline
      .set(this.cover, { opacity: 0 })
      .set(this.globe.element, { opacity: 1, scale: 1, transformOrigin: '50% 50%' })
      .to(this.globe.element, {
        scale: 1.08,
        duration: approachDuration,
        ease: 'power2.inOut',
        onUpdate: () => {
          const scale = gsapNumber(this.globe.element, 'scale', 1);
          this.setProgress(active, ((scale - 1) / 0.08) * 0.45);
        },
      })
      .to(this.cover, {
        opacity: 1,
        duration: coverDuration,
        ease: 'sine.in',
        onUpdate: () => {
          this.setProgress(active, 0.45 + styleOpacity(this.cover) * 0.25);
        },
      })
      .call(() => {
        if (!this.isCurrent(active)) return;
        this.setProgress(active, 0.7);
        this.setStatus('covering');
        timeline.pause();
        void this.swapAtFullCover(active, warm);
      })
      .play();

    return {
      completion,
      cancel: () => {
        if (this.isCurrent(active)) this.cancel();
      },
    };
  }

  /** Idempotent interruption path: restores the globe and clears every handover-owned resource. */
  cancel(): void {
    const active = this.active;
    if (!active) return;
    this.active = null;
    active.timeline.kill();
    this.prewarm.cancel();
    this.cesium.deactivate();
    this.globe.resumeRendering();
    this.globe.restorePreview();
    gsap.set(this.cover, { opacity: 0 });
    gsap.set(this.globe.element, { opacity: 1, scale: 1 });
    this.ownership = 'globe';
    this.setStatus('cancelled');
    this.settle(active, {
      projectId: active.project.id,
      generation: active.generation,
      status: 'cancelled',
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancel();
    this.ownership = 'none';
    this.cover.remove();
    this.disposed = true;
  }

  private async swapAtFullCover(
    active: ActiveHandover,
    warm: Promise<CesiumPrewarmResult>,
  ): Promise<void> {
    const coverStartedAt = Date.now();
    try {
      const warmResult = await withDeadline(warm, this.remainingCoverBudget(coverStartedAt));
      if (!this.isCurrent(active)) return;
      if (warmResult.status !== 'ready') {
        await this.revealFallback(active, `prewarm ${warmResult.status}`);
        return;
      }

      if (!this.cesium.matchSourceCamera(active.sourcePose, active.project)) {
        await this.revealFallback(active, 'source camera matching unavailable');
        return;
      }
      if (!this.cesium.setLandingCamera(active.project)) {
        await this.revealFallback(active, 'landing camera mapping unavailable');
        return;
      }

      const stageOperation = this.cesium.activatePreparedProject(active.project);
      const stageResult = await withDeadline(
        stageOperation.ready,
        this.remainingCoverBudget(coverStartedAt),
      );
      if (!this.isCurrent(active)) return;
      if (stageResult.status !== 'ready') {
        await this.revealFallback(active, `stage activation ${stageResult.status}`);
        return;
      }

      this.ownership = 'overlap';
      this.syncProbeAttributes();
      this.beginReveal(active, {
        projectId: active.project.id,
        generation: active.generation,
        status: warmResult.fallback || stageResult.fallback ? 'fallback' : 'completed',
      });
    } catch (error) {
      if (!this.isCurrent(active)) return;
      await this.revealFallback(active, describeError(error));
    }
  }

  private async revealFallback(active: ActiveHandover, reason: string): Promise<void> {
    this.setStatus('fallback');
    try {
      const fallbackOperation = this.cesium.showSafeComposition(active.project);
      const fallbackResult = await fallbackOperation.ready;
      if (!this.isCurrent(active)) return;
      if (fallbackResult.status !== 'ready') {
        this.restoreGlobeAfterFallbackFailure(active, reason);
        return;
      }
      this.ownership = 'fallback';
      this.syncProbeAttributes();
      this.beginReveal(active, {
        projectId: active.project.id,
        generation: active.generation,
        status: 'fallback',
        reason,
      });
    } catch (error) {
      if (!this.isCurrent(active)) return;
      this.restoreGlobeAfterFallbackFailure(active, `${reason}; ${describeError(error)}`);
    }
  }

  private restoreGlobeAfterFallbackFailure(active: ActiveHandover, reason: string): void {
    this.cesium.deactivate();
    this.globe.resumeRendering();
    this.globe.restorePreview();
    this.ownership = 'globe';
    this.syncProbeAttributes();
    this.beginReveal(active, {
      projectId: active.project.id,
      generation: active.generation,
      status: 'cancelled',
      reason,
    });
  }

  private beginReveal(active: ActiveHandover, result: HandoverResult): void {
    if (!this.isCurrent(active)) return;
    if (result.status === 'cancelled') this.ownership = 'globe';
    this.setStatus(result.status === 'fallback' ? 'fallback' : 'revealing');
    active.timeline
      .to(this.cover, {
        opacity: 0,
        duration: (this.durationMs * 0.3) / 1_000,
        ease: 'sine.out',
        onUpdate: () => {
          this.setProgress(active, 0.7 + (1 - styleOpacity(this.cover)) * 0.3);
        },
      })
      .call(() => {
        if (!this.isCurrent(active)) return;
        if (result.status !== 'cancelled') this.globe.suspendRendering();
        this.setProgress(active, 1);
        this.ownership =
          result.status === 'cancelled'
            ? 'globe'
            : result.status === 'fallback'
              ? 'fallback'
              : 'cesium';
        this.setStatus(result.status === 'cancelled' ? 'cancelled' : 'settled');
        this.settle(active, result);
      })
      .play();
  }

  private remainingCoverBudget(coverStartedAt: number): number {
    return this.maxCoverDurationMs - (Date.now() - coverStartedAt);
  }

  private isCurrent(active: ActiveHandover): boolean {
    return !this.disposed && this.active === active && active.generation === this.generation;
  }

  private setStatus(status: HandoverStatus): void {
    if (this.status !== status) this.statusChangedAtMs = transitionNowMs();
    this.status = status;
    this.syncProbeAttributes();
    this.onStatusChange?.(status);
  }

  private setProgress(active: ActiveHandover, progress: number): void {
    if (!this.isCurrent(active)) return;
    const next = Math.max(0, Math.min(1, progress));
    if (Math.abs(next - this.progress) > Number.EPSILON) {
      this.progress = next;
      this.progressChangedAtMs = transitionNowMs();
    }
    this.syncProbeAttributes();
  }

  private syncProbeAttributes(): void {
    this.cover.dataset.status = this.status;
    this.cover.dataset.progress = String(this.progress);
    this.cover.dataset.ownership = this.ownership;
    this.cover.dataset.projectId = this.active?.project.id ?? this.lastProjectId ?? '';
    this.cover.dataset.statusChangedAtMs = String(this.statusChangedAtMs);
    this.cover.dataset.progressChangedAtMs = String(this.progressChangedAtMs);
    if (this.startedAtMs === null) {
      delete this.cover.dataset.startedAtMs;
    } else {
      this.cover.dataset.startedAtMs = String(this.startedAtMs);
    }
  }

  private settle(active: ActiveHandover, result: HandoverResult): void {
    if (active.settled) return;
    active.settled = true;
    if (this.active === active) this.active = null;
    active.resolve(result);
  }
}

function styleOpacity(element: HTMLElement): number {
  const opacity = Number.parseFloat(element.style.opacity);
  return Number.isFinite(opacity) ? opacity : 0;
}

function gsapNumber(element: HTMLElement, property: string, fallback: number): number {
  const value = Number(gsap.getProperty(element, property));
  return Number.isFinite(value) ? value : fallback;
}
