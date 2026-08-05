import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';
import { experienceMachine } from '../../src/state/machine.js';
import type { ExperienceEvent } from '../../src/state/types.js';

// T022 (red-first): T028 must give the machine a read-only category -> ordered-project mapping
// when the validated release finishes loading. The machine remains the sole navigation owner;
// React, the input boundary, and renderer adapters must not choose a preview independently.
const CATEGORY_PROJECTS = [
  { id: 'cat-1', projectIds: ['cat-1-proj-1', 'cat-1-proj-2', 'cat-1-proj-3'] },
  { id: 'cat-2', projectIds: ['cat-2-proj-1', 'cat-2-proj-2', 'cat-2-proj-3'] },
] as const;

function flattenStateValue(value: unknown): string {
  if (typeof value === 'string') return value;
  const record = value as Record<string, unknown>;
  const [key] = Object.keys(record);
  const child = record[key!];
  return child ? `${key}.${flattenStateValue(child)}` : key!;
}

function startReleaseBackedActor() {
  const actor = createActor(experienceMachine).start();

  // This event is intentionally cast until T028 adds it to ExperienceEvent. It is the state
  // boundary for the already-validated category order, not a transport event.
  actor.send({
    type: 'internal.releaseLoaded',
    categories: CATEGORY_PROJECTS,
  } as unknown as ExperienceEvent);
  actor.send({ type: 'internal.assetsVerified' });

  expect(flattenStateValue(actor.getSnapshot().value)).toBe('idle');
  return actor;
}

describe('US1 category selection (FR-005, FR-007)', () => {
  it('routes category selection from idle into preview with the category first project active', () => {
    const actor = startReleaseBackedActor();
    actor.send({ type: 'category.select', payload: { categoryId: 'cat-1' } });

    const snapshot = actor.getSnapshot();
    expect(flattenStateValue(snapshot.value)).toBe('categoryActive.preview');
    expect(snapshot.context.activeCategoryId).toBe('cat-1');
    expect(snapshot.context.previewedProjectId).toBe('cat-1-proj-1');

    actor.stop();
  });

  it('always re-enters a deliberately re-pressed category at its first project', () => {
    const actor = startReleaseBackedActor();
    actor.send({ type: 'category.select', payload: { categoryId: 'cat-1' } });
    actor.send({ type: 'preview.hover', payload: { projectId: 'cat-1-proj-3' } });
    const generationBeforeReentry = actor.getSnapshot().context.generation;

    // The input boundary already applies the one-second dedup policy. A machine-level repeated
    // category event therefore represents a deliberate press and must restart the journey.
    actor.send({ type: 'category.select', payload: { categoryId: 'cat-1' } });

    const snapshot = actor.getSnapshot();
    expect(flattenStateValue(snapshot.value)).toBe('categoryActive.preview');
    expect(snapshot.context.activeCategoryId).toBe('cat-1');
    expect(snapshot.context.previewedProjectId).toBe('cat-1-proj-1');
    expect(snapshot.context.generation).toBeGreaterThan(generationBeforeReentry);

    actor.stop();
  });

  it('replaces the active category and retains exactly one concrete preview reference', () => {
    const actor = startReleaseBackedActor();
    const observedPreviewIds: Array<string | null> = [];
    const subscription = actor.subscribe((snapshot) => {
      if (flattenStateValue(snapshot.value) === 'categoryActive.preview') {
        observedPreviewIds.push(snapshot.context.previewedProjectId);
      }
    });

    actor.send({ type: 'category.select', payload: { categoryId: 'cat-1' } });
    actor.send({ type: 'category.select', payload: { categoryId: 'cat-2' } });

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.activeCategoryId).toBe('cat-2');
    expect(snapshot.context.previewedProjectId).toBe('cat-2-proj-1');
    expect(observedPreviewIds).not.toContain(null);
    expect(new Set(observedPreviewIds)).toEqual(new Set(['cat-1-proj-1', 'cat-2-proj-1']));

    subscription.unsubscribe();
    actor.stop();
  });

  it('updates the one preview reference when a valid hover selects a category project', () => {
    const actor = startReleaseBackedActor();
    actor.send({ type: 'category.select', payload: { categoryId: 'cat-1' } });
    actor.send({ type: 'preview.hover', payload: { projectId: 'cat-1-proj-2' } });

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.previewedProjectId).toBe('cat-1-proj-2');
    expect(Object.keys(snapshot.context).filter((key) => key.includes('preview'))).toEqual([
      'previewedProjectId',
    ]);

    actor.stop();
  });
});
