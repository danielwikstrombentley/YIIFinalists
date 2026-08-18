import { createActor } from 'xstate';
import { describe, expect, it, vi } from 'vitest';
import { experienceMachine } from '../../src/state/machine.js';
import type { ExperienceContext, ExperienceEvent } from '../../src/state/types.js';
import {
  EXPERIENCE_STATE_IDS,
  INTERRUPTION_MATRIX,
  INTERRUPTION_MATRIX_ACTIONS,
  type ExperienceStateId,
} from './state-table.fixture.js';

// T048: full automated interruption evidence. Every major state is tested against every public
// action class twice, with state-owned cancellation probes plus stale/duplicate completion cases.

function flattenStateValue(value: unknown): string {
  if (typeof value === 'string') return value;
  const record = value as Record<string, unknown>;
  const [key] = Object.keys(record);
  const child = record[key!];
  return child ? `${key}.${flattenStateValue(child)}` : key!;
}

/** Drives a fresh actor to `stateId` via the shortest legal path from boot. */
function arriveAt(stateId: ExperienceStateId) {
  const actor = createActor(experienceMachine).start();
  const send = (event: ExperienceEvent) => actor.send(event);

  if (stateId === 'boot') return actor;

  send({ type: 'internal.assetsVerified' });
  if (stateId === 'idle') return actor;

  send({ type: 'category.select', payload: { categoryId: 'cat-1' } });
  if (stateId === 'categoryActive.preview') return actor;

  send({ type: 'preview.hover', payload: { projectId: 'proj-1' } });
  send({ type: 'project.select', payload: {} });
  if (stateId === 'transitionToProject') return actor;

  send({
    type: 'internal.handoverToProjectComplete',
    generation: actor.getSnapshot().context.generation,
  });
  if (stateId === 'projectLanding') return actor;

  if (stateId === 'transitionToPreview') {
    send({ type: 'nav.back', payload: {} });
    return actor;
  }

  send({ type: 'content.select', payload: { position: 1 } });
  if (stateId === 'contentPlaying') return actor;

  if (stateId === 'contentFinalHold') {
    send({ type: 'internal.sequenceComplete', generation: actor.getSnapshot().context.generation });
    return actor;
  }

  if (stateId === 'recovering') {
    send({ type: 'internal.adapterFailure', reason: 'test-seeded-failure' });
    return actor;
  }

  throw new Error(`arriveAt: no arrival path defined for "${stateId}"`);
}

const ACTION_EVENTS: Record<(typeof INTERRUPTION_MATRIX_ACTIONS)[number], ExperienceEvent> = {
  'operator.reset': { type: 'operator.reset', payload: {} },
  'nav.idle': { type: 'nav.idle', payload: {} },
  'category.select': { type: 'category.select', payload: { categoryId: 'cat-9' } },
  'nav.back': { type: 'nav.back', payload: {} },
  'project.select': { type: 'project.select', payload: {} },
  'content.select': { type: 'content.select', payload: { position: 1 } },
  'preview.hover': { type: 'preview.hover', payload: { direction: 'next' } },
};

interface OwnedEffectProbes {
  audio: ReturnType<typeof vi.fn>;
  overlay: ReturnType<typeof vi.fn>;
  tween: ReturnType<typeof vi.fn>;
}

function registerOwnedEffectProbes(context: ExperienceContext): OwnedEffectProbes {
  const probes = {
    audio: vi.fn(),
    overlay: vi.fn(),
    tween: vi.fn(),
  };
  context.cleanup.register('matrix-audio', probes.audio);
  context.cleanup.register('matrix-overlay', probes.overlay);
  context.cleanup.register('matrix-tween', probes.tween);
  return probes;
}

function expectOwnedEffects(probes: OwnedEffectProbes, calls: number): void {
  expect(probes.audio).toHaveBeenCalledTimes(calls);
  expect(probes.overlay).toHaveBeenCalledTimes(calls);
  expect(probes.tween).toHaveBeenCalledTimes(calls);
}

