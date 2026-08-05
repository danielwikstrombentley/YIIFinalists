import {
  gsapLoopingMotionDriver,
  type CancellableMotion,
  type LoopingMotionDriver,
} from '../../orchestration/gsap-motion.js';
import { MOTION_EASINGS } from '../../orchestration/motion-tokens.js';

// Values are tweened by GSAP, while the adapter's registration with the application-owned ticker
// renders the scene. This module never creates a requestAnimationFrame loop of its own.
export interface GlobeIdleParameters {
  rotationY: number;
  /** Deterministic starting point in the seamless cloud cycle; runtime evolution uses frame delta. */
  cloudPhase: number;
  sunOrbit: number;
}

export const DEFAULT_GLOBE_IDLE_PARAMETERS: GlobeIdleParameters = {
  rotationY: 0,
  cloudPhase: 0,
  sunOrbit: 0.55,
};

export interface GlobeIdleLoopOptions {
  rotationCycleSeconds: number;
  sunOrbitCycleSeconds: number;
  motionDriver?: LoopingMotionDriver;
}

export class GlobeIdleLoop {
  private rotationMotion: CancellableMotion | null = null;
  private sunMotion: CancellableMotion | null = null;
  private readonly motionDriver: LoopingMotionDriver;

  constructor(
    private readonly parameters: GlobeIdleParameters,
    private readonly options: GlobeIdleLoopOptions,
  ) {
    this.motionDriver = options.motionDriver ?? gsapLoopingMotionDriver;
  }

  start(): void {
    if (this.running) return;

    const rotationMotion = this.motionDriver.loop(this.parameters, [
      {
        destination: { rotationY: this.parameters.rotationY + Math.PI * 2 },
        durationMs: Math.max(this.options.rotationCycleSeconds, 0.001) * 1000,
        ease: MOTION_EASINGS.linear,
      },
    ]);
    try {
      this.sunMotion = this.motionDriver.loop(this.parameters, [
        {
          destination: { sunOrbit: this.parameters.sunOrbit + Math.PI * 2 },
          durationMs: Math.max(this.options.sunOrbitCycleSeconds, 0.001) * 1000,
          ease: MOTION_EASINGS.linear,
        },
      ]);
      this.rotationMotion = rotationMotion;
    } catch (error) {
      rotationMotion.cancel();
      throw error;
    }
  }

  stop(): void {
    this.rotationMotion?.cancel();
    this.sunMotion?.cancel();
    this.rotationMotion = null;
    this.sunMotion = null;
  }

  get running(): boolean {
    return this.rotationMotion !== null || this.sunMotion !== null;
  }
}
