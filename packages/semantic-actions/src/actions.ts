// Semantic action type union + payload types per contracts/semantic-input.md "Action set".
// Transport-specific messages terminate at the adapter boundary (Principle III); everything in
// this package is transport-independent.

/** Where a validated action originated. Only `simulator`/`operator` may emit operator actions. */
export const ACTION_SOURCES = ['console', 'simulator', 'operator'] as const;
export type ActionSource = (typeof ACTION_SOURCES)[number];

export interface CategorySelectPayload {
  categoryId: string;
}

export type PreviewHoverPayload = { direction: 'next' | 'prev' } | { projectId: string };

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- confirms current preview; no fields by contract
export interface ProjectSelectPayload {}

export interface ContentSelectPayload {
  position: 1 | 2 | 3 | 4 | 5;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- contract payload is `{}`
export interface NavBackPayload {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- contract payload is `{}`
export interface NavIdlePayload {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- contract payload is `{}`
export interface OperatorResetPayload {}

export interface OperatorCommandPayload {
  command: string;
  params?: unknown;
}

export interface ConnectionStatusPayload {
  connected: boolean;
  transportId: string;
}

export const SEMANTIC_ACTION_TYPES = [
  'category.select',
  'preview.hover',
  'project.select',
  'content.select',
  'nav.back',
  'nav.idle',
  'operator.reset',
  'operator.command',
  'connection.status',
] as const;

export type SemanticActionType = (typeof SEMANTIC_ACTION_TYPES)[number];

/** Payload type for a given action type — used to keep {type, payload} pairs in sync. */
export interface SemanticActionPayloadMap {
  'category.select': CategorySelectPayload;
  'preview.hover': PreviewHoverPayload;
  'project.select': ProjectSelectPayload;
  'content.select': ContentSelectPayload;
  'nav.back': NavBackPayload;
  'nav.idle': NavIdlePayload;
  'operator.reset': OperatorResetPayload;
  'operator.command': OperatorCommandPayload;
  'connection.status': ConnectionStatusPayload;
}

/** A validated, transport-independent semantic action ready for dedup/priority/machine handling. */
export type SemanticAction = {
  [T in SemanticActionType]: { type: T; payload: SemanticActionPayloadMap[T] };
}[SemanticActionType];

/** `operator.*` actions — contract: "no — operator only" (rejected from the `console` source). */
export const OPERATOR_ONLY_ACTION_TYPES: ReadonlySet<SemanticActionType> = new Set([
  'operator.reset',
  'operator.command',
]);

/** `connection.status` never reaches the state machine; it feeds the DiagnosticsStore only. */
export const DIAGNOSTICS_ONLY_ACTION_TYPES: ReadonlySet<SemanticActionType> = new Set([
  'connection.status',
]);

export function isOperatorOnlyAction(type: SemanticActionType): boolean {
  return OPERATOR_ONLY_ACTION_TYPES.has(type);
}

export function isDiagnosticsOnlyAction(type: SemanticActionType): boolean {
  return DIAGNOSTICS_ONLY_ACTION_TYPES.has(type);
}

/** True for every action type the state machine may legally receive (all except diagnostics-only). */
export function isMachineBoundAction(type: SemanticActionType): boolean {
  return !isDiagnosticsOnlyAction(type);
}

/** True when `source` is allowed to emit `type` (boundary rule 5: operator gating). */
export function isSourceAllowedToEmit(type: SemanticActionType, source: ActionSource): boolean {
  if (isOperatorOnlyAction(type)) {
    return source === 'simulator' || source === 'operator';
  }
  return true;
}
