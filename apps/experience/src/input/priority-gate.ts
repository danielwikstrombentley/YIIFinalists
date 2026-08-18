import { getActionPriority, type SemanticActionType } from '@yii/semantic-actions';

// Priority gate (contract boundary rule 3): "when an action arrives while a lower-or-equal-
// priority activity holds an exclusive window ..., only lower-priority actions may be rejected;
// higher-priority actions always pass". The current exclusive-window priority (if any) is
// supplied by the caller (wired to the machine's current transitional state in T020); this
// module is pure decision logic so it is independently testable.

export type ExclusivePriorityProvider = () => number | undefined;

/**
 * Returns the priority floor for a state-owned exclusive transition. The state machine remains
 * the navigation authority; the input boundary calls this only to discard actions that are
 * strictly lower priority than the transition currently holding renderer/camera ownership.
 */
export function exclusivePriorityForState(stateValue: unknown): number | undefined {
  const stateId = flattenStateValue(stateValue);
  if (stateId === 'transitionToProject') return getActionPriority('project.select');
  if (stateId === 'transitionToPreview') return getActionPriority('nav.back');
  return undefined;
}

export function canPassPriorityGate(
  actionType: SemanticActionType,
  exclusivePriority: number | undefined,
): boolean {
  if (exclusivePriority === undefined) {
    return true;
  }
  const actionPriority = getActionPriority(actionType);
  if (actionPriority === undefined) {
    return true; // diagnostics-only actions (connection.status) are never gated here
  }
  // Boundary rule 3 permits rejection only for a *lower*-priority action. Equal-priority actions
  // remain valid: for example, a repeated category request can update the pending destination
  // during a reverse handover without invalidating its generation token.
  return actionPriority >= exclusivePriority;
}

function flattenStateValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return undefined;

  const [entry] = Object.entries(value as Record<string, unknown>);
  if (!entry) return undefined;
  const [key, child] = entry;
  const childPath = flattenStateValue(child);
  return childPath ? `${key}.${childPath}` : key;
}
