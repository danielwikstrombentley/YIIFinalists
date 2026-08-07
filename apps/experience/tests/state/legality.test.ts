import { getShortestPaths } from '@xstate/graph';
import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';
import { experienceMachine } from '../../src/state/machine.js';
import type { ExperienceEvent } from '../../src/state/types.js';
import { EXPERIENCE_STATE_IDS } from './state-table.fixture.js';

// @xstate/graph exhaustive path test (T010): asserts only the transitions tabulated in
// data-model.md §3 exist. MUST be red until T011 lands.

/** Flattens an XState state value (string | Record<string, StateValue>) to a dotted-path string. */
function flattenStateValue(value: unknown): string {
  if (typeof value === 'string') return value;
  const record = value as Record<string, unknown>;
  const [key] = Object.keys(record);
  const child = record[key!];
  return child ? `${key}.${flattenStateValue(child)}` : key!;
}

/** Concrete sample events covering every action in the semantic-action contract + internal events. */
const SAMPLE_EVENTS: ExperienceEvent[] = [
  { type: 'internal.assetsVerified' },
  { type: 'category.select', payload: { categoryId: 'cat-1' } },
  { type: 'category.select', payload: { categoryId: 'cat-2' } },
  { type: 'preview.hover', payload: { projectId: 'proj-1' } },
  { type: 'preview.hover', payload: { direction: 'next' } },
  { type: 'project.select', payload: {} },
  { type: 'internal.handoverToProjectComplete', generation: 0 },
  { type: 'internal.handoverToProjectComplete', generation: 1 },
  { type: 'internal.handoverToProjectComplete', generation: 2 },
  { type: 'internal.handoverToProjectComplete', generation: 3 },
  { type: 'content.select', payload: { position: 1 } },
  { type: 'content.select', payload: { position: 2 } },
  { type: 'internal.sequenceComplete', generation: 0 },
  { type: 'internal.sequenceComplete', generation: 1 },
  { type: 'internal.sequenceComplete', generation: 2 },
  { type: 'internal.sequenceComplete', generation: 3 },
  { type: 'internal.sequenceComplete', generation: 4 },
  { type: 'nav.back', payload: {} },
  { type: 'internal.handoverToPreviewComplete', generation: 0 },
  { type: 'internal.handoverToPreviewComplete', generation: 1 },
  { type: 'internal.handoverToPreviewComplete', generation: 2 },
  { type: 'internal.handoverToPreviewComplete', generation: 3 },
  { type: 'internal.handoverToPreviewComplete', generation: 4 },
  { type: 'internal.handoverToPreviewComplete', generation: 5 },
  { type: 'nav.idle', payload: {} },
  { type: 'operator.reset', payload: {} },
  { type: 'internal.adapterFailure', reason: 'test-seeded-failure' },
  { type: 'internal.recovered' },
];

