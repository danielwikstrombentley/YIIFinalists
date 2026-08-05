import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { MarkerSpec } from '@yii/content-schema';
import {
  gsapRetargetMotionDriver,
  type CancellableMotion,
  type RetargetMotionDriver,
} from '../../orchestration/gsap-motion.js';
import { MOTION_DURATIONS_MS, MOTION_EASINGS } from '../../orchestration/motion-tokens.js';

// FR-006 requires a whole/near-whole Earth in every preview. These values are intentionally
// exported for direct unit coverage and are never left to per-project code.
export const MIN_PREVIEW_DISTANCE = 12;
export const MAX_PREVIEW_DISTANCE = 17;
const DEFAULT_PREVIEW_DISTANCE = 14.5;
const MAX_PREVIEW_ELEVATION = 0.72;
const FOCUS_OFFSET = 0.28;

export interface GlobePreviewProject {
  id: string;
  marker: MarkerSpec;
  previewEmphasis?: { markerScale?: number };
}

export interface OrbitParameters {
  azimuth: number;
  elevation: number;
  distance: number;
  focusX: number;
  focusY: number;
  focusZ: number;
}

/** Original whole-globe composition restored whenever the experience re-enters idle. */
export const DEFAULT_IDLE_ORBIT_PARAMETERS: Readonly<OrbitParameters> = {
  azimuth: 0.4,
  elevation: 0.12,
  distance: DEFAULT_PREVIEW_DISTANCE,
  focusX: 0,
  focusY: 0,
  focusZ: 0,
};

export interface PreviewHandle {
  cancel(): void;
}

export interface GlobeCameraRigOptions {
  camera?: PerspectiveCamera;
  motionDriver?: RetargetMotionDriver;
}

