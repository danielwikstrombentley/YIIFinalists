import gsap from 'gsap';
import {
  HANDOVER_FLIGHT_PROGRESS,
  MOTION_DURATIONS_MS,
} from '../../orchestration/motion-tokens.js';
import { sharedTicker, type Ticker } from '../../orchestration/ticker.js';
import type { CameraFlightHandle } from '../cesium/camera-flight.js';
import type { CesiumStageOperation, CesiumStageProject } from '../cesium/CesiumStageAdapter.js';
import type { CesiumPrewarmHandle, CesiumPrewarmResult } from '../cesium/prewarm.js';
import {
  compareCameraPoseProbes,
  transitionNowMs,
  type CameraPoseComparison,
  type CameraPoseProbe,
  type HandoverTransitionProbe,
  type RendererOwnership,
  type TargetProjectionProbe,
} from './transition-observability.js';
import { geographicPoseToProbe, type GeographicCameraPose } from './geographic-pose-bridge.js';

export type HandoverStatus =
  | 'idle'
  | 'approaching'
  | 'flying'
  | 'blending'
  | 'covering'
  | 'revealing'
  | 'settled'
  | 'fallback'
  | 'cancelled';

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
  set(target: object, vars: Record<string, unknown>): HandoverTimeline;
  to(target: object, vars: Record<string, unknown>, position?: string | number): HandoverTimeline;
  call(callback: () => void): HandoverTimeline;
  play(): HandoverTimeline;
  pause(): HandoverTimeline;
  kill(): void;
}

export interface HandoverFrameControl {
  render(deltaSeconds: number): void;
  release(): void;
}

/** The globe port makes the controller the sole owner of the two-renderer overlap window. */
export interface HandoverGlobeStage {
  element: HTMLElement;
  captureGeographicPose(): GeographicCameraPose;
  captureTargetProjection(projectId: string): TargetProjectionProbe | null;
  applyGeographicPose(pose: GeographicCameraPose): void;
  beginExternalFrameControl(): HandoverFrameControl;
  /** Stops its ticker callback after reveal; never called before the cover/swap window. */
  suspendRendering(): void;
  /** Reattaches its ticker callback during an interrupted forward handover. */
  resumeRendering(): void;
  /** Restores the last preview framing and presentation after cancellation. */
  restorePreview(): void;
}

export interface HandoverCesiumStage {
  element: HTMLElement;
  matchSourceCamera(pose: GeographicCameraPose, project: CesiumStageProject): boolean;
  setLandingCamera(project: CesiumStageProject): boolean;
  activatePreparedProject(project: CesiumStageProject, visible?: boolean): CesiumStageOperation;
  showSafeComposition(project: CesiumStageProject): CesiumStageOperation;
  setPresentationVisible(visible: boolean): void;
  captureGeographicPose(): GeographicCameraPose | null;
  captureTargetProjection(): TargetProjectionProbe | null;
  captureTargetRange(): number | null;
  startLandingFlight(project: CesiumStageProject, durationMs: number): CameraFlightHandle | null;
  /** Optional while legacy/fallback test ports are upgraded; enables the continuous reverse path. */
  startGeographicFlight?(pose: GeographicCameraPose, durationMs: number): CameraFlightHandle | null;
  targetRangeForPose?(pose: GeographicCameraPose, project: CesiumStageProject): number | null;
  beginExternalFrameControl(): HandoverFrameControl;
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
  flightDurationMs?: number;
  maxCoverDurationMs?: number;
  ticker?: Ticker;
  onStatusChange?: (status: HandoverStatus) => void;
  timelineFactory?: () => HandoverTimeline;
}

