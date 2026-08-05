import { gsap } from 'gsap';
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
  private timeline: gsap.core.Timeline | null = null;

  constructor(private readonly parameters: GlobeIdleParameters) {}

  start(): void {
    if (this.timeline) return;

    this.timeline = gsap
      .timeline({ repeat: -1 })
      .to(this.parameters, {
        rotationY: Math.PI * 2,
        duration: MOTION_DURATIONS_MS.globeIdleOrbit / 1000,
        ease: MOTION_EASINGS.linear,
      })
      .to(
        this.parameters,
        {
          cloudPhase: 1,
          duration: MOTION_DURATIONS_MS.globeCloudCycle / 1000,
          ease: MOTION_EASINGS.linear,
        },
        0,
      )
      .to(
        this.parameters,
        {
          sunOrbit: Math.PI * 2 + DEFAULT_GLOBE_IDLE_PARAMETERS.sunOrbit,
          duration: MOTION_DURATIONS_MS.globeDayNightCycle / 1000,
          ease: MOTION_EASINGS.linear,
        },
        0,
      );
  }

  stop(): void {
    this.timeline?.kill();
    this.timeline = null;
  }

  get running(): boolean {
    return this.timeline !== null;
  }
}
