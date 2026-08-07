import gsap from 'gsap';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GeographicFraming } from '@yii/content-schema';
import { Ticker } from '../../src/orchestration/ticker.js';
import type {
  CesiumStageOperation,
  CesiumStageProject,
} from '../../src/renderers/cesium/CesiumStageAdapter.js';
import type { CesiumPrewarmResult } from '../../src/renderers/cesium/prewarm.js';
import type { GeographicCameraPose } from '../../src/renderers/handover/geographic-camera-pose.js';
import {
  HandoverController,
  type HandoverCesiumStage,
  type HandoverGlobeStage,
  type HandoverPrewarm,
  type HandoverTimeline,
} from '../../src/renderers/handover/HandoverController.js';

const FRAMING: GeographicFraming = {
  scopeType: 'corridor',
  landingCamera: {
    destination: { lat: -55, lon: -162, height: 1_200 },
    orientation: { heading: 10, pitch: -30, roll: 0 },
    range: 16_000,
  },
  previewEmphasis: { markerScale: 1.2 },
  tileTier: 'safe-composition',
  canvasTreatment: { darken: 0.15 },
};

const PROJECT: CesiumStageProject = { id: 'corridor-project', geographicFraming: FRAMING };
const SOURCE_POSE: GeographicCameraPose = {
  positionEcef: [6_500_000, 1_000, 2_000],
  directionEcef: [-1, 0, 0],
  upEcef: [0, 0, 1],
  verticalFovRadians: Math.PI / 4,
  aspectRatio: 16 / 9,
};
const SOURCE_PROJECTION = {
  projectId: PROJECT.id,
  x: 0.6,
  y: 0.7,
  visible: true,
} as const;

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function readyPrewarmResult(fallback = false): CesiumPrewarmResult {
  return {
    projectId: PROJECT.id,
    tier: 'safe-composition',
    fallback,
    meaningfulFrameReady: true,
    landingAssetsReady: true,
    status: 'ready',
  };
}

function readyStageOperation(fallback = false): CesiumStageOperation {
  return {
    ready: Promise.resolve({
      projectId: PROJECT.id,
      tier: 'safe-composition',
      fallback,
      meaningfulFrameReady: true,
      status: 'ready',
    }),
    cancel: vi.fn(),
  };
}

/** A timeline driver lets handover integration tests advance each choreography beat exactly. */
class ManualTimeline implements HandoverTimeline {
  private readonly callbacks: (() => void)[] = [];
  readonly kill = vi.fn();
  readonly pause = vi.fn(() => this);
  readonly play = vi.fn(() => this);

  set(target: unknown, vars: unknown): this {
    void target;
    void vars;
    return this;
  }

  to(target: unknown, vars: unknown, position?: string | number): this {
    void target;
    void vars;
    void position;
    return this;
  }

  call(callback: () => void): this {
    this.callbacks.push(callback);
    return this;
  }

  runNextBeat(): void {
    const callback = this.callbacks.shift();
    if (!callback) throw new Error('The handover timeline has no pending beat.');
    callback();
  }

  runAllBeats(): void {
    while (this.callbacks.length > 0) this.runNextBeat();
  }
}