interface ActiveHandover {
  direction: 'forward' | 'reverse';
  project: CesiumStageProject;
  sourcePose: GeographicCameraPose;
  sourceTargetProjection: TargetProjectionProbe | null;
  generation: number;
  timeline: HandoverTimeline;
  completion: Promise<HandoverResult>;
  flight: CameraFlightHandle | null;
  globeFrames: HandoverFrameControl | null;
  cesiumFrames: HandoverFrameControl | null;
  unregisterCombinedRenderer: (() => void) | null;
  mirroring: boolean;
  visualComplete: boolean;
  flightComplete: boolean;
  fallbackReason: string | null;
  sourceTargetRange: number | null;
  reverseDestinationTargetRange: number | null;
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
    '--handover-target-x': '50%',
    '--handover-target-y': '50%',
    background:
      'radial-gradient(circle at var(--handover-target-x) var(--handover-target-y), rgba(184, 228, 239, 0.98) 0%, rgba(87, 153, 180, 0.98) 28%, rgba(34, 76, 101, 0.99) 58%, rgb(16, 40, 56) 100%)',
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
  private readonly flightDurationMs: number;
  private readonly maxCoverDurationMs: number;
  private readonly ticker: Ticker;
  private readonly onStatusChange: ((status: HandoverStatus) => void) | undefined;
  private readonly timelineFactory: () => HandoverTimeline;
  private active: ActiveHandover | null = null;
  private generation = 0;
  private status: HandoverStatus = 'idle';
  private progress = 0;
  private ownership: RendererOwnership = 'globe';
  private lastProjectId: string | null = null;
  private lastSourcePose: GeographicCameraPose | null = null;
  private lastSourceCamera: CameraPoseProbe | null = null;
  private lastSourceTargetProjection: TargetProjectionProbe | null = null;
  private startedAtMs: number | null = null;
  private statusChangedAtMs = transitionNowMs();
  private progressChangedAtMs = this.statusChangedAtMs;
  private liveAlignmentSamples = 0;
  private maximumLiveCameraDelta: CameraPoseComparison | null = null;
  private maximumLiveTargetProjectionDelta: number | null = null;
  private disposed = false;

  constructor(options: HandoverControllerOptions) {
    this.globe = options.globe;
    this.cesium = options.cesium;
    this.prewarm = options.prewarm;
    this.durationMs = options.durationMs ?? MOTION_DURATIONS_MS.handover;
    this.flightDurationMs = options.flightDurationMs ?? MOTION_DURATIONS_MS.projectEntryFlight;
    this.maxCoverDurationMs = options.maxCoverDurationMs ?? 1_000;
    this.ticker = options.ticker ?? sharedTicker;
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
      liveAlignmentSamples: this.liveAlignmentSamples,
      maximumLiveCameraDelta: this.maximumLiveCameraDelta,
      maximumLiveTargetProjectionDelta: this.maximumLiveTargetProjectionDelta,
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
      direction: 'forward',
      project,
      sourcePose,
      sourceTargetProjection,
      generation,
      timeline,
      completion,
      flight: null,
      globeFrames: null,
      cesiumFrames: null,
      unregisterCombinedRenderer: null,
      mirroring: false,
      visualComplete: false,
      flightComplete: false,
      fallbackReason: null,
      sourceTargetRange: null,
      reverseDestinationTargetRange: null,
      settled: false,
      resolve,
    };
    this.active = active;
    this.lastProjectId = project.id;
    this.lastSourcePose = sourcePose;
    this.lastSourceCamera = geographicPoseToProbe(sourcePose);
    this.lastSourceTargetProjection = sourceTargetProjection;
    this.startedAtMs = transitionNowMs();
    this.liveAlignmentSamples = 0;
    this.maximumLiveCameraDelta = null;
    this.maximumLiveTargetProjectionDelta = null;
    this.ownership = 'globe';
    this.setProgress(active, 0);
    this.setStatus('approaching');
    gsap.set(this.cover, { opacity: 0 });
    gsap.set(this.globe.element, { opacity: 1, scale: 1, transformOrigin: '50% 50%' });
    gsap.set(this.cesium.element, { opacity: 0 });
    this.positionAtmosphericVeil(sourceTargetProjection);
    this.cesium.setPresentationVisible(false);
    void this.beginPreparedForward(active, warm);

