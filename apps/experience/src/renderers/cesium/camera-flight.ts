import { Cartesian3 } from 'cesium';
import type { CameraPose } from '@yii/content-schema';
import { MOTION_DURATIONS_MS } from '../../orchestration/motion-tokens.js';
import { landingPoseFromCameraPose } from '../handover/geographic-camera-pose.js';

export interface NativeCameraOrientation {
  heading?: number;
  pitch?: number;
  roll?: number;
  direction?: Cartesian3;
  up?: Cartesian3;
}

/** Structural Cesium `Camera.flyTo` contract, deliberately injectable for deterministic tests. */
export interface NativeCameraFlightOptions {
  destination: unknown;
  orientation?: NativeCameraOrientation;
  duration?: number;
  complete?: () => void;
  cancel?: () => void;
}

export interface CesiumCameraLike {
  flyTo(options: NativeCameraFlightOptions): void;
  cancelFlight(): void;
}

export interface NativeCameraPose {
  destination: unknown;
  orientation?: NativeCameraOrientation;
}

export interface CameraFlightResult {
  status: 'completed' | 'cancelled' | 'failed';
  error?: unknown;
}

export interface CameraFlightHandle {
  finished: Promise<CameraFlightResult>;
  cancel(): void;
}

export interface CesiumCameraFlightAdapterOptions {
  camera: CesiumCameraLike;
  poseMapper?: (pose: CameraPose) => NativeCameraPose;
  defaultDurationSeconds?: number;
}

interface ActiveFlight {
  settled: boolean;
  settle(result: CameraFlightResult): void;
}

/**
 * Converts the content package's target/orientation/range framing into an explicit Cesium camera
 * pose. The destination is a camera position exactly `range` metres from the approved target;
 * direction/up retain heading, pitch, and roll in that target's local geographic frame.
 */
export function mapCameraPoseToCesium(pose: CameraPose): NativeCameraPose {
  const mapped = landingPoseFromCameraPose(pose);
  return {
    destination: new Cartesian3(...mapped.positionEcef),
    orientation: {
      direction: new Cartesian3(...mapped.directionEcef),
      up: new Cartesian3(...mapped.upEcef),
    },
  };
}

/**
 * Sole native-camera writer for the Cesium stage. Its explicit guard is used by handover and
 * geographic-format code before any GSAP mutation, making a concurrent native/GSAP camera write
 * an immediate developer/test failure rather than a nondeterministic visual race.
 */
export class CesiumCameraFlightAdapter {
  private readonly camera: CesiumCameraLike;
  private readonly poseMapper: (pose: CameraPose) => NativeCameraPose;
  private readonly defaultDurationSeconds: number;
  private activeFlight: ActiveFlight | null = null;

  constructor(options: CesiumCameraFlightAdapterOptions) {
    this.camera = options.camera;
    this.poseMapper = options.poseMapper ?? mapCameraPoseToCesium;
    this.defaultDurationSeconds =
      options.defaultDurationSeconds ?? MOTION_DURATIONS_MS.handover / 1_000;
  }

  get isNativeFlightActive(): boolean {
    return this.activeFlight !== null;
  }

  /** Throws in development/test paths if another subsystem tries to write the Cesium camera. */
  assertGsapCameraWriteAllowed(): void {
    if (this.activeFlight) {
      throw new Error(
        'GSAP cannot write the Cesium camera while a native Cesium flight is active.',
      );
    }
  }

  flyToFraming(
    framing: Pick<{ landingCamera: CameraPose }, 'landingCamera'>,
    durationSeconds = this.defaultDurationSeconds,
  ): CameraFlightHandle {
    // Native camera flights are also singular: a newer request structurally cancels the old one.
    this.cancelActiveFlight();

    const pose = this.poseMapper(framing.landingCamera);
    let resolve!: (result: CameraFlightResult) => void;
    const finished = new Promise<CameraFlightResult>((resolveFlight) => {
      resolve = resolveFlight;
    });

    const active: ActiveFlight = {
      settled: false,
      settle: (result) => {
        if (active.settled) return;
        active.settled = true;
        if (this.activeFlight === active) this.activeFlight = null;
        resolve(result);
      },
    };
    this.activeFlight = active;

    try {
      this.camera.flyTo({
        ...pose,
        duration: durationSeconds,
        complete: () => active.settle({ status: 'completed' }),
        cancel: () => active.settle({ status: 'cancelled' }),
      });
    } catch (error) {
      active.settle({ status: 'failed', error });
    }

    return {
      finished,
      cancel: () => {
        if (active.settled) return;
        try {
          this.camera.cancelFlight();
        } finally {
          // Cesium normally invokes the native `cancel` callback, but settle here as a backstop
          // so every adapter cancellation is deterministic even in a degraded/mock environment.
          active.settle({ status: 'cancelled' });
        }
      },
    };
  }

  dispose(): void {
    this.cancelActiveFlight();
  }

  private cancelActiveFlight(): void {
    const active = this.activeFlight;
    if (!active || active.settled) return;
    try {
      this.camera.cancelFlight();
    } finally {
      active.settle({ status: 'cancelled' });
    }
  }
}
