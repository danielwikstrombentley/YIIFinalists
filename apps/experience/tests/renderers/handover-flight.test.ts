import gsap from 'gsap';
import { describe, expect, it, vi } from 'vitest';
import type { GeographicFraming } from '@yii/content-schema';
import { Ticker } from '../../src/orchestration/ticker.js';
import type { CameraFlightResult } from '../../src/renderers/cesium/camera-flight.js';
import type {
  CesiumStageOperation,
  CesiumStageProject,
} from '../../src/renderers/cesium/CesiumStageAdapter.js';
import type { CesiumPrewarmResult } from '../../src/renderers/cesium/prewarm.js';
import type { GeographicCameraPose } from '../../src/renderers/handover/geographic-camera-pose.js';
import {
  HandoverController,
  type HandoverControllerOptions,
  type HandoverTimeline,
} from '../../src/renderers/handover/HandoverController.js';

const FRAMING: GeographicFraming = {
  scopeType: 'city',
  landingCamera: {
    destination: { lat: 51.5074, lon: -0.1278, height: 140 },
    orientation: { heading: 22, pitch: -32, roll: 0 },
    range: 16_000,
  },
  previewEmphasis: {},
  tileTier: 'photorealistic',
  canvasTreatment: {},
};
const PROJECT: CesiumStageProject = { id: 'flight-project', geographicFraming: FRAMING };
const SOURCE_POSE: GeographicCameraPose = {
  positionEcef: [10_000_000, 2_000_000, 4_000_000],
  directionEcef: [-0.9, -0.1, -0.4],
  upEcef: [-0.4, 0, 0.9],
  verticalFovRadians: (42 * Math.PI) / 180,
  aspectRatio: 16 / 9,
};
const FLIGHT_POSE: GeographicCameraPose = {
  ...SOURCE_POSE,
  positionEcef: [9_000_000, 1_500_000, 3_500_000],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

class InspectTimeline implements HandoverTimeline {
  readonly sets: { target: object; vars: Record<string, unknown> }[] = [];
  readonly tweens: { target: object; vars: Record<string, unknown> }[] = [];
  readonly callbacks: (() => void)[] = [];
  readonly pause = vi.fn(() => this);
  readonly play = vi.fn(() => this);
  readonly kill = vi.fn();

  set(target: object, vars: Record<string, unknown>): this {
    this.sets.push({ target, vars });
    return this;
  }

  to(target: object, vars: Record<string, unknown>): this {
    this.tweens.push({ target, vars });
    return this;
  }

  call(callback: () => void): this {
    this.callbacks.push(callback);
    return this;
  }

  runAllCalls(): void {
    for (const callback of this.callbacks.splice(0)) callback();
  }
}

function readyStageOperation(): CesiumStageOperation {
  return {
    ready: Promise.resolve({
      projectId: PROJECT.id,
      tier: 'photorealistic',
      fallback: false,
      meaningfulFrameReady: true,
      status: 'ready',
    }),
    cancel: vi.fn(),
  };
}

describe('matched-flight handover', () => {
  it('uses one native flight and mirrors Cesium into Three before each overlap render', async () => {
    const ticker = new Ticker();
    const timeline = new InspectTimeline();
    const flight = deferred<CameraFlightResult>();
    const frameOrder: string[] = [];
    const globeElement = document.createElement('canvas');
    const cesiumElement = document.createElement('div');
    const stage = document.createElement('div');
    stage.append(globeElement, cesiumElement);
    const globe = {
      element: globeElement,
      captureGeographicPose: vi.fn(() => SOURCE_POSE),
      captureTargetProjection: vi.fn(() => ({
        projectId: PROJECT.id,
        x: 0.7,
        y: 0.6,
        visible: true,
      })),
      applyGeographicPose: vi.fn(() => frameOrder.push('globe-apply')),
      beginExternalFrameControl: vi.fn(() => ({
        render: () => frameOrder.push('globe-render'),
        release: vi.fn(),
      })),
      suspendRendering: vi.fn(),
      resumeRendering: vi.fn(),
      restorePreview: vi.fn(),
    };
    const cesium = {
      element: cesiumElement,
      matchSourceCamera: vi.fn(() => true),
      setLandingCamera: vi.fn(() => true),
      activatePreparedProject: vi.fn(() => readyStageOperation()),
      showSafeComposition: vi.fn(() => readyStageOperation()),
      setPresentationVisible: vi.fn(),
      beginExternalFrameControl: vi.fn(() => ({
        render: () => frameOrder.push('cesium-render'),
        release: vi.fn(),
      })),
      captureGeographicPose: vi.fn(() => {
        frameOrder.push('cesium-capture');
        return FLIGHT_POSE;
      }),
      captureTargetProjection: vi.fn(() => null),
      captureTargetRange: vi
        .fn()
        .mockReturnValueOnce(1_000_000)
        .mockReturnValue(FRAMING.landingCamera.range),
      startLandingFlight: vi.fn(() => ({ finished: flight.promise, cancel: vi.fn() })),
      deactivate: vi.fn(),
    };
    const ready: CesiumPrewarmResult = {
      projectId: PROJECT.id,
      tier: 'photorealistic',
      fallback: false,
      meaningfulFrameReady: true,
      landingAssetsReady: true,
      status: 'ready',
    };
    const prewarm = {
      warm: vi.fn(() => ({ ready: Promise.resolve(ready), cancel: vi.fn() })),
      readinessFor: vi.fn(() => Promise.resolve(ready)),
      cancel: vi.fn(),
    };
    const options: HandoverControllerOptions & { ticker: Ticker } = {
      stage,
      globe,
      cesium,
      prewarm,
      ticker,
      timelineFactory: () => timeline,
    };
    const controller = new HandoverController(options);

    const operation = controller.startForward(PROJECT);
    await flushAsyncWork();

    expect(cesium.startLandingFlight).toHaveBeenCalledTimes(1);
    frameOrder.length = 0;
    gsap.ticker.tick();
    expect(frameOrder).toEqual(['cesium-render', 'cesium-capture', 'globe-apply', 'globe-render']);
    expect(globe.applyGeographicPose).toHaveBeenCalledWith(FLIGHT_POSE);
    expect(controller.cover.style.getPropertyValue('--handover-target-x')).toBe('70%');
    expect(controller.cover.style.getPropertyValue('--handover-target-y')).toBe('60%');

    expect(timeline.pause).not.toHaveBeenCalled();
    expect(timeline.tweens.some(({ vars }) => Number(vars.scale ?? 1) > 1)).toBe(false);
    expect(
      timeline.tweens.some(
        ({ target, vars }) => target === controller.cover && Number(vars.opacity ?? 0) >= 1,
      ),
    ).toBe(false);

    timeline.runAllCalls();
    flight.resolve({ status: 'completed' });
    await expect(operation.completion).resolves.toMatchObject({ status: 'completed' });
    controller.dispose();
    ticker.stop();
  });
});
