// Mirrors data-model.md §3 "States & destinations" table exactly. Used by both the legality test
// (@xstate/graph exhaustive traversal) and the interruption-matrix test. Rows/cells marked
// `pending: true` are not yet meaningfully assertable (documented behaviour depends on adapters
// built in later phases) and are skipped rather than asserted false — activated as those phases
// land, per T010's Do note.

export const EXPERIENCE_STATE_IDS = [
  'boot',
  'idle',
  'categoryActive.preview',
  'transitionToProject',
  'projectLanding',
  'contentPlaying',
  'contentFinalHold',
  'transitionToPreview',
  'recovering',
] as const;

export type ExperienceStateId = (typeof EXPERIENCE_STATE_IDS)[number];

/** The four nav actions the interruption matrix scaffold covers (T010 Do). */
export const INTERRUPTION_MATRIX_ACTIONS = ['operator.reset', 'nav.idle', 'category.select', 'nav.back'] as const;
export type InterruptionMatrixAction = (typeof INTERRUPTION_MATRIX_ACTIONS)[number];

export interface InterruptionExpectation {
  /** Destination state id, or `'self'` when the action is a no-op/ignored in this state. */
  destination: ExperienceStateId | 'self';
  /** Not yet meaningfully assertable — behaviour depends on adapters landing in a later phase. */
  pending?: boolean;
  note?: string;
}

/**
 * `interruptionMatrix[state][action]` — expected destination per data-model.md §3's
 * "Interruption destination" column. `category.select` while already in `categoryActive.preview`
 * or mid-transition is a full re-entry (exit+entry rerun) rather than a literal detour through
 * `idle` — data-model.md's "re-entry via routed idle (category)" wording describes the cleanup
 * guarantee (same as going through idle), not a visible idle frame.
 */
export const INTERRUPTION_MATRIX: Record<ExperienceStateId, Record<InterruptionMatrixAction, InterruptionExpectation>> = {
  boot: {
    // operator.reset/nav.idle are the two highest-priority actions (FR-019: 7 and 6) — they
    // always win, even during boot, with no special-cased exceptions (simpler and more
    // defensible than making boot a dead zone for the two actions that must never get "stuck").
    'operator.reset': { destination: 'idle' },
    'nav.idle': { destination: 'idle' },
    'category.select': { destination: 'self', pending: true, note: 'boot has no active category yet' },
    'nav.back': { destination: 'self', pending: true },
  },
  idle: {
    'operator.reset': { destination: 'idle' },
    'nav.idle': { destination: 'idle' },
    'category.select': { destination: 'categoryActive.preview' },
    'nav.back': { destination: 'idle', note: 'idle is the sink; nowhere to go back to' },
  },
  'categoryActive.preview': {
    'operator.reset': { destination: 'idle' },
    'nav.idle': { destination: 'idle' },
    'category.select': { destination: 'categoryActive.preview', note: 'full re-entry (exit+entry) with the new category' },
    'nav.back': { destination: 'idle' },
  },
  transitionToProject: {
    'operator.reset': { destination: 'idle' },
    'nav.idle': { destination: 'idle' },
    'category.select': { destination: 'categoryActive.preview', note: 'priority 5 > project.select 3 — may interrupt' },
    'nav.back': { destination: 'categoryActive.preview', note: 'priority 4 > project.select 3 — may interrupt' },
  },
  projectLanding: {
    'operator.reset': { destination: 'idle' },
    'nav.idle': { destination: 'idle' },
    'category.select': { destination: 'transitionToPreview', note: 'reverse handover, lands in the newly selected category' },
    'nav.back': { destination: 'transitionToPreview' },
  },
  contentPlaying: {
    'operator.reset': { destination: 'idle' },
    'nav.idle': { destination: 'idle' },
    'category.select': { destination: 'transitionToPreview', note: 'reverse handover, lands in the newly selected category' },
    'nav.back': { destination: 'transitionToPreview' },
  },
  contentFinalHold: {
    // data-model.md: "same as contentPlaying"
    'operator.reset': { destination: 'idle' },
    'nav.idle': { destination: 'idle' },
    'category.select': { destination: 'transitionToPreview' },
    'nav.back': { destination: 'transitionToPreview' },
  },
  transitionToPreview: {
    'operator.reset': { destination: 'idle' },
    'nav.idle': { destination: 'idle' },
    'category.select': {
      destination: 'self',
      note: 'updates the pending category (context.pendingCategoryId); applied when the reverse handover completes. Immediate snap to categoryActive.preview is the FAILURE destination only (data-model.md: "categoryActive.preview (snap)"), not this interruption path.',
    },
    'nav.back': { destination: 'self', note: 'already reversing; ignored' },
  },
  recovering: {
    'operator.reset': { destination: 'idle' },
    'nav.idle': { destination: 'idle' },
    'category.select': { destination: 'self', pending: true, note: 'recovering exits via its own internal recovery-complete event' },
    'nav.back': { destination: 'self', pending: true },
  },
};
