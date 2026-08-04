import { getActionPriority, type SemanticActionType } from '@yii/semantic-actions';
import { isStaleGeneration } from './generation.js';
import type { ExperienceContext, ExperienceEvent } from './types.js';

/**
 * FR-019 priority gate: true when `event` outranks the action that opened the current exclusive
 * window (`thresholdType`). Used as a backstop inside the machine itself — the input boundary
 * (T013) is the primary gate, but the machine is "the sole navigation authority" and must not
 * act on a lower-priority action even if one somehow reaches it mid-transition.
 */
export function outranks(event: ExperienceEvent, thresholdType: SemanticActionType): boolean {
  const eventPriority = getActionPriority(event.type as SemanticActionType);
  const thresholdPriority = getActionPriority(thresholdType);
  if (eventPriority === undefined || thresholdPriority === undefined) {
    return false;
  }
  return eventPriority > thresholdPriority;
}

export function isCurrentGeneration(
  context: Pick<ExperienceContext, 'generation'>,
  event: { generation: number },
): boolean {
  return !isStaleGeneration(context.generation, event.generation);
}
