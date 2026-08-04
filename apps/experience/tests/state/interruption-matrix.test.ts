import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';
import { experienceMachine } from '../../src/state/machine.js';
import type { ExperienceEvent } from '../../src/state/types.js';
import {
  EXPERIENCE_STATE_IDS,
  INTERRUPTION_MATRIX,
  INTERRUPTION_MATRIX_ACTIONS,
  type ExperienceStateId,
} from './state-table.fixture.js';

// Interruption-matrix scaffold (T010): every state x {operator.reset, nav.idle, category.select,
// nav.back}, expected destinations parameterised from data-model.md §3. Pending rows (not yet
// meaningfully assertable) are skipped, not asserted false — activated as later phases land.

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
};

describe('Interruption matrix (data-model.md §3, every state x 4 nav actions)', () => {
  for (const stateId of EXPERIENCE_STATE_IDS) {
    for (const action of INTERRUPTION_MATRIX_ACTIONS) {
      const expectation = INTERRUPTION_MATRIX[stateId][action];
      const title = `${stateId} + ${action} -> ${expectation.destination}${expectation.pending ? ' (pending)' : ''}`;

      it.skipIf(expectation.pending)(title, () => {
        const actor = arriveAt(stateId);
        const before = flattenStateValue(actor.getSnapshot().value);
        actor.send(ACTION_EVENTS[action]);
        const after = flattenStateValue(actor.getSnapshot().value);

        if (expectation.destination === 'self') {
          expect(after).toBe(before);
        } else {
          expect(after).toBe(expectation.destination);
        }
        actor.stop();
      });
    }
  }

  it('every matrix row (pending or not) exists for every declared state', () => {
    for (const stateId of EXPERIENCE_STATE_IDS) {
      for (const action of INTERRUPTION_MATRIX_ACTIONS) {
        expect(INTERRUPTION_MATRIX[stateId][action], `${stateId} x ${action}`).toBeDefined();
      }
    }
  });
});
