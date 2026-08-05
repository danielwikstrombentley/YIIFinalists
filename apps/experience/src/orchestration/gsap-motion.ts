import { gsap } from 'gsap';
import type { MotionEasing } from './motion-tokens.js';

// Small orchestration-bound GSAP adapter for renderer parameter retargets. Feature modules supply
// plain objects only; they never own an RAF loop or invoke GSAP directly.
export interface CancellableMotion {
  cancel(): void;
}

export interface RetargetMotionOptions {
  durationMs: number;
  ease: MotionEasing;
  onUpdate: () => void;
  onComplete: () => void;
}

export interface RetargetMotionDriver {
  retarget<T extends object>(
    target: T,
    destination: Partial<T>,
    options: RetargetMotionOptions,
  ): CancellableMotion;
}

export interface LoopMotionSegment<T extends object> {
  destination: Partial<T>;
  durationMs: number;
  ease: MotionEasing;
  position?: number;
}

export interface LoopingMotionDriver {
  loop<T extends object>(target: T, segments: readonly LoopMotionSegment<T>[]): CancellableMotion;
}

export const gsapRetargetMotionDriver: RetargetMotionDriver = {
  retarget<T extends object>(
    target: T,
    destination: Partial<T>,
    options: RetargetMotionOptions,
  ): CancellableMotion {
    const tween = gsap.to(target, {
      ...destination,
      duration: options.durationMs / 1000,
      ease: options.ease,
      overwrite: true,
      onUpdate: options.onUpdate,
      onComplete: options.onComplete,
    });
    return { cancel: () => tween.kill() };
  },
};

export const gsapLoopingMotionDriver: LoopingMotionDriver = {
  loop<T extends object>(target: T, segments: readonly LoopMotionSegment<T>[]): CancellableMotion {
    const timeline = gsap.timeline({ repeat: -1 });
    for (const segment of segments) {
      timeline.to(
        target,
        {
          ...segment.destination,
          duration: segment.durationMs / 1000,
          ease: segment.ease,
        },
        segment.position,
      );
    }
    return { cancel: () => timeline.kill() };
  },
};
