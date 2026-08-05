import { describe, expect, it, vi } from 'vitest';
import type {
  LoopingMotionDriver,
  LoopMotionSegment,
} from '../../src/orchestration/gsap-motion.js';
import { GlobeIdleLoop, type GlobeIdleParameters } from '../../src/renderers/globe/idle-loop.js';

describe('GlobeIdleLoop', () => {
  it('runs rotation and solar motion as independent continuous cycles with editable speeds', () => {
    const rotationCancel = vi.fn();
    const sunCancel = vi.fn();
    const loop = vi
      .fn()
      .mockReturnValueOnce({ cancel: rotationCancel })
      .mockReturnValueOnce({ cancel: sunCancel });
    const motionDriver = { loop } as unknown as LoopingMotionDriver;
    const parameters: GlobeIdleParameters = {
      rotationY: 0.75,
      cloudPhase: 0,
      sunOrbit: 1.1,
    };
    const idleLoop = new GlobeIdleLoop(parameters, {
      rotationCycleSeconds: 80,
      sunOrbitCycleSeconds: 240,
      motionDriver,
    });

    idleLoop.start();
    idleLoop.start();

    expect(loop).toHaveBeenCalledTimes(2);
    const rotationSegments = loop.mock
      .calls[0]?.[1] as readonly LoopMotionSegment<GlobeIdleParameters>[];
    const sunSegments = loop.mock
      .calls[1]?.[1] as readonly LoopMotionSegment<GlobeIdleParameters>[];
    expect(rotationSegments).toEqual([
      {
        destination: { rotationY: 0.75 + Math.PI * 2 },
        durationMs: 80_000,
        ease: 'none',
      },
    ]);
    expect(sunSegments).toEqual([
      {
        destination: { sunOrbit: 1.1 + Math.PI * 2 },
        durationMs: 240_000,
        ease: 'none',
      },
    ]);
    expect(idleLoop.running).toBe(true);

    idleLoop.stop();
    idleLoop.stop();

    expect(rotationCancel).toHaveBeenCalledOnce();
    expect(sunCancel).toHaveBeenCalledOnce();
    expect(idleLoop.running).toBe(false);
  });
});
