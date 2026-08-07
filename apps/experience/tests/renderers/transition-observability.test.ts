import { describe, expect, it } from 'vitest';
import {
  analyzeTransitionFrameSamples,
  compareCameraPoseProbes,
  type CameraPoseProbe,
  type TransitionFrameSample,
} from '../../src/renderers/handover/transition-observability.js';

const MATCHED_CAMERA: CameraPoseProbe = {
  coordinateSpace: 'ecef',
  position: [6_378_137, 0, 0],
  direction: [-1, 0, 0],
  up: [0, 0, 1],
  verticalFovRadians: Math.PI / 4,
  aspectRatio: 16 / 9,
};

function frame(
  elapsedMs: number,
  options: Partial<TransitionFrameSample> = {},
): TransitionFrameSample {
  return {
    elapsedMs,
    signature: [20, 30, 40, 50],
    handoverStatus: 'covering',
    handoverProgress: 0.7,
    coverOpacity: 1,
    globeFrame: 10,
    cesiumFrame: 0,
    ...options,
  };
}

describe('transition observability', () => {
  it('passes matched camera probes and fails deliberate pose/FOV mismatches', () => {
    const matched = compareCameraPoseProbes(MATCHED_CAMERA, {
      ...MATCHED_CAMERA,
      position: [6_378_137.0001, 0, 0],
    });
    expect(matched).toMatchObject({ comparable: true, aligned: true });

    const mismatched = compareCameraPoseProbes(MATCHED_CAMERA, {
      ...MATCHED_CAMERA,
      position: [6_378_200, 0, 0],
      direction: [-0.95, 0.31, 0],
      verticalFovRadians: Math.PI / 3,
    });
    expect(mismatched).toMatchObject({ comparable: true, aligned: false });
    expect(mismatched.positionDistance).toBeGreaterThan(60);
    expect(mismatched.directionDeltaDegrees).toBeGreaterThan(10);
    expect(mismatched.verticalFovDeltaDegrees).toBeCloseTo(15);
  });

  it('refuses to claim alignment for cameras expressed in different coordinate spaces', () => {
    const comparison = compareCameraPoseProbes(MATCHED_CAMERA, {
      ...MATCHED_CAMERA,
      coordinateSpace: 'three-world',
    });

    expect(comparison).toMatchObject({
      comparable: false,
      aligned: false,
      reason: 'coordinate-space-mismatch',
    });
  });

  it('identifies a stationary fully opaque run and reports the largest visual change', () => {
    const analysis = analyzeTransitionFrameSamples([
      frame(0),
      frame(80),
      frame(160),
      frame(240, {
        signature: [60, 70, 80, 90],
        handoverStatus: 'revealing',
        handoverProgress: 0.82,
        coverOpacity: 0.6,
        cesiumFrame: 3,
      }),
    ]);

    expect(analysis.longestOpaqueStationaryHoldMs).toBe(160);
    expect(analysis.maximumVisualChange).toMatchObject({
      fromIndex: 2,
      toIndex: 3,
      elapsedMs: 240,
    });
    if (!analysis.maximumVisualChange) throw new Error('Expected a visual-change report.');
    expect(analysis.maximumVisualChange.signatureDistance).toBeGreaterThan(30);
  });

  it('does not misclassify camera/render progress behind a partial veil as a full-cover hold', () => {
    const analysis = analyzeTransitionFrameSamples([
      frame(0, { coverOpacity: 0.8, handoverProgress: 0.3 }),
      frame(80, {
        coverOpacity: 0.85,
        handoverProgress: 0.4,
        signature: [21, 31, 41, 51],
        globeFrame: 12,
        cesiumFrame: 1,
      }),
      frame(160, {
        coverOpacity: 0.75,
        handoverProgress: 0.52,
        signature: [23, 33, 43, 53],
        globeFrame: 14,
        cesiumFrame: 3,
      }),
    ]);

    expect(analysis.longestOpaqueStationaryHoldMs).toBe(0);
  });
});
