import { expect, type Page } from '@playwright/test';
import {
  analyzeTransitionFrameSamples,
  compareCameraPoseProbes,
  frameSignatureDistance,
  type CameraPoseComparison,
  type TransitionFrameAnalysis,
  type TransitionFrameSample,
  type TransitionObservabilitySnapshot,
} from '../../../src/renderers/handover/transition-observability.js';

interface CapturedFrame {
  meanLuma: number;
  litPixelRatio: number;
  signature: number[];
  transition: TransitionObservabilitySnapshot | null;
}

export interface VisibleFrameCheckOptions {
  frameCount?: number;
  intervalMs?: number;
  /** Pass 3 enables this after the normal path no longer pauses behind a fully opaque cover. */
  maximumOpaqueStationaryHoldMs?: number;
}

export interface VisibleTransitionFrameReport extends TransitionFrameAnalysis {
  samples: TransitionFrameSample[];
  cameraComparison: CameraPoseComparison | null;
  targetProjectionDelta: { x: number; y: number; distance: number } | null;
  maximumLiveCameraDelta: CameraPoseComparison | null;
  maximumLiveTargetProjectionDelta: number | null;
}

/**
 * Captures the pixels that Playwright actually sees, then uses the browser's native image decoder
 * to calculate a compact luminance signature. This avoids trusting renderer-owned test hooks for
 * the zero-black/stale-frame assertion.
 */
