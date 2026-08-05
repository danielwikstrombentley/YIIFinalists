import { getActionPriority, type SemanticActionType } from '@yii/semantic-actions';

// Priority gate (contract boundary rule 3): "when an action arrives while a lower-or-equal-
// priority activity holds an exclusive window ..., only lower-priority actions may be rejected;
// higher-priority actions always pass". The current exclusive-window priority (if any) is
// supplied by the caller (wired to the machine's current transitional state in T020); this
// module is pure decision logic so it is independently testable.

export type ExclusivePriorityProvider = () => number | undefined;

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
  return actionPriority > exclusivePriority;
}
