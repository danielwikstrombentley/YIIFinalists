import gsap from 'gsap';
import { MOTION_DURATIONS_MS } from '../../orchestration/motion-tokens.js';
import type { CesiumStageOperation, CesiumStageProject } from '../cesium/CesiumStageAdapter.js';
import type { CesiumPrewarmHandle, CesiumPrewarmResult } from '../cesium/prewarm.js';

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

/** The globe port makes the controller the sole owner of the two-renderer overlap window. */
export interface HandoverGlobeStage {
  element: HTMLElement;
  /** Stops its ticker callback after reveal; never called before the cover/swap window. */
  suspendRendering(): void;
  /** Reattaches its ticker callback during an interrupted forward handover. */
  resumeRendering(): void;
  /** Restores the last preview framing and presentation after cancellation. */
  restorePreview(): void;
}

export interface HandoverCesiumStage {
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
}

interface ActiveHandover {
  project: CesiumStageProject;
  generation: number;
  timeline: gsap.core.Timeline;
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
  private active: ActiveHandover | null = null;
  private generation = 0;
  private status: HandoverStatus = 'idle';
  private disposed = false;

  constructor(options: HandoverControllerOptions) {
    this.globe = options.globe;
    this.cesium = options.cesium;
    this.prewarm = options.prewarm;
    this.durationMs = options.durationMs ?? MOTION_DURATIONS_MS.handover;
    this.maxCoverDurationMs = options.maxCoverDurationMs ?? 1_000;
    this.onStatusChange = options.onStatusChange;
    this.cover = createAtmosphericCover(options.stage);
  }

  get currentGeneration(): number {
    return this.generation;
  }

  get currentStatus(): HandoverStatus {
    return this.status;
  }

  startForward(project: CesiumStageProject): HandoverOperation {
    this.cancel();
    const generation = ++this.generation;
    const warm = this.prewarm.readinessFor(project.id) ?? this.prewarm.warm(project).ready;
    let resolve!: (result: HandoverResult) => void;
    const completion = new Promise<HandoverResult>((resolveCompletion) => {
      resolve = resolveCompletion;
    });
    const timeline = gsap.timeline({ paused: true });
    const active: ActiveHandover = {
      project,
      generation,
      timeline,
      completion,
      settled: false,
      resolve,
    };
    this.active = active;
    this.setStatus('approaching');

    const approachDuration = (this.durationMs * 0.45) / 1_000;
    const coverDuration = (this.durationMs * 0.25) / 1_000;
    timeline
      .set(this.cover, { opacity: 0 })
      .set(this.globe.element, { opacity: 1, scale: 1, transformOrigin: '50% 50%' })
      .to(this.globe.element, { scale: 1.08, duration: approachDuration, ease: 'power2.inOut' })
      .to(this.cover, { opacity: 1, duration: coverDuration, ease: 'sine.in' })
      .call(() => {
        if (!this.isCurrent(active)) return;
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
    this.beginReveal(active, {
      projectId: active.project.id,
      generation: active.generation,
      status: 'cancelled',
      reason,
    });
  }

  private beginReveal(active: ActiveHandover, result: HandoverResult): void {
    if (!this.isCurrent(active)) return;
    this.setStatus(result.status === 'fallback' ? 'fallback' : 'revealing');
    active.timeline
      .to(this.cover, {
        opacity: 0,
        duration: (this.durationMs * 0.3) / 1_000,
        ease: 'sine.out',
      })
      .call(() => {
        if (!this.isCurrent(active)) return;
        if (result.status !== 'cancelled') this.globe.suspendRendering();
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
    this.status = status;
    this.cover.dataset.status = status;
    this.onStatusChange?.(status);
  }

  private settle(active: ActiveHandover, result: HandoverResult): void {
    if (active.settled) return;
    active.settled = true;
    if (this.active === active) this.active = null;
    active.resolve(result);
  }
}
