import type { SemanticActionType } from './actions.js';
import { DIAGNOSTICS_ONLY_ACTION_TYPES } from './actions.js';

// FR-019 priority order, exact values from contracts/semantic-input.md "Action set" table.
// Higher number pre-empts lower during any transition or sequence. `connection.status` is
// excluded (diagnostics only, never machine-bound — see actions.ts).
export const ACTION_PRIORITIES: Readonly<
  Record<Exclude<SemanticActionType, 'connection.status'>, number>
> = {
  'preview.hover': 1,
  'content.select': 2,
  'project.select': 3,
  'nav.back': 4,
  'category.select': 5,
  'nav.idle': 6,
  'operator.reset': 7,
  'operator.command': 7,
};

/** Returns the FR-019 priority for `type`, or `undefined` for diagnostics-only actions. */
export function getActionPriority(type: SemanticActionType): number | undefined {
  if (DIAGNOSTICS_ONLY_ACTION_TYPES.has(type)) {
    return undefined;
  }
  return ACTION_PRIORITIES[type as Exclude<SemanticActionType, 'connection.status'>];
}

/** `candidate.priority - current.priority`; positive means candidate outranks current. */
export function comparePriority(
  candidate: SemanticActionType,
  current: SemanticActionType,
): number {
  const candidatePriority = getActionPriority(candidate) ?? Number.NEGATIVE_INFINITY;
  const currentPriority = getActionPriority(current) ?? Number.NEGATIVE_INFINITY;
  return candidatePriority - currentPriority;
}

/**
 * Priority-gate rule (contract boundary rule 3): during an exclusive window held by `current`,
 * only a `candidate` of strictly higher priority may pre-empt it — equal-or-lower priority is
 * rejected while the window holds.
 */
export function canPreempt(candidate: SemanticActionType, current: SemanticActionType): boolean {
  return comparePriority(candidate, current) > 0;
}