async function captureStageFrame(page: Page): Promise<CapturedFrame> {
  const screenshot = await page.locator('#stage').screenshot();

  return page.evaluate(async (pngBase64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${pngBase64}`;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Unable to create a 2D frame-analysis context.');
    context.drawImage(image, 0, 0);

    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const columns = 8;
    const rows = 8;
    const cellTotals = Array.from({ length: columns * rows }, () => 0);
    const cellCounts = Array.from({ length: columns * rows }, () => 0);
    let totalLuma = 0;
    let litPixels = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixelOffset = (y * width + x) * 4;
        const alpha = data[pixelOffset + 3] ?? 0;
        const red = data[pixelOffset] ?? 0;
        const green = data[pixelOffset + 1] ?? 0;
        const blue = data[pixelOffset + 2] ?? 0;
        const luma = ((red * 0.2126 + green * 0.7152 + blue * 0.0722) * alpha) / 255;
        const cell =
          Math.min(rows - 1, Math.floor((y / height) * rows)) * columns +
          Math.min(columns - 1, Math.floor((x / width) * columns));

        totalLuma += luma;
        if (luma > 8) litPixels += 1;
        cellTotals[cell] = (cellTotals[cell] ?? 0) + luma;
        cellCounts[cell] = (cellCounts[cell] ?? 0) + 1;
      }
    }

    const runtime = (
      window as Window & {
        __YII_E2E__?: { transitionSnapshot(): TransitionObservabilitySnapshot };
      }
    ).__YII_E2E__;
    return {
      meanLuma: totalLuma / (width * height),
      litPixelRatio: litPixels / (width * height),
      signature: cellTotals.map((total, index) => total / (cellCounts[index] ?? 1)),
      transition: runtime?.transitionSnapshot() ?? null,
    };
  }, screenshot.toString('base64'));
}

/**
 * Samples the public stage through a handover. Every sample must contain visible pixels, and at
 * least one sampled frame must visually differ from the first. It is intentionally reusable for
 * both forward and reverse handover journeys.
 */
export async function expectVisibleTransitionFrames(
  page: Page,
  options: VisibleFrameCheckOptions = {},
): Promise<VisibleTransitionFrameReport> {
  const frameCount = options.frameCount ?? 7;
  const intervalMs = options.intervalMs ?? 65;
  const frames: CapturedFrame[] = [];

  for (let index = 0; index < frameCount; index += 1) {
    frames.push(await captureStageFrame(page));
    if (index < frameCount - 1) await page.waitForTimeout(intervalMs);
  }

  for (const [index, frame] of frames.entries()) {
    expect(frame.litPixelRatio, `frame ${index} must not be blank or black`).toBeGreaterThan(0.005);
    expect(frame.meanLuma, `frame ${index} must contain visible scene luminance`).toBeGreaterThan(
      0.5,
    );
  }

  const first = frames[0];
  if (!first) throw new Error('Expected at least one transition frame.');
  const largestDifference = Math.max(
    ...frames.slice(1).map((frame) => frameSignatureDistance(first.signature, frame.signature)),
  );
  expect(largestDifference, 'handover frames must not remain visually stale').toBeGreaterThan(0.15);

  const firstTimestamp = first.transition?.capturedAtMs ?? 0;
  const samples = frames.map<TransitionFrameSample>((frame, index) => {
    const transition = frame.transition;
    return {
      elapsedMs: (transition?.capturedAtMs ?? firstTimestamp + index * intervalMs) - firstTimestamp,
      signature: frame.signature,
      handoverStatus: transition?.handover?.status ?? 'unavailable',
      handoverProgress: transition?.handover?.progress ?? 0,
      coverOpacity: transition?.handover?.coverOpacity ?? 0,
      globeFrame: transition?.globe?.frameCount ?? 0,
      cesiumFrame: transition?.cesium?.frameCount ?? 0,
    };
  });
  const analysis = analyzeTransitionFrameSamples(samples);
  if (options.maximumOpaqueStationaryHoldMs !== undefined) {
    expect(
      analysis.longestOpaqueStationaryHoldMs,
      'normal handover path must not pause behind a fully opaque stationary cover',
    ).toBeLessThanOrEqual(options.maximumOpaqueStationaryHoldMs);
  }

  const cameraFrame = frames.find(
    (frame) =>
      (frame.transition?.handover?.sourceCamera ?? frame.transition?.globe?.camera) &&
      frame.transition.cesium?.matchedSourceCamera,
  );
  const globeCamera =
    cameraFrame?.transition?.handover?.sourceCamera ?? cameraFrame?.transition?.globe?.camera;
  const cesiumCamera = cameraFrame?.transition?.cesium?.matchedSourceCamera;
  const cameraComparison =
    globeCamera && cesiumCamera ? compareCameraPoseProbes(globeCamera, cesiumCamera) : null;

  const projectionFrame = frames.find(
    (frame) =>
      (frame.transition?.handover?.sourceTargetProjection ??
        frame.transition?.globe?.targetProjection) &&
      frame.transition.cesium?.matchedSourceTargetProjection,
  );
  const globeProjection =
    projectionFrame?.transition?.handover?.sourceTargetProjection ??
    projectionFrame?.transition?.globe?.targetProjection;
  const cesiumProjection = projectionFrame?.transition?.cesium?.matchedSourceTargetProjection;
  const targetProjectionDelta =
    globeProjection && cesiumProjection
      ? {
          x: Math.abs(globeProjection.x - cesiumProjection.x),
          y: Math.abs(globeProjection.y - cesiumProjection.y),
          distance: Math.hypot(
            globeProjection.x - cesiumProjection.x,
            globeProjection.y - cesiumProjection.y,
          ),
        }
      : null;

  const liveCameraComparisons = frames.flatMap((frame) => {
    const transition = frame.transition;
    if (
      transition?.handover?.ownership !== 'overlap' ||
      !transition.globe?.camera ||
      !transition.cesium?.camera
    ) {
      return [];
    }
    return [compareCameraPoseProbes(transition.globe.camera, transition.cesium.camera)];
  });
  const sampledMaximumLiveCameraDelta = liveCameraComparisons.reduce<CameraPoseComparison | null>(
    (maximum, comparison) => {
      if (!maximum) return comparison;
      const score =
        comparison.positionDistance +
        comparison.directionDeltaDegrees +
        comparison.upDeltaDegrees +
        comparison.verticalFovDeltaDegrees +
        comparison.aspectRatioDelta;
      const maximumScore =
        maximum.positionDistance +
        maximum.directionDeltaDegrees +
        maximum.upDeltaDegrees +
        maximum.verticalFovDeltaDegrees +
        maximum.aspectRatioDelta;
      return score > maximumScore ? comparison : maximum;
    },
    null,
  );
  const liveProjectionDeltas = frames.flatMap((frame) => {
    const transition = frame.transition;
    const globeTarget = transition?.globe?.targetProjection;
    const cesiumTarget = transition?.cesium?.targetProjection;
    if (transition?.handover?.ownership !== 'overlap' || !globeTarget || !cesiumTarget) return [];
    return [Math.hypot(globeTarget.x - cesiumTarget.x, globeTarget.y - cesiumTarget.y)];
  });
  const maximumLiveTargetProjectionDelta =
    liveProjectionDeltas.length > 0 ? Math.max(...liveProjectionDeltas) : null;
  const persistedAlignment = frames
    .map((frame) => frame.transition?.handover)
    .filter((probe) => (probe?.liveAlignmentSamples ?? 0) > 0)
    .at(-1);
  const maximumLiveCameraDelta =
    persistedAlignment?.maximumLiveCameraDelta ?? sampledMaximumLiveCameraDelta;
  const persistedTargetDelta = persistedAlignment?.maximumLiveTargetProjectionDelta ?? null;

  return {
    ...analysis,
    samples,
    cameraComparison,
    targetProjectionDelta,
    maximumLiveCameraDelta,
    maximumLiveTargetProjectionDelta:
      persistedTargetDelta === null
        ? maximumLiveTargetProjectionDelta
        : Math.max(persistedTargetDelta, maximumLiveTargetProjectionDelta ?? 0),
  };
}
