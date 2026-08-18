import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IDLE_ORBIT_PARAMETERS,
  GlobeCameraRig,
  MAX_PREVIEW_DISTANCE,
  MIN_PREVIEW_DISTANCE,
  type GlobePreviewProject,
  type RetargetMotionDriver,
} from '../../src/renderers/globe/camera-rig.js';
import { MOTION_DURATIONS_MS } from '../../src/orchestration/motion-tokens.js';

const PROJECT_A: GlobePreviewProject = {
  id: 'project-a',
  marker: { lat: 24, lon: -42 },
};
const PROJECT_B: GlobePreviewProject = {
  id: 'project-b',
  marker: { lat: -18, lon: 66 },
};

interface PendingMotion<T extends object> {
  target: T;
  destination: Partial<T>;
  durationMs: number;
  onUpdate: () => void;
  onComplete: () => void;
  cancelled: boolean;
}

class ControlledMotionDriver implements RetargetMotionDriver {
  private readonly pending: PendingMotion<object>[] = [];

  retarget<T extends object>(
    target: T,
    destination: Partial<T>,
    options: { durationMs: number; onUpdate: () => void; onComplete: () => void },
  ) {
    const motion: PendingMotion<T> = {
      target,
      destination,
      durationMs: options.durationMs,
      onUpdate: options.onUpdate,
      onComplete: options.onComplete,
      cancelled: false,
    };
    this.pending.push(motion);
    return {
      cancel: () => {
        motion.cancelled = true;
      },
    };
  }

  finish(index: number): void {
    const motion = this.pending[index];
    if (!motion) throw new Error(`Missing controlled motion ${index}.`);
    Object.assign(motion.target, motion.destination);
    motion.onUpdate();
    // Deliberately invoke even cancelled motions: the rig must independently reject stale
    // completion callbacks instead of trusting a motion engine to suppress them.
    motion.onComplete();
  }

  wasCancelled(index: number): boolean {
    return this.pending[index]?.cancelled ?? false;
  }

  durationAt(index: number): number {
    const motion = this.pending[index];
    if (!motion) throw new Error(`Missing controlled motion ${index}.`);
    return motion.durationMs;
  }
}

describe('GlobeCameraRig', () => {
  it('retargets a live preview to the final project without delivering an obsolete completion', () => {
    const driver = new ControlledMotionDriver();
    const rig = new GlobeCameraRig({ motionDriver: driver });
    const completions: string[] = [];

    rig.previewProject(PROJECT_A, { onComplete: () => completions.push(PROJECT_A.id) });
    rig.previewProject(PROJECT_B, { onComplete: () => completions.push(PROJECT_B.id) });

    expect(driver.wasCancelled(0)).toBe(true);
    driver.finish(0);
    expect(completions).toEqual([]);

    driver.finish(1);
    expect(completions).toEqual([PROJECT_B.id]);
    expect(rig.currentProjectId).toBe(PROJECT_B.id);
    expect(rig.isPreviewInFlight).toBe(false);
  });

  it('keeps every preview camera destination at space-level framing distances', () => {
    const driver = new ControlledMotionDriver();
    const rig = new GlobeCameraRig({ motionDriver: driver });

    rig.previewProject(PROJECT_A);
    driver.finish(0);

    expect(rig.orbit.distance).toBeGreaterThanOrEqual(MIN_PREVIEW_DISTANCE);
    expect(rig.orbit.distance).toBeLessThanOrEqual(MAX_PREVIEW_DISTANCE);
    expect(rig.camera.position.distanceTo(rig.focusPoint)).toBeCloseTo(rig.orbit.distance);
  });

  it('returns an idempotent cancellation handle that suppresses late completion delivery', () => {
    const driver = new ControlledMotionDriver();
    const rig = new GlobeCameraRig({ motionDriver: driver });
    let completions = 0;

    const handle = rig.previewProject(PROJECT_A, { onComplete: () => (completions += 1) });
    handle.cancel();
    handle.cancel();
    driver.finish(0);

    expect(driver.wasCancelled(0)).toBe(true);
    expect(completions).toBe(0);
    expect(rig.isPreviewInFlight).toBe(false);
  });

  it('uses a slower category-entry duration and returns the camera to its original idle orbit', () => {
    const driver = new ControlledMotionDriver();
    const rig = new GlobeCameraRig({ motionDriver: driver });

    rig.previewProject(PROJECT_A, { durationMs: MOTION_DURATIONS_MS.categoryPreviewEntry });
    expect(driver.durationAt(0)).toBe(MOTION_DURATIONS_MS.categoryPreviewEntry);
    driver.finish(0);

    rig.returnToIdle();
    driver.finish(1);

    expect(rig.orbit).toEqual(DEFAULT_IDLE_ORBIT_PARAMETERS);
    expect(rig.isPreviewInFlight).toBe(false);
  });

  it('immediately restores its controlled orbit after an external handover pose before idle motion', () => {
    const driver = new ControlledMotionDriver();
    const rig = new GlobeCameraRig({ motionDriver: driver });

    rig.previewProject(PROJECT_A);
    driver.finish(0);
    const previewCameraPosition = rig.camera.position.clone();
    const previewCameraFov = rig.camera.fov;
    const previewCameraAspect = rig.camera.aspect;
    const previewCameraUp = rig.camera.up.clone();

    // The handover mirrors Cesium directly into the Three camera while retaining the rig's
    // preview parameters. Returning to idle must not leave that near-surface external pose visible
    // until the next GSAP update.
    rig.camera.position.set(2, -1, 0.5);
    rig.camera.fov = 30;
    rig.camera.aspect = 0.8;
    rig.camera.up.set(0, 0, 1);
    rig.camera.lookAt(0, 0, 0);
    rig.camera.updateProjectionMatrix();
    rig.camera.updateMatrixWorld();

    rig.returnToIdle();

    expect(rig.camera.position.distanceTo(previewCameraPosition)).toBeLessThan(0.000_001);
    expect(rig.camera.fov).toBe(previewCameraFov);
    expect(rig.camera.aspect).toBe(previewCameraAspect);
    expect(rig.camera.up.distanceTo(previewCameraUp)).toBeLessThan(0.000_001);
    driver.finish(1);
    expect(rig.orbit).toEqual(DEFAULT_IDLE_ORBIT_PARAMETERS);
  });
});