    return {
      completion,
      cancel: () => {
        if (this.isCurrent(active)) this.cancel();
      },
    };
  }

  /**
   * Reverses a completed project entry back to the exact globe preview captured before entry.
   * The normal path mirrors the native Cesium flight into Three under the same shared ticker;
   * a covered fallback preserves a non-blank return when that camera path is unavailable.
   */
  startReverse(project: CesiumStageProject): HandoverOperation {
    this.cancel();
    const generation = ++this.generation;
    const sourcePose = this.lastProjectId === project.id ? this.lastSourcePose : null;

    if (!sourcePose) {
      // A reverse request without a completed forward source cannot maintain camera continuity.
      // Restore the rig's own safe preview rather than trapping navigation or exposing Cesium.
      this.globe.resumeRendering();
      this.globe.restorePreview();
      this.cesium.deactivate();
      gsap.set(this.cover, { opacity: 0 });
      gsap.set(this.globe.element, { opacity: 1, scale: 1, transformOrigin: '50% 50%' });
      gsap.set(this.cesium.element, { opacity: 0 });
      this.ownership = 'globe';
      this.setStatus('fallback');
      return {
        completion: Promise.resolve({
          projectId: project.id,
          generation,
          status: 'fallback',
          reason: 'No captured globe preview pose is available for reverse handover.',
        }),
        cancel: () => {},
      };
    }

    let resolve!: (result: HandoverResult) => void;
    const completion = new Promise<HandoverResult>((resolveCompletion) => {
      resolve = resolveCompletion;
    });
    const active: ActiveHandover = {
      direction: 'reverse',
      project,
      sourcePose,
      sourceTargetProjection: this.lastSourceTargetProjection,
      generation,
      timeline: this.timelineFactory(),
      completion,
      flight: null,
      globeFrames: null,
      cesiumFrames: null,
      unregisterCombinedRenderer: null,
      mirroring: false,
      visualComplete: false,
      flightComplete: false,
      fallbackReason: null,
      sourceTargetRange: null,
      reverseDestinationTargetRange: null,
      settled: false,
      resolve,
    };
    this.active = active;
    this.lastProjectId = project.id;
    this.lastSourceCamera = geographicPoseToProbe(sourcePose);
    this.startedAtMs = transitionNowMs();
    this.liveAlignmentSamples = 0;
    this.maximumLiveCameraDelta = null;
    this.maximumLiveTargetProjectionDelta = null;
    this.ownership = 'cesium';
    this.setProgress(active, 0);
    this.setStatus('approaching');
    gsap.set(this.cover, { opacity: 0 });
    gsap.set(this.globe.element, { opacity: 0, scale: 1, transformOrigin: '50% 50%' });
    this.cesium.setPresentationVisible(true);
    gsap.set(this.cesium.element, { opacity: 1 });
    this.positionAtmosphericVeil(active.sourceTargetProjection);

    const landingPose = this.cesium.captureGeographicPose();
    this.globe.resumeRendering();
    if (!landingPose) {
      this.beginConcealedReverseFallback(active, 'landing camera is unavailable');
    } else {
      // Ensure the hidden Three scene begins in exact visual alignment before the first reverse
      // flight frame is rendered into it.
      this.globe.applyGeographicPose(landingPose);
      this.beginMatchedReverse(active);
    }

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
    active.flight?.cancel();
    active.unregisterCombinedRenderer?.();
    active.unregisterCombinedRenderer = null;
    active.cesiumFrames?.release();
    active.cesiumFrames = null;
    active.globeFrames?.release();
    active.globeFrames = null;
    this.prewarm.cancel();
    this.cesium.deactivate();
    this.globe.applyGeographicPose(active.sourcePose);
    this.globe.resumeRendering();
    this.globe.restorePreview();
    gsap.set(this.cover, { opacity: 0 });
    gsap.set(this.globe.element, { opacity: 1, scale: 1 });
    gsap.set(this.cesium.element, { opacity: 0 });
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

  private async beginPreparedForward(
    active: ActiveHandover,
    warm: Promise<CesiumPrewarmResult>,
  ): Promise<void> {
    try {
      const warmResult = await withDeadline(warm, this.maxCoverDurationMs);
      if (!this.isCurrent(active)) return;
      if (warmResult.status !== 'ready') {
        this.beginConcealedFallback(active, `prewarm ${warmResult.status}`);
        return;
      }
      if (!warmResult.meaningfulFrameReady) {
        this.beginConcealedFallback(active, 'prewarm lacks a meaningful rendered frame');
        return;
      }
      if (warmResult.fallback) {
        this.beginConcealedFallback(active, `prewarm selected ${warmResult.tier}`);
        return;
      }

      if (!this.cesium.matchSourceCamera(active.sourcePose, active.project)) {
        this.beginConcealedFallback(active, 'source camera matching unavailable');
        return;
      }

      const stageOperation = this.cesium.activatePreparedProject(active.project, false);
      const stageResult = await withDeadline(stageOperation.ready, this.maxCoverDurationMs);
      if (!this.isCurrent(active)) return;
      if (stageResult.status !== 'ready') {
        this.beginConcealedFallback(active, `stage activation ${stageResult.status}`);
        return;
      }
      if (stageResult.fallback || !stageResult.meaningfulFrameReady) {
        this.beginConcealedFallback(active, `stage activation selected ${stageResult.tier}`);
        return;
      }

      this.beginMatchedFlight(active);
    } catch (error) {
      if (!this.isCurrent(active)) return;
      this.beginConcealedFallback(active, describeError(error));
    }
  }

  private beginMatchedFlight(active: ActiveHandover): void {
    if (!this.isCurrent(active)) return;
    try {
      active.globeFrames = this.globe.beginExternalFrameControl();
      active.cesiumFrames = this.cesium.beginExternalFrameControl();
    } catch (error) {
      this.beginConcealedFallback(active, `external frame control failed: ${describeError(error)}`);
      return;
    }

    this.globe.applyGeographicPose(active.sourcePose);
    this.cesium.setPresentationVisible(true);
    gsap.set(this.cesium.element, { opacity: 0 });
    active.sourceTargetRange = this.cesium.captureTargetRange();
    if (
      active.sourceTargetRange === null ||
      active.sourceTargetRange <= active.project.geographicFraming.landingCamera.range
    ) {
      this.beginConcealedFallback(active, 'native flight source range unavailable');
      return;
    }
    const flight = this.cesium.startLandingFlight(active.project, this.flightDurationMs);
    if (!flight) {
      this.beginConcealedFallback(active, 'native Cesium camera flight unavailable');
      return;
    }

    active.flight = flight;
    active.mirroring = true;
    active.unregisterCombinedRenderer = this.ticker.registerRenderer((deltaSeconds) => {
      if (!this.isCurrent(active) || !active.cesiumFrames) return;
      active.cesiumFrames.render(deltaSeconds);
      this.positionAtmosphericVeil(this.cesium.captureTargetProjection());
      if (!active.mirroring || !active.globeFrames) return;
      const pose = this.cesium.captureGeographicPose();
      if (!pose) return;
      this.globe.applyGeographicPose(pose);
      active.globeFrames.render(deltaSeconds);
      this.recordLiveAlignment(active, pose);
      const targetRange = this.cesium.captureTargetRange();
      if (targetRange !== null) this.updateMatchedBlend(active, targetRange);
    });
    this.ticker.start();
    this.ownership = 'overlap';
    this.setProgress(active, 0.08);
    this.setStatus('flying');

    void flight.finished.then((result) => {
      if (!this.isCurrent(active) || active.fallbackReason) return;
      if (result.status !== 'completed') {
        this.beginConcealedFallback(
          active,
          result.status === 'failed'
            ? `native flight failed: ${describeError(result.error)}`
            : 'native flight cancelled',
        );
        return;
      }
      active.flightComplete = true;
      this.finishMatchedFlightIfReady(active);
    });
  }

  private updateMatchedBlend(active: ActiveHandover, targetRange: number): void {
    if (!this.isCurrent(active) || active.visualComplete || active.sourceTargetRange === null)
      return;
    const landingRange = active.project.geographicFraming.landingCamera.range;
    const flightProgress = clamp01(
      (active.sourceTargetRange - targetRange) / (active.sourceTargetRange - landingRange),
    );
    const blend = smoothstep(
      HANDOVER_FLIGHT_PROGRESS.rendererBlendStart,
      HANDOVER_FLIGHT_PROGRESS.rendererBlendEnd,
      flightProgress,
    );
    const veilRise = smoothstep(0, HANDOVER_FLIGHT_PROGRESS.veilPeak, flightProgress);
    const veilFall =
      1 -
      smoothstep(
        HANDOVER_FLIGHT_PROGRESS.veilPeak,
        HANDOVER_FLIGHT_PROGRESS.veilEnd,
        flightProgress,
      );
    gsap.set(this.globe.element, { opacity: 1 - blend, scale: 1 });
    gsap.set(this.cesium.element, { opacity: blend });
    gsap.set(this.cover, { opacity: 0.28 * Math.min(veilRise, veilFall) });
    this.setProgress(active, 0.08 + flightProgress * 0.57);
    if (blend > 0 && this.status === 'flying') this.setStatus('blending');
    if (blend >= 1) this.completeMatchedCrossfade(active);
  }

  private completeMatchedCrossfade(active: ActiveHandover): void {
    if (!this.isCurrent(active)) return;
    active.mirroring = false;
    this.globe.suspendRendering();
    active.globeFrames?.release();
    active.globeFrames = null;
    gsap.set(this.globe.element, { opacity: 0, scale: 1 });
    gsap.set(this.cover, { opacity: 0 });
    active.visualComplete = true;
    this.setProgress(active, 0.65);
    this.ownership = 'cesium';
    this.syncProbeAttributes();
    this.finishMatchedFlightIfReady(active);
  }

  private finishMatchedFlightIfReady(active: ActiveHandover): void {
    if (!this.isCurrent(active) || !active.visualComplete || !active.flightComplete) return;
    active.unregisterCombinedRenderer?.();
    active.unregisterCombinedRenderer = null;
    active.cesiumFrames?.release();
    active.cesiumFrames = null;
    this.cesium.setPresentationVisible(true);
    gsap.set(this.cesium.element, { opacity: 1 });
    this.setProgress(active, 1);
    this.ownership = 'cesium';
    this.setStatus('settled');
    this.settle(active, {
      projectId: active.project.id,
      generation: active.generation,
      status: 'completed',
    });
  }

  /** Begins the inverse native Cesium flight, mirroring each frame into the hidden Three globe. */
  private beginMatchedReverse(active: ActiveHandover): void {
    if (!this.isCurrent(active) || active.direction !== 'reverse') return;
    const startRange = this.cesium.captureTargetRange();
    const destinationRange =
      this.cesium.targetRangeForPose?.(active.sourcePose, active.project) ?? null;
    if (
      startRange === null ||
      destinationRange === null ||
      destinationRange <= startRange ||
      !this.cesium.startGeographicFlight
    ) {
      this.beginConcealedReverseFallback(active, 'reverse native flight range is unavailable');
      return;
    }

    try {
      active.globeFrames = this.globe.beginExternalFrameControl();
      active.cesiumFrames = this.cesium.beginExternalFrameControl();
    } catch (error) {
      this.beginConcealedReverseFallback(
        active,
        `reverse external frame control failed: ${describeError(error)}`,
      );
      return;
    }

    const flight = this.cesium.startGeographicFlight(active.sourcePose, this.flightDurationMs);
    if (!flight) {
      this.beginConcealedReverseFallback(
        active,
        'reverse native Cesium camera flight is unavailable',
      );
      return;
    }

    active.sourceTargetRange = startRange;
    active.reverseDestinationTargetRange = destinationRange;
    active.flight = flight;
    active.mirroring = true;
    active.unregisterCombinedRenderer = this.ticker.registerRenderer((deltaSeconds) => {
      if (!this.isCurrent(active) || !active.cesiumFrames) return;
      active.cesiumFrames.render(deltaSeconds);
      this.positionAtmosphericVeil(this.cesium.captureTargetProjection());
      if (!active.mirroring || !active.globeFrames) return;
      const pose = this.cesium.captureGeographicPose();
      if (!pose) return;
      this.globe.applyGeographicPose(pose);
      active.globeFrames.render(deltaSeconds);
      this.recordLiveAlignment(active, pose);
      const targetRange = this.cesium.captureTargetRange();
      if (targetRange !== null) this.updateMatchedReverseBlend(active, targetRange);
    });
    this.ticker.start();
    this.ownership = 'overlap';
    this.setProgress(active, 0.08);
    this.setStatus('flying');

    void flight.finished.then((result) => {
      if (!this.isCurrent(active) || active.fallbackReason) return;
      if (result.status !== 'completed') {
        this.beginConcealedReverseFallback(
          active,
          result.status === 'failed'
            ? `reverse native flight failed: ${describeError(result.error)}`
            : 'reverse native flight cancelled',
        );
        return;
      }
      active.flightComplete = true;
      this.finishMatchedReverseIfReady(active);
    });
  }

  private updateMatchedReverseBlend(active: ActiveHandover, targetRange: number): void {
    if (
      !this.isCurrent(active) ||
      active.direction !== 'reverse' ||
      active.visualComplete ||
      active.sourceTargetRange === null ||
      active.reverseDestinationTargetRange === null
    ) {
      return;
    }
    const flightProgress = clamp01(
      (targetRange - active.sourceTargetRange) /
        (active.reverseDestinationTargetRange - active.sourceTargetRange),
    );
    const blend = smoothstep(
      HANDOVER_FLIGHT_PROGRESS.rendererBlendStart,
      HANDOVER_FLIGHT_PROGRESS.rendererBlendEnd,
      flightProgress,
    );
    const veilRise = smoothstep(0, HANDOVER_FLIGHT_PROGRESS.veilPeak, flightProgress);
    const veilFall =
      1 -
      smoothstep(
        HANDOVER_FLIGHT_PROGRESS.veilPeak,
        HANDOVER_FLIGHT_PROGRESS.veilEnd,
        flightProgress,
      );
    gsap.set(this.cesium.element, { opacity: 1 - blend });
    gsap.set(this.globe.element, { opacity: blend, scale: 1 });
    gsap.set(this.cover, { opacity: 0.28 * Math.min(veilRise, veilFall) });
    this.setProgress(active, 0.08 + flightProgress * 0.92);
    if (blend > 0 && this.status === 'flying') this.setStatus('blending');
    if (blend >= 1) this.completeMatchedReverseCrossfade(active);
  }

  /** Keeps mirroring after the crossfade so the fully visible globe completes the outward zoom. */
  private completeMatchedReverseCrossfade(active: ActiveHandover): void {
    if (!this.isCurrent(active) || active.visualComplete) return;
    gsap.set(this.cesium.element, { opacity: 0 });
    gsap.set(this.globe.element, { opacity: 1, scale: 1 });
    gsap.set(this.cover, { opacity: 0 });
    active.visualComplete = true;
    // Cesium remains the single native-camera writer until its outward flight ends; it continues
    // to render invisibly so Three can mirror the remaining movement. Keep ownership as overlap
    // instead of falsely reporting a completed globe-only handoff.
    this.ownership = 'overlap';
    this.syncProbeAttributes();
    this.finishMatchedReverseIfReady(active);
  }

  private finishMatchedReverseIfReady(active: ActiveHandover): void {
    if (!this.isCurrent(active) || !active.flightComplete) return;
    if (!active.visualComplete) this.completeMatchedReverseCrossfade(active);
    if (!this.isCurrent(active) || !active.visualComplete) return;

    active.mirroring = false;
    active.unregisterCombinedRenderer?.();
    active.unregisterCombinedRenderer = null;
    // Restore the exact rig-owned orbit before transferring the globe back to its normal ticker.
    // This prevents numerical bridge differences from leaving a visible one-frame jump at reveal.
    this.globe.restorePreview();
    active.cesiumFrames?.release();
    active.cesiumFrames = null;
    active.globeFrames?.release();
    active.globeFrames = null;
    this.cesium.deactivate();
    gsap.set(this.cesium.element, { opacity: 0 });
    gsap.set(this.globe.element, { opacity: 1, scale: 1, transformOrigin: '50% 50%' });
    gsap.set(this.cover, { opacity: 0 });
    this.setProgress(active, 1);
    this.ownership = 'globe';
    this.setStatus('settled');
    this.settle(active, {
      projectId: active.project.id,
      generation: active.generation,
      status: 'completed',
    });
  }

  /** Covered inverse path used only when a native reverse flight cannot be safely established. */
  private beginConcealedReverseFallback(active: ActiveHandover, reason: string): void {
    if (!this.isCurrent(active) || active.fallbackReason) return;
    active.fallbackReason = reason;
    active.timeline.kill();
    active.flight?.cancel();
    active.flight = null;
    active.mirroring = false;
    active.unregisterCombinedRenderer?.();
    active.unregisterCombinedRenderer = null;
    active.cesiumFrames?.release();
    active.cesiumFrames = null;
    active.globeFrames?.release();
    active.globeFrames = null;
    this.prewarm.cancel();
    this.globe.resumeRendering();
    this.globe.applyGeographicPose(active.sourcePose);
    this.globe.restorePreview();
    this.cesium.setPresentationVisible(true);
    gsap.set(this.cesium.element, { opacity: 1 });
    gsap.set(this.globe.element, { opacity: 0, scale: 1, transformOrigin: '50% 50%' });
    gsap.set(this.cover, { opacity: 0 });
    this.ownership = 'cesium';
    this.setStatus('approaching');

    active.timeline = this.timelineFactory();
    const coverDuration = (this.durationMs * 0.25) / 1_000;
    const revealDuration = (this.durationMs * 0.3) / 1_000;
    active.timeline
      .to(this.cover, {
        opacity: 1,
        duration: coverDuration,
        ease: 'sine.in',
        onUpdate: () => this.setProgress(active, styleOpacity(this.cover) * 0.45),
      })
      .call(() => {
        if (!this.isCurrent(active)) return;
        this.setProgress(active, 0.5);
        this.setStatus('covering');
        this.cesium.deactivate();
      })
      .to(this.globe.element, {
        opacity: 1,
        duration: revealDuration,
        ease: 'sine.out',
      })
      .to(this.cover, {
        opacity: 0,
        duration: revealDuration,
        ease: 'sine.out',
        onUpdate: () => this.setProgress(active, 0.5 + (1 - styleOpacity(this.cover)) * 0.5),
      })
      .call(() => {
        if (!this.isCurrent(active)) return;
        gsap.set(this.cesium.element, { opacity: 0 });
        this.setProgress(active, 1);
        this.ownership = 'globe';
        this.setStatus('settled');
        this.settle(active, {
          projectId: active.project.id,
          generation: active.generation,
          status: 'fallback',
          reason,
        });
      })
      .play();
  }

  private beginConcealedFallback(active: ActiveHandover, reason: string): void {
    if (!this.isCurrent(active) || active.fallbackReason) return;
    active.fallbackReason = reason;
    active.timeline.kill();
    active.flight?.cancel();
    active.flight = null;
    active.mirroring = false;
    active.unregisterCombinedRenderer?.();
    active.unregisterCombinedRenderer = null;
    this.cesium.deactivate();
    active.cesiumFrames?.release();
    active.cesiumFrames = null;
    this.globe.suspendRendering();
    active.globeFrames?.release();
    active.globeFrames = null;
    this.prewarm.cancel();
    this.globe.applyGeographicPose(active.sourcePose);
    this.globe.resumeRendering();
    this.globe.restorePreview();
    gsap.set(this.cesium.element, { opacity: 0 });
    gsap.set(this.cover, { opacity: 0 });
    gsap.set(this.globe.element, { opacity: 1, scale: 1, transformOrigin: '50% 50%' });
    this.ownership = 'globe';
    this.setStatus('approaching');

    active.timeline = this.timelineFactory();
    const approachDuration = (this.durationMs * 0.45) / 1_000;
    const coverDuration = (this.durationMs * 0.25) / 1_000;
    active.timeline
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
        onUpdate: () => this.setProgress(active, 0.45 + styleOpacity(this.cover) * 0.25),
      })
      .call(() => {
        if (!this.isCurrent(active)) return;
        this.setProgress(active, 0.7);
        this.setStatus('covering');
        active.timeline.pause();
        void this.revealFallback(active, reason);
      })
      .play();
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

  private positionAtmosphericVeil(projection: TargetProjectionProbe | null): void {
    if (!projection || !Number.isFinite(projection.x) || !Number.isFinite(projection.y)) return;
    const x = Math.max(0, Math.min(1, projection.x)) * 100;
    const y = Math.max(0, Math.min(1, projection.y)) * 100;
    this.cover.style.setProperty('--handover-target-x', `${x}%`);
    this.cover.style.setProperty('--handover-target-y', `${y}%`);
  }

  private recordLiveAlignment(active: ActiveHandover, cesiumPose: GeographicCameraPose): void {
    if (!this.isCurrent(active)) return;
    const globePose = this.globe.captureGeographicPose();
    const comparison = compareCameraPoseProbes(
      geographicPoseToProbe(globePose),
      geographicPoseToProbe(cesiumPose),
    );
    this.liveAlignmentSamples += 1;
    if (
      !this.maximumLiveCameraDelta ||
      cameraComparisonScore(comparison) > cameraComparisonScore(this.maximumLiveCameraDelta)
    ) {
      this.maximumLiveCameraDelta = comparison;
    }

    const globeTarget = this.globe.captureTargetProjection(active.project.id);
    const cesiumTarget = this.cesium.captureTargetProjection();
    if (globeTarget && cesiumTarget) {
      const delta = Math.hypot(globeTarget.x - cesiumTarget.x, globeTarget.y - cesiumTarget.y);
      this.maximumLiveTargetProjectionDelta = Math.max(
        this.maximumLiveTargetProjectionDelta ?? 0,
        delta,
      );
    }
    this.syncProbeAttributes();
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

function cameraComparisonScore(comparison: CameraPoseComparison): number {
  return (
    comparison.positionDistance +
    comparison.directionDeltaDegrees +
    comparison.upDeltaDegrees +
    comparison.verticalFovDeltaDegrees +
    comparison.aspectRatioDelta
  );
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(start: number, end: number, value: number): number {
  if (start === end) return value >= end ? 1 : 0;
  const progress = clamp01((value - start) / (end - start));
  return progress * progress * (3 - 2 * progress);
}
