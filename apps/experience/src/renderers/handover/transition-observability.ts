export type TransitionVector3 = readonly [number, number, number];
export type CameraCoordinateSpace = 'three-world' | 'ecef';

/** JSON-safe camera basis captured without exposing concrete Three.js or Cesium objects. */
export interface CameraPoseProbe {
  coordinateSpace: CameraCoordinateSpace;
  position: TransitionVector3;
  direction: TransitionVector3;
  up: TransitionVector3;
  verticalFovRadians: number;
  aspectRatio: number;
}

/** Normalized viewport coordinates keep probes independent from DPR and LED resolution. */
export interface TargetProjectionProbe {
  projectId: string;
  x: number;
  y: number;
  visible: boolean;
}

export interface RendererReadinessProbe {
  resourceReadyAtMs: number | null;
  meaningfulFrameReadyAtMs: number | null;
}

export interface RendererTransitionProbe {
  renderer: 'globe' | 'cesium';
  rendering: boolean;
  visible: boolean;
  opacity: number;
  frameCount: number;
  lastRenderAtMs: number | null;
  camera: CameraPoseProbe | null;
  targetProjection: TargetProjectionProbe | null;
  matchedSourceCamera: CameraPoseProbe | null;
  matchedSourceTargetProjection: TargetProjectionProbe | null;
  matchedSourceFrameAtMs: number | null;
  readiness: RendererReadinessProbe;
}

export type RendererOwnership = 'none' | 'globe' | 'overlap' | 'cesium' | 'fallback';

export interface HandoverTransitionProbe {
  projectId: string | null;
  sourceCamera: CameraPoseProbe | null;
  sourceTargetProjection: TargetProjectionProbe | null;
  status: string;
  progress: number;
  coverOpacity: number;
  ownership: RendererOwnership;
  startedAtMs: number | null;
  statusChangedAtMs: number;
  progressChangedAtMs: number;
  liveAlignmentSamples: number;
  maximumLiveCameraDelta: CameraPoseComparison | null;
  maximumLiveTargetProjectionDelta: number | null;
}

export interface TransitionObservabilitySnapshot {
  capturedAtMs: number;
  targetProjectId: string | null;
  sharedTickerRendererCount: number;
  globe: RendererTransitionProbe | null;
  cesium: RendererTransitionProbe | null;
  handover: HandoverTransitionProbe | null;
}

export interface CameraAlignmentThresholds {
  positionDistance: number;
  directionDeltaDegrees: number;
  upDeltaDegrees: number;
  verticalFovDeltaDegrees: number;
  aspectRatioDelta: number;
}

export interface CameraPoseComparison {
  comparable: boolean;
  aligned: boolean;
  reason?: 'coordinate-space-mismatch' | 'invalid-probe';
  positionDistance: number;
  directionDeltaDegrees: number;
  upDeltaDegrees: number;
  verticalFovDeltaDegrees: number;
  aspectRatioDelta: number;
}

export const DEFAULT_CAMERA_ALIGNMENT_THRESHOLDS: Readonly<CameraAlignmentThresholds> = {
  positionDistance: 0.01,
  directionDeltaDegrees: 0.25,
  upDeltaDegrees: 0.25,
  verticalFovDeltaDegrees: 0.25,
  aspectRatioDelta: 0.0001,
};

export interface TransitionFrameSample {
  elapsedMs: number;
  signature: readonly number[];
  handoverStatus: string;
  handoverProgress: number;
  coverOpacity: number;
  globeFrame: number;
  cesiumFrame: number;
}

export interface MaximumVisualChange {
  fromIndex: number;
  toIndex: number;
  elapsedMs: number;
  signatureDistance: number;
}

export interface TransitionFrameAnalysis {
  maximumVisualChange: MaximumVisualChange | null;
  longestOpaqueStationaryHoldMs: number;
}

export interface TransitionFrameAnalysisOptions {
  opaqueOpacityThreshold?: number;
  stationarySignatureThreshold?: number;
  stationaryProgressThreshold?: number;
}

function finiteVector(vector: TransitionVector3): boolean {
  return vector.every(Number.isFinite);
}

function length(vector: TransitionVector3): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function distance(left: TransitionVector3, right: TransitionVector3): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function angularDeltaDegrees(left: TransitionVector3, right: TransitionVector3): number {
  const denominator = length(left) * length(right);
  if (denominator === 0 || !Number.isFinite(denominator)) return Number.POSITIVE_INFINITY;
  const dot = left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
  const cosine = Math.max(-1, Math.min(1, dot / denominator));
  return (Math.acos(cosine) * 180) / Math.PI;
}

function isValidCameraProbe(probe: CameraPoseProbe): boolean {
  return (
    finiteVector(probe.position) &&
    finiteVector(probe.direction) &&
    finiteVector(probe.up) &&
    length(probe.direction) > 0 &&
    length(probe.up) > 0 &&
    Number.isFinite(probe.verticalFovRadians) &&
    probe.verticalFovRadians > 0 &&
    Number.isFinite(probe.aspectRatio) &&
    probe.aspectRatio > 0
  );
}

