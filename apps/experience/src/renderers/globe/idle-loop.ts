import {
  gsapLoopingMotionDriver,
  type CancellableMotion,
  type LoopingMotionDriver,
} from '../../orchestration/gsap-motion.js';
import { MOTION_DURATIONS_MS, MOTION_EASINGS } from '../../orchestration/motion-tokens.js';

// Values are tweened by GSAP, while the adapter's registration with the application-owned ticker
// renders the scene. This module never creates a requestAnimationFrame loop of its own.
export interface GlobeIdleParameters {
  rotationY: number;
  cloudPhase: number;
  sunOrbit: number;
}

export const DEFAULT_GLOBE_IDLE_PARAMETERS: GlobeIdleParameters = {
  rotationY: 0,
  cloudPhase: 0,
  sunOrbit: 0.55,
};

export class GlobeIdleLoop {
  private motion: CancellableMotion | null = null;

  constructor(
    private readonly parameters: GlobeIdleParameters,
    private readonly motionDriver: LoopingMotionDriver = gsapLoopingMotionDriver,
  ) {}

  start(): void {
    if (this.motion) return;

    this.motion = this.motionDriver.loop(this.parameters, [
      {
        destination: { rotationY: Math.PI * 2 },
        durationMs: MOTION_DURATIONS_MS.globeIdleOrbit,
        ease: MOTION_EASINGS.linear,
      },
      {
        destination: { cloudPhase: 1 },
        durationMs: MOTION_DURATIONS_MS.globeCloudCycle,
        ease: MOTION_EASINGS.linear,
        position: 0,
      },
      {
        destination: { sunOrbit: Math.PI * 2 + DEFAULT_GLOBE_IDLE_PARAMETERS.sunOrbit },
        durationMs: MOTION_DURATIONS_MS.globeDayNightCycle,
        ease: MOTION_EASINGS.linear,
        position: 0,
      },
    ]);
  }

  stop(): void {
    this.motion?.cancel();
    this.motion = null;
  }

  get running(): boolean {
    return this.motion !== null;
  }
}