interface HandoverHarness {
  controller: HandoverController;
  stage: HTMLDivElement;
  timelines: ManualTimeline[];
  ticker: Ticker;
  globe: HandoverGlobeStage & {
    captureGeographicPose: ReturnType<typeof vi.fn>;
    captureTargetProjection: ReturnType<typeof vi.fn>;
    applyGeographicPose: ReturnType<typeof vi.fn>;
    beginExternalFrameControl: ReturnType<typeof vi.fn>;
    suspendRendering: ReturnType<typeof vi.fn>;
    resumeRendering: ReturnType<typeof vi.fn>;
    restorePreview: ReturnType<typeof vi.fn>;
  };
  cesium: HandoverCesiumStage & {
    element: HTMLDivElement;
    matchSourceCamera: ReturnType<typeof vi.fn>;
    setLandingCamera: ReturnType<typeof vi.fn>;
    activatePreparedProject: ReturnType<typeof vi.fn>;
    showSafeComposition: ReturnType<typeof vi.fn>;
    setPresentationVisible: ReturnType<typeof vi.fn>;
    captureGeographicPose: ReturnType<typeof vi.fn>;
    captureTargetProjection: ReturnType<typeof vi.fn>;
    captureTargetRange: ReturnType<typeof vi.fn>;
    startLandingFlight: ReturnType<typeof vi.fn>;
    beginExternalFrameControl: ReturnType<typeof vi.fn>;
    deactivate: ReturnType<typeof vi.fn>;
  };
  prewarm: HandoverPrewarm & {
    readinessFor: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
}

function createHarness(
  options: {
    readiness?: readonly (Promise<CesiumPrewarmResult> | null)[];
    preparedOperations?: readonly CesiumStageOperation[];
    fallbackOperation?: CesiumStageOperation;
    maxCoverDurationMs?: number;
    flights?: readonly Promise<{ status: 'completed' | 'cancelled' | 'failed' }>[];
  } = {},
): HandoverHarness {
  const stage = document.createElement('div');
  document.body.append(stage);
  const globeElement = document.createElement('div');
  const cesiumElement = document.createElement('div');
  stage.append(globeElement, cesiumElement);
  const ticker = new Ticker();
  const timelines: ManualTimeline[] = [];
  const readiness = [...(options.readiness ?? [Promise.resolve(readyPrewarmResult())])];
  const preparedOperations = [...(options.preparedOperations ?? [readyStageOperation()])];
  const fallbackOperation = options.fallbackOperation ?? readyStageOperation(true);
  const flights = [...(options.flights ?? [Promise.resolve({ status: 'completed' as const })])];
  const frameControl = () => ({ render: vi.fn(), release: vi.fn() });
  let targetRangeProbe = 0;

  const globe = {
    element: globeElement,
    captureGeographicPose: vi.fn(() => SOURCE_POSE),
    captureTargetProjection: vi.fn(() => SOURCE_PROJECTION),
    applyGeographicPose: vi.fn(),
    beginExternalFrameControl: vi.fn(frameControl),
    suspendRendering: vi.fn(),
    resumeRendering: vi.fn(),
    restorePreview: vi.fn(),
  };
  const cesium = {
    element: cesiumElement,
    matchSourceCamera: vi.fn(() => true),
    setLandingCamera: vi.fn(() => true),
    activatePreparedProject: vi.fn(() => preparedOperations.shift() ?? readyStageOperation()),
    showSafeComposition: vi.fn(() => fallbackOperation),
    setPresentationVisible: vi.fn(),
    captureGeographicPose: vi.fn(() => SOURCE_POSE),
    captureTargetProjection: vi.fn(() => SOURCE_PROJECTION),
    captureTargetRange: vi.fn(() =>
      targetRangeProbe++ % 2 === 0 ? 1_000_000 : FRAMING.landingCamera.range,
    ),
    startLandingFlight: vi.fn(() => ({
      finished: flights.shift() ?? Promise.resolve({ status: 'completed' as const }),
      cancel: vi.fn(),
    })),
    beginExternalFrameControl: vi.fn(frameControl),
    deactivate: vi.fn(),
  };
  const prewarm = {
    warm: vi.fn(() => ({ ready: Promise.resolve(readyPrewarmResult()), cancel: vi.fn() })),
    readinessFor: vi.fn(() => readiness.shift() ?? null),
    cancel: vi.fn(),
  };

  const controller = new HandoverController({
    stage,
    globe,
    cesium,
    prewarm,
    durationMs: 10,
    maxCoverDurationMs: options.maxCoverDurationMs ?? 100,
    ticker,
    timelineFactory: () => {
      const timeline = new ManualTimeline();
      timelines.push(timeline);
      return timeline;
    },
  });

  return { controller, stage, timelines, ticker, globe, cesium, prewarm };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function completeForwardHandover(harness: HandoverHarness) {
  const operation = harness.controller.startForward(PROJECT);
  await flushAsyncWork();
  const timeline = harness.timelines.at(-1);
  if (!timeline) throw new Error('The controller did not create a handover timeline.');
  timeline.runAllBeats();
  gsap.ticker.tick();
  await flushAsyncWork();
  return operation.completion;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('HandoverController', () => {
  it('never swaps renderers before the matching prewarm readiness signal resolves', async () => {
    const warm = deferred<CesiumPrewarmResult>();
    const harness = createHarness({ readiness: [warm.promise] });
    const operation = harness.controller.startForward(PROJECT);

    expect(harness.controller.transitionProbe).toMatchObject({
      projectId: PROJECT.id,
      sourceCamera: { coordinateSpace: 'ecef', position: SOURCE_POSE.positionEcef },
      sourceTargetProjection: SOURCE_PROJECTION,
      status: 'approaching',
      progress: 0,
      ownership: 'globe',
    });

    expect(harness.cesium.activatePreparedProject).not.toHaveBeenCalled();

    warm.resolve(readyPrewarmResult());
    await flushAsyncWork();
    const timeline = harness.timelines[0];
    if (!timeline) throw new Error('Expected a forward handover timeline.');
    expect(harness.globe.captureGeographicPose).toHaveBeenCalledTimes(1);
    expect(harness.cesium.matchSourceCamera).toHaveBeenCalledWith(SOURCE_POSE, PROJECT);
    expect(harness.cesium.setLandingCamera).not.toHaveBeenCalled();
    expect(harness.cesium.activatePreparedProject).toHaveBeenCalledWith(PROJECT, false);
    expect(harness.cesium.matchSourceCamera.mock.invocationCallOrder[0]).toBeLessThan(
      harness.cesium.activatePreparedProject.mock.invocationCallOrder[0]!,
    );
    expect(harness.cesium.startLandingFlight).toHaveBeenCalledTimes(1);
    expect(harness.controller.transitionProbe.ownership).toBe('overlap');

    timeline.runAllBeats();
    gsap.ticker.tick();
    await flushAsyncWork();
    await expect(operation.completion).resolves.toMatchObject({ status: 'completed' });
    expect(harness.controller.transitionProbe).toMatchObject({
      status: 'settled',
      progress: 1,
      ownership: 'cesium',
    });
    expect(harness.controller.cover.dataset.progress).toBe('1');
    expect(harness.globe.suspendRendering).toHaveBeenCalledTimes(1);
    harness.controller.dispose();
    harness.ticker.stop();
  });

  it('reveals a safe composition when the full-cover watchdog expires', async () => {
    vi.useFakeTimers();
    const neverReady = new Promise<CesiumPrewarmResult>(() => {});
    const harness = createHarness({
      readiness: [neverReady],
      maxCoverDurationMs: 20,
      fallbackOperation: readyStageOperation(true),
    });
    const operation = harness.controller.startForward(PROJECT);

    await vi.advanceTimersByTimeAsync(20);
    await flushAsyncWork();
    const timeline = harness.timelines.at(-1);
    if (!timeline) throw new Error('Expected a fallback handover timeline.');
    timeline.runNextBeat();
    await flushAsyncWork();

    expect(harness.cesium.showSafeComposition).toHaveBeenCalledWith(PROJECT);
    expect(harness.controller.currentStatus).toBe('fallback');
    timeline.runNextBeat();
    await expect(operation.completion).resolves.toMatchObject({ status: 'fallback' });
    harness.controller.dispose();
    harness.ticker.stop();
  });

  it('routes resource-only prewarm through fallback instead of exposing an unrendered stage', async () => {
    const harness = createHarness({
      readiness: [Promise.resolve({ ...readyPrewarmResult(), meaningfulFrameReady: false })],
    });
    const operation = harness.controller.startForward(PROJECT);
    await flushAsyncWork();
    const timeline = harness.timelines.at(-1);
    if (!timeline) throw new Error('Expected a fallback handover timeline.');

    expect(harness.cesium.matchSourceCamera).not.toHaveBeenCalled();
    expect(harness.cesium.showSafeComposition).not.toHaveBeenCalled();
    timeline.runNextBeat();
    await flushAsyncWork();
    expect(harness.cesium.showSafeComposition).toHaveBeenCalledWith(PROJECT);
    timeline.runNextBeat();
    await expect(operation.completion).resolves.toMatchObject({
      status: 'fallback',
      reason: 'prewarm lacks a meaningful rendered frame',
    });
    harness.controller.dispose();
    harness.ticker.stop();
  });

  it('cancels safely during approach, full cover, and reveal without residual renderer ownership', async () => {
    const approach = createHarness();
    const approachOperation = approach.controller.startForward(PROJECT);
    approach.controller.cancel();
    await expect(approachOperation.completion).resolves.toMatchObject({ status: 'cancelled' });

    const coveringWarm = deferred<CesiumPrewarmResult>();
    const covering = createHarness({ readiness: [coveringWarm.promise] });
    const coveringOperation = covering.controller.startForward(PROJECT);
    covering.controller.cancel();
    covering.controller.cancel();
    await expect(coveringOperation.completion).resolves.toMatchObject({ status: 'cancelled' });

    const revealing = createHarness();
    const revealingOperation = revealing.controller.startForward(PROJECT);
    await flushAsyncWork();
    revealing.controller.cancel();
    await expect(revealingOperation.completion).resolves.toMatchObject({ status: 'cancelled' });

    for (const harness of [approach, covering, revealing]) {
      expect(harness.cesium.deactivate).toHaveBeenCalledTimes(1);
      expect(harness.globe.resumeRendering).toHaveBeenCalledTimes(1);
      expect(harness.globe.restorePreview).toHaveBeenCalledTimes(1);
      expect(harness.controller.cover).toHaveStyle({ opacity: '0' });
      harness.controller.dispose();
      harness.ticker.stop();
    }
  });

  it('discards the late readiness and completion of a superseded handover generation', async () => {
    const firstWarm = deferred<CesiumPrewarmResult>();
    const secondWarm = deferred<CesiumPrewarmResult>();
    const harness = createHarness({ readiness: [firstWarm.promise, secondWarm.promise] });
    const first = harness.controller.startForward(PROJECT);

    const second = harness.controller.startForward(PROJECT);

    firstWarm.resolve(readyPrewarmResult());
    await flushAsyncWork();
    expect(harness.cesium.activatePreparedProject).not.toHaveBeenCalled();
    await expect(first.completion).resolves.toMatchObject({ status: 'cancelled' });

    secondWarm.resolve(readyPrewarmResult());
    await flushAsyncWork();
    const secondTimeline = harness.timelines[1];
    if (!secondTimeline) throw new Error('Expected a second handover timeline.');
    expect(harness.cesium.activatePreparedProject).toHaveBeenCalledTimes(1);
    secondTimeline.runAllBeats();
    gsap.ticker.tick();
    await flushAsyncWork();
    await expect(second.completion).resolves.toMatchObject({ status: 'completed' });
    harness.controller.dispose();
    harness.ticker.stop();
  });

  it('reuses one owned cover across repeated completed handovers and removes it on disposal', async () => {
    const harness = createHarness({
      readiness: [Promise.resolve(readyPrewarmResult()), Promise.resolve(readyPrewarmResult())],
      preparedOperations: [readyStageOperation(), readyStageOperation()],
    });

    await expect(completeForwardHandover(harness)).resolves.toMatchObject({ status: 'completed' });
    await expect(completeForwardHandover(harness)).resolves.toMatchObject({ status: 'completed' });

    expect(harness.stage.querySelectorAll('[data-testid="handover-controller"]')).toHaveLength(1);
    expect(harness.globe.suspendRendering).toHaveBeenCalledTimes(2);
    harness.controller.dispose();
    expect(harness.stage.querySelector('[data-testid="handover-controller"]')).toBeNull();
    harness.ticker.stop();
  });
});