/**
 * Compares renderer-neutral camera probes. Pass 0 deliberately reports Three world-space and
 * Cesium ECEF probes as non-comparable; Pass 1 moves the globe probe onto the shared ECEF bridge.
 */
export function compareCameraPoseProbes(
  left: CameraPoseProbe,
  right: CameraPoseProbe,
  thresholds: CameraAlignmentThresholds = DEFAULT_CAMERA_ALIGNMENT_THRESHOLDS,
): CameraPoseComparison {
  if (!isValidCameraProbe(left) || !isValidCameraProbe(right)) {
    return {
      comparable: false,
      aligned: false,
      reason: 'invalid-probe',
      positionDistance: Number.POSITIVE_INFINITY,
      directionDeltaDegrees: Number.POSITIVE_INFINITY,
      upDeltaDegrees: Number.POSITIVE_INFINITY,
      verticalFovDeltaDegrees: Number.POSITIVE_INFINITY,
      aspectRatioDelta: Number.POSITIVE_INFINITY,
    };
  }

  if (left.coordinateSpace !== right.coordinateSpace) {
    return {
      comparable: false,
      aligned: false,
      reason: 'coordinate-space-mismatch',
      positionDistance: Number.POSITIVE_INFINITY,
      directionDeltaDegrees: Number.POSITIVE_INFINITY,
      upDeltaDegrees: Number.POSITIVE_INFINITY,
      verticalFovDeltaDegrees: Number.POSITIVE_INFINITY,
      aspectRatioDelta: Number.POSITIVE_INFINITY,
    };
  }

  const positionDistance = distance(left.position, right.position);
  const directionDeltaDegrees = angularDeltaDegrees(left.direction, right.direction);
  const upDeltaDegrees = angularDeltaDegrees(left.up, right.up);
  const verticalFovDeltaDegrees =
    (Math.abs(left.verticalFovRadians - right.verticalFovRadians) * 180) / Math.PI;
  const aspectRatioDelta = Math.abs(left.aspectRatio - right.aspectRatio);

  return {
    comparable: true,
    aligned:
      positionDistance <= thresholds.positionDistance &&
      directionDeltaDegrees <= thresholds.directionDeltaDegrees &&
      upDeltaDegrees <= thresholds.upDeltaDegrees &&
      verticalFovDeltaDegrees <= thresholds.verticalFovDeltaDegrees &&
      aspectRatioDelta <= thresholds.aspectRatioDelta,
    positionDistance,
    directionDeltaDegrees,
    upDeltaDegrees,
    verticalFovDeltaDegrees,
    aspectRatioDelta,
  };
}

export function frameSignatureDistance(
  first: readonly number[],
  second: readonly number[],
): number {
  const length = Math.max(first.length, second.length);
  if (length === 0) return 0;
  let total = 0;
  for (let index = 0; index < length; index += 1) {
    total += Math.abs((first[index] ?? 0) - (second[index] ?? 0));
  }
  return total / length;
}

/** Finds both the strongest visual beat and any stationary fully opaque interval. */
export function analyzeTransitionFrameSamples(
  samples: readonly TransitionFrameSample[],
  options: TransitionFrameAnalysisOptions = {},
): TransitionFrameAnalysis {
  const opaqueOpacityThreshold = options.opaqueOpacityThreshold ?? 0.98;
  const stationarySignatureThreshold = options.stationarySignatureThreshold ?? 0.15;
  const stationaryProgressThreshold = options.stationaryProgressThreshold ?? 0.002;
  let maximumVisualChange: MaximumVisualChange | null = null;
  let opaqueRunStartedAt: number | null = null;
  let longestOpaqueStationaryHoldMs = 0;

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (!previous || !current) continue;

    const signatureDistance = frameSignatureDistance(previous.signature, current.signature);
    if (!maximumVisualChange || signatureDistance > maximumVisualChange.signatureDistance) {
      maximumVisualChange = {
        fromIndex: index - 1,
        toIndex: index,
        elapsedMs: current.elapsedMs,
        signatureDistance,
      };
    }

    const stationaryOpaquePair =
      previous.coverOpacity >= opaqueOpacityThreshold &&
      current.coverOpacity >= opaqueOpacityThreshold &&
      signatureDistance <= stationarySignatureThreshold &&
      Math.abs(current.handoverProgress - previous.handoverProgress) <= stationaryProgressThreshold;

    if (stationaryOpaquePair) {
      opaqueRunStartedAt ??= previous.elapsedMs;
      longestOpaqueStationaryHoldMs = Math.max(
        longestOpaqueStationaryHoldMs,
        current.elapsedMs - opaqueRunStartedAt,
      );
    } else {
      opaqueRunStartedAt = null;
    }
  }

  return { maximumVisualChange, longestOpaqueStationaryHoldMs };
}

/** Uses a monotonic browser clock where available so frame and readiness timestamps compare. */
export function transitionNowMs(): number {
  return typeof performance !== 'undefined' && Number.isFinite(performance.now())
    ? performance.now()
    : Date.now();
}
