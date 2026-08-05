import { gsap } from 'gsap';
import type { Beat, CompositionSpec } from '@yii/content-schema';

// Timeline factory (T016): builds one GSAP timeline from a sequence's data-driven composition.
// No feature code creates free-standing tweens — every tween in the app is created here, confined
// to `orchestration/` (T016 Accept). Beats reference targets by semantic id (`beat.target`), not
// live DOM/3D objects; `resolveTarget` maps an id to the property bag GSAP actually tweens. The
// real mapping to renderer/DOM targets is owned by the content-format library (`formats/`, a
// later phase) — the default resolver here is a plain in-memory stand-in so the orchestrator's
// own lifecycle is fully testable without it.

export type TargetResolver = (targetId: string) => object;

export function createDefaultTargetResolver(): TargetResolver {
  const targets = new Map<string, object>();
  return (targetId: string) => {
    let target = targets.get(targetId);
    if (!target) {
      target = {};
      targets.set(targetId, target);
    }
    return target;
  };
}

function applyComposition(
  timeline: gsap.core.Timeline,
  composition: CompositionSpec,
  resolveTarget: TargetResolver,
  atSeconds: number,
): void {
  for (const element of composition.elements) {
    timeline.set(resolveTarget(element.target), element.properties, atSeconds);
  }
}

export interface BuildTimelineOptions {
  openingState: CompositionSpec;
  beats: readonly Beat[];
  finalFrame: CompositionSpec;
  resolveTarget?: TargetResolver;
  onProgress?: (progress: number) => void;
  onComplete?: () => void;
}

export function buildSequenceTimeline(options: BuildTimelineOptions): gsap.core.Timeline {
  const resolveTarget = options.resolveTarget ?? createDefaultTargetResolver();

  const timeline = gsap.timeline({
    paused: true,
    onUpdate: () => options.onProgress?.(timeline.progress()),
    onComplete: () => options.onComplete?.(),
  });

  applyComposition(timeline, options.openingState, resolveTarget, 0);

  for (const beat of options.beats) {
    const target = resolveTarget(beat.target ?? beat.type);
    timeline.to(
      target,
      { ...beat.params, duration: beat.duration / 1000, ease: beat.easing ?? 'none' },
      beat.startTime / 1000,
    );
  }

  const finalAtSeconds = options.beats.reduce(
    (latest, beat) => Math.max(latest, (beat.startTime + beat.duration) / 1000),
    0,
  );
  applyComposition(timeline, options.finalFrame, resolveTarget, finalAtSeconds);

  return timeline;
}