describe('Interruption matrix (data-model.md §3, every state x every public action)', () => {
  for (const stateId of EXPERIENCE_STATE_IDS) {
    for (const action of INTERRUPTION_MATRIX_ACTIONS) {
      const expectation = INTERRUPTION_MATRIX[stateId][action];
      const title = `${stateId} + ${action} -> ${expectation.destination}, twice`;

      it(title, () => {
        const actor = arriveAt(stateId);
        const before = flattenStateValue(actor.getSnapshot().value);
        const probes = registerOwnedEffectProbes(actor.getSnapshot().context);
        const shouldCancelOwnedEffects = expectation.destination !== 'self';

        actor.send(ACTION_EVENTS[action]);
        const after = flattenStateValue(actor.getSnapshot().value);

        if (expectation.destination === 'self') {
          expect(after).toBe(before);
        } else {
          expect(after).toBe(expectation.destination);
        }

        expectOwnedEffects(probes, shouldCancelOwnedEffects ? 1 : 0);
        expect(actor.getSnapshot().context.cleanup.size).toBe(shouldCancelOwnedEffects ? 0 : 3);

        // Repeating an interruption must leave the destination valid and must never invoke an
        // already-released handle again. This models hardware bounce plus repeated operator input.
        const afterStateId = after as ExperienceStateId;
        const repeatedExpectation = INTERRUPTION_MATRIX[afterStateId][action];
        actor.send(ACTION_EVENTS[action]);
        const afterRepeated = flattenStateValue(actor.getSnapshot().value);
        if (repeatedExpectation.destination === 'self') {
          expect(afterRepeated).toBe(after);
        } else {
          expect(afterRepeated).toBe(repeatedExpectation.destination);
        }
        expectOwnedEffects(probes, shouldCancelOwnedEffects ? 1 : 0);
        actor.stop();
      });
    }
  }

  it('contains every declared state/action pair with zero pending rows', () => {
    for (const stateId of EXPERIENCE_STATE_IDS) {
      for (const action of INTERRUPTION_MATRIX_ACTIONS) {
        const expectation = INTERRUPTION_MATRIX[stateId][action];
        expect(expectation, `${stateId} x ${action}`).toBeDefined();
        expect(expectation).not.toHaveProperty('pending');
      }
    }
  });

  it('rejects stale and duplicate forward-handover completions', () => {
    const actor = arriveAt('transitionToProject');
    const generation = actor.getSnapshot().context.generation;

    actor.send({ type: 'internal.handoverToProjectComplete', generation: generation - 1 });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('transitionToProject');

    actor.send({ type: 'internal.handoverToProjectComplete', generation });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('projectLanding');

    actor.send({ type: 'internal.handoverToProjectComplete', generation });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('projectLanding');
    actor.stop();
  });

  it('rejects stale and duplicate sequence completions', () => {
    const actor = arriveAt('contentPlaying');
    const generation = actor.getSnapshot().context.generation;

    actor.send({ type: 'internal.sequenceComplete', generation: generation - 1 });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('contentPlaying');

    actor.send({ type: 'internal.sequenceComplete', generation });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('contentFinalHold');

    actor.send({ type: 'internal.sequenceComplete', generation });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('contentFinalHold');
    actor.stop();
  });

  it('rejects stale and duplicate reverse-handover completions', () => {
    const actor = arriveAt('transitionToPreview');
    const generation = actor.getSnapshot().context.generation;

    actor.send({ type: 'internal.handoverToPreviewComplete', generation: generation - 1 });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('transitionToPreview');

    actor.send({ type: 'internal.handoverToPreviewComplete', generation });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('categoryActive.preview');

    actor.send({ type: 'internal.handoverToPreviewComplete', generation });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('categoryActive.preview');
    actor.stop();
  });

  it('discards a completion delivered after a higher-priority reset', () => {
    const actor = arriveAt('transitionToProject');
    const generation = actor.getSnapshot().context.generation;

    actor.send({ type: 'operator.reset', payload: {} });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('idle');

    actor.send({ type: 'internal.handoverToProjectComplete', generation });
    expect(flattenStateValue(actor.getSnapshot().value)).toBe('idle');
    actor.stop();
  });
});