function nearestAngle(current: number, target: number): number {
  const fullTurn = Math.PI * 2;
  const delta = ((((target - current + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI;
  return current + delta;
}

function destinationFor(project: GlobePreviewProject, current: OrbitParameters): OrbitParameters {
  const latitude = MathUtils.degToRad(project.marker.lat);
  const longitude = MathUtils.degToRad(project.marker.lon);
  const markerScale = project.previewEmphasis?.markerScale ?? 1;
  const direction = new Vector3(
    Math.cos(latitude) * Math.cos(longitude),
    Math.sin(latitude),
    Math.cos(latitude) * Math.sin(longitude),
  );
  const distance = MathUtils.clamp(
    DEFAULT_PREVIEW_DISTANCE - Math.max(0, markerScale - 1) * 0.35,
    MIN_PREVIEW_DISTANCE,
    MAX_PREVIEW_DISTANCE,
  );

  return {
    azimuth: nearestAngle(current.azimuth, longitude + Math.PI),
    elevation: MathUtils.clamp(latitude * 0.72, -MAX_PREVIEW_ELEVATION, MAX_PREVIEW_ELEVATION),
    distance,
    focusX: direction.x * FOCUS_OFFSET,
    focusY: direction.y * FOCUS_OFFSET,
    focusZ: direction.z * FOCUS_OFFSET,
  };
}

function matchesOrbit(left: OrbitParameters, right: OrbitParameters): boolean {
  return (
    left.azimuth === right.azimuth &&
    left.elevation === right.elevation &&
    left.distance === right.distance &&
    left.focusX === right.focusX &&
    left.focusY === right.focusY &&
    left.focusZ === right.focusZ
  );
}

/**
 * Orbit-parameter preview camera. It drives a Three camera only from the application-owned GSAP
 * motion adapter, so new hover events cancel/retarget one live tween rather than queuing flights.
 */
export class GlobeCameraRig {
  readonly camera: PerspectiveCamera;
  readonly focusPoint = new Vector3();

  private readonly motionDriver: RetargetMotionDriver;
  private readonly parameters: OrbitParameters = { ...DEFAULT_IDLE_ORBIT_PARAMETERS };
  private activeMotion: CancellableMotion | null = null;
  private activeGeneration: number | null = null;
  private generation = 0;
  private settledProjectId: string | null = null;
  private disposed = false;

  constructor(options: GlobeCameraRigOptions = {}) {
    this.camera = options.camera ?? new PerspectiveCamera(42, 16 / 9, 0.1, 100);
    this.motionDriver = options.motionDriver ?? gsapRetargetMotionDriver;
    this.syncCamera();
  }

  previewProject(
    project: GlobePreviewProject,
    options: { onComplete?: () => void; durationMs?: number } = {},
  ): PreviewHandle {
    if (this.disposed) return { cancel: () => {} };

    this.cancelActiveMotion();
    const generation = ++this.generation;
    const destination = destinationFor(project, this.parameters);
    let settled = false;
    this.activeGeneration = generation;
    const motion = this.motionDriver.retarget(this.parameters, destination, {
      durationMs: options.durationMs ?? MOTION_DURATIONS_MS.previewRetarget,
      ease: MOTION_EASINGS.gentle,
      onUpdate: () => this.syncCamera(),
      onComplete: () => {
        if (
          this.disposed ||
          generation !== this.generation ||
          this.activeGeneration !== generation
        ) {
          return;
        }
        settled = true;
        this.syncCamera();
        this.activeMotion = null;
        this.activeGeneration = null;
        this.settledProjectId = project.id;
        options.onComplete?.();
      },
    });

    // A custom driver used in a unit test can finish synchronously; do not resurrect a completed
    // motion after its completion callback has cleared the active slot.
    if (!settled && this.activeGeneration === generation) {
      this.activeMotion = motion;
    }

    let cancelled = false;
    return {
      cancel: () => {
        if (cancelled) return;
        cancelled = true;
        if (this.activeGeneration !== generation) return;
        this.cancelActiveMotion();
        this.generation += 1;
      },
    };
  }

  /** Smoothly restores the original whole-globe camera composition for idle presentation. */
  returnToIdle(): PreviewHandle {
    if (this.disposed) return { cancel: () => {} };

    this.cancelActiveMotion();
    const generation = ++this.generation;
    const destination = { ...DEFAULT_IDLE_ORBIT_PARAMETERS };
    if (matchesOrbit(this.parameters, destination)) {
      this.syncCamera();
      this.settledProjectId = null;
      return { cancel: () => {} };
    }

    let settled = false;
    this.activeGeneration = generation;
    const motion = this.motionDriver.retarget(this.parameters, destination, {
      durationMs: MOTION_DURATIONS_MS.idleReturn,
      ease: MOTION_EASINGS.gentle,
      onUpdate: () => this.syncCamera(),
      onComplete: () => {
        if (
          this.disposed ||
          generation !== this.generation ||
          this.activeGeneration !== generation
        ) {
          return;
        }
        settled = true;
        this.syncCamera();
        this.activeMotion = null;
        this.activeGeneration = null;
        this.settledProjectId = null;
      },
    });

    if (!settled && this.activeGeneration === generation) {
      this.activeMotion = motion;
    }

    let cancelled = false;
    return {
      cancel: () => {
        if (cancelled) return;
        cancelled = true;
        if (this.activeGeneration !== generation) return;
        this.cancelActiveMotion();
        this.generation += 1;
      },
    };
  }

  resize(width: number, height: number): void {
    if (this.disposed || width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancelActiveMotion();
    this.disposed = true;
  }

  get orbit(): Readonly<OrbitParameters> {
    return { ...this.parameters };
  }

  get currentProjectId(): string | null {
    return this.settledProjectId;
  }

  get isPreviewInFlight(): boolean {
    return this.activeMotion !== null;
  }

  private cancelActiveMotion(): void {
    this.activeMotion?.cancel();
    this.activeMotion = null;
    this.activeGeneration = null;
  }

  private syncCamera(): void {
    this.focusPoint.set(this.parameters.focusX, this.parameters.focusY, this.parameters.focusZ);
    const horizontalDistance = this.parameters.distance * Math.cos(this.parameters.elevation);
    this.camera.position.set(
      this.focusPoint.x + horizontalDistance * Math.cos(this.parameters.azimuth),
      this.focusPoint.y + this.parameters.distance * Math.sin(this.parameters.elevation),
      this.focusPoint.z + horizontalDistance * Math.sin(this.parameters.azimuth),
    );
    this.camera.lookAt(this.focusPoint);
    this.camera.updateMatrixWorld();
  }
}

export type { RetargetMotionDriver };