describe('Experience machine legality (@xstate/graph exhaustive traversal)', () => {
  // Context (generation counters, ids) is irrelevant to state-graph legality and would otherwise
  // make every distinct context value look like a "new" state to the traversal (explosion) — only
  // the state value (which state node is active) matters here.
  const traversalOptions = {
    events: SAMPLE_EVENTS,
    limit: 500,
    serializeState: (state: { value: unknown }) => JSON.stringify(state.value),
  };

  it('only reaches the 9 states tabulated in data-model.md §3', () => {
    const paths = getShortestPaths(experienceMachine, traversalOptions);
    const reachedStateIds = new Set(paths.map((path) => flattenStateValue(path.state.value)));
    for (const id of reachedStateIds) {
      expect(EXPERIENCE_STATE_IDS as readonly string[]).toContain(id);
    }
  });

  it('reaches every one of the 9 tabulated states', () => {
    const paths = getShortestPaths(experienceMachine, traversalOptions);
    const reachedStateIds = new Set(paths.map((path) => flattenStateValue(path.state.value)));
    for (const id of EXPERIENCE_STATE_IDS) {
      expect(reachedStateIds, `expected to reach state "${id}"`).toContain(id);
    }
  });

  it('seeded bad transition: content.select while idle does not start playback', () => {
    const actor = createActor(experienceMachine).start();
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('boot');

    actor.send({ type: 'internal.assetsVerified' });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('idle');

    // content.select has no handler in `idle` — this MUST be a no-op (illegal-transition detection).
    actor.send({ type: 'content.select', payload: { position: 1 } });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('idle');
    expect(actor.getSnapshot().context.activeContentPosition).toBeNull();

    actor.stop();
  });

  it('seeded bad transition: preview.hover while idle does not enter a category', () => {
    const actor = createActor(experienceMachine).start();
    actor.send({ type: 'internal.assetsVerified' });

    actor.send({ type: 'preview.hover', payload: { projectId: 'proj-1' } });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('idle');
    expect(actor.getSnapshot().context.previewedProjectId).toBeNull();

    actor.stop();
  });

  it('reaches projectLanding, contentPlaying, and contentFinalHold via the full happy path', () => {
    const actor = createActor(experienceMachine).start();
    actor.send({ type: 'internal.assetsVerified' });
    actor.send({ type: 'category.select', payload: { categoryId: 'cat-1' } });
    actor.send({ type: 'preview.hover', payload: { projectId: 'proj-1' } });
    actor.send({ type: 'project.select', payload: {} });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('transitionToProject');

    const generationAtTransition = actor.getSnapshot().context.generation;
    actor.send({ type: 'internal.handoverToProjectComplete', generation: generationAtTransition });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('projectLanding');

    actor.send({ type: 'content.select', payload: { position: 1 } });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('contentPlaying');

    const generationAtPlayback = actor.getSnapshot().context.generation;
    actor.send({ type: 'internal.sequenceComplete', generation: generationAtPlayback });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('contentFinalHold');

    actor.stop();
  });

  it('returns from a landing through the reverse handover before completing the idle reset', () => {
    const actor = createActor(experienceMachine).start();
    actor.send({ type: 'internal.assetsVerified' });
    actor.send({ type: 'category.select', payload: { categoryId: 'cat-1' } });
    actor.send({ type: 'preview.hover', payload: { projectId: 'proj-1' } });
    actor.send({ type: 'project.select', payload: {} });
    actor.send({
      type: 'internal.handoverToProjectComplete',
      generation: actor.getSnapshot().context.generation,
    });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('projectLanding');

    actor.send({ type: 'nav.idle', payload: {} });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('transitionToPreview');

    actor.send({
      type: 'internal.handoverToPreviewComplete',
      generation: actor.getSnapshot().context.generation,
    });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('idle');
    actor.stop();
  });
});

describe('Reverse-handover category-switch does not strand the machine (PH2 review round 1, finding #3)', () => {
  it('a second category.select mid-reverse-handover still completes on the original completion token, landing on the latest category', () => {
    const actor = createActor(experienceMachine).start();
    actor.send({ type: 'internal.assetsVerified' });
    actor.send({ type: 'category.select', payload: { categoryId: 'cat-1' } });
    actor.send({ type: 'preview.hover', payload: { projectId: 'proj-1' } });
    actor.send({ type: 'project.select', payload: {} });
    const generationAtProjectHandover = actor.getSnapshot().context.generation;
    actor.send({
      type: 'internal.handoverToProjectComplete',
      generation: generationAtProjectHandover,
    });
    actor.send({ type: 'content.select', payload: { position: 1 } });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('contentPlaying');

    actor.send({ type: 'category.select', payload: { categoryId: 'cat-2' } });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('transitionToPreview');
    const generationAtHandover = actor.getSnapshot().context.generation;

    // A second category.select while already mid-reverse-handover must NOT invalidate the
    // in-flight completion token (this exact sequence stranded the machine before the fix).
    actor.send({ type: 'category.select', payload: { categoryId: 'cat-3' } });
    expect(actor.getSnapshot().context.generation).toBe(generationAtHandover);
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('transitionToPreview');

    actor.send({
      type: 'internal.handoverToPreviewComplete',
      generation: generationAtHandover,
    });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('categoryActive.preview');
    // Lands on the LAST category requested mid-handover, not the first.
    expect(actor.getSnapshot().context.activeCategoryId).toBe('cat-3');

    actor.stop();
  });

  it('a stale (pre-interruption) completion token is still correctly ignored', () => {
    const actor = createActor(experienceMachine).start();
    actor.send({ type: 'internal.assetsVerified' });
    actor.send({ type: 'category.select', payload: { categoryId: 'cat-1' } });
    actor.send({ type: 'preview.hover', payload: { projectId: 'proj-1' } });
    actor.send({ type: 'project.select', payload: {} });
    const generationAtProjectHandover = actor.getSnapshot().context.generation;
    actor.send({
      type: 'internal.handoverToProjectComplete',
      generation: generationAtProjectHandover,
    });
    actor.send({ type: 'content.select', payload: { position: 1 } });

    actor.send({ type: 'category.select', payload: { categoryId: 'cat-2' } });
    const staleGeneration = actor.getSnapshot().context.generation;

    // Something else bumps generation before the handover completes (e.g. an operator reset) —
    // the old completion token must still be rejected as stale.
    actor.send({ type: 'operator.reset', payload: {} });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('idle');

    actor.send({ type: 'internal.handoverToPreviewComplete', generation: staleGeneration });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('idle'); // unaffected by the stale event

    actor.stop();
  });
});
