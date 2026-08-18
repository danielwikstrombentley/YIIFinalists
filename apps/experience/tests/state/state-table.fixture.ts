// Mirrors data-model.md §3 "States & destinations" table exactly. Used by both the legality test
// (@xstate/graph exhaustive traversal) and the interruption-matrix test. T048 activates every
// public action class for every state, so no matrix row remains pending.

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

/** Every machine-bound public action class covered by T048. */
export const INTERRUPTION_MATRIX_ACTIONS = [
  'operator.reset',
  'nav.idle',
  'category.select',
  'nav.back',
  'project.select',
  'content.select',
  'preview.hover',
] as const;
export type InterruptionMatrixAction = (typeof INTERRUPTION_MATRIX_ACTIONS)[number];

export interface InterruptionExpectation {
  /** Destination state id, or `'self'` when the action is a no-op/ignored in this state. */
  destination: ExperienceStateId | 'self';
  note?: string;
}

/**
 * `interruptionMatrix[state][action]` — expected destination per data-model.md §3's
 * "Interruption destination" column plus each action's state legality. `category.select` while
 * already in `categoryActive.preview` is a full re-entry; the matching state value is retained
 * but owned presentation handles are cancelled and restarted.
 */
export const INTERRUPTION_MATRIX: Record<
  ExperienceStateId,
  Record<InterruptionMatrixAction, InterruptionExpectation>
> = {
  boot: {
    'operator.reset': { destination: 'idle' },
    'nav.idle': { destination: 'idle' },
    'category.select': { destination: 'self', note: 'release validation has not completed' },
    'nav.back': { destination: 'self' },
    'project.select': { destination: 'self' },
    'content.select': { destination: 'self' },
    'preview.hover': { destination: 'self' },
  },
  idle: {
    'operator.reset': { destination: 'idle' },
    'nav.idle': { destination: 'idle' },
    'category.select': { destination: 'categoryActive.preview' },
    'nav.back': { destination: 'self', note: 'idle is the sink; nowhere to go back to' },
    'project.select': { destination: 'self' },
    'content.select': { destination: 'self' },
    'preview.hover': { destination: 'self' },
  },
  'categoryActive.preview': {
    'operator.reset': { destination: 'idle' },
    'nav.idle': { destination: 'idle' },
    'category.select': {
      destination: 'categoryActive.preview',
      note: 'full re-entry with the new category',
    },
    'nav.back': { destination: 'idle' },
    'project.select': { destination: 'transitionToProject' },
    'content.select': { destination: 'self' },
    'preview.hover': { destination: 'self' },
  },
  transitionToProject: {
    'operator.reset': { destination: 'idle' },
    'nav.idle': { destination: 'idle' },
    'category.select': {
      destination: 'categoryActive.preview',
      note: 'priority 5 > project.select 3 — may interrupt',
    },
    'nav.back': {
      destination: 'categoryActive.preview',
      note: 'priority 4 > project.select 3 — may interrupt',
    },
    'project.select': { destination: 'self', note: 'equal-priority duplicate confirmation' },
    'content.select': { destination: 'self' },
    'preview.hover': { destination: 'self' },
  },
  projectLanding: {
    'operator.reset': { destination: 'idle' },
    'nav.idle': {
      destination: 'transitionToPreview',
      note: 'reverse handover animates back through the saved globe preview before idle',
    },
    'category.select': {
      destination: 'transitionToPreview',
      note: 'reverse handover, lands in the newly selected category',
    },
    'nav.back': { destination: 'transitionToPreview' },
    'project.select': { destination: 'self' },
    'content.select': { destination: 'contentPlaying' },
    'preview.hover': { destination: 'self' },
  },
  contentPlaying: {
    'operator.reset': { destination: 'idle' },
    'nav.idle': {
      destination: 'transitionToPreview',
      note: 'reverse handover animates back through the saved globe preview before idle',
    },
    'category.select': {
      destination: 'transitionToPreview',
      note: 'reverse handover, lands in the newly selected category',
    },
    'nav.back': { destination: 'transitionToPreview' },
    'project.select': { destination: 'self' },
    'content.select': { destination: 'contentPlaying', note: 'clean switch or replay' },
    'preview.hover': { destination: 'self' },
  },
  contentFinalHold: {
    // data-model.md: "same as contentPlaying"
    'operator.reset': { destination: 'idle' },
    'nav.idle': {
      destination: 'transitionToPreview',
      note: 'reverse handover animates back through the saved globe preview before idle',
    },
    'category.select': { destination: 'transitionToPreview' },
    'nav.back': { destination: 'transitionToPreview' },
    'project.select': { destination: 'self' },
    'content.select': { destination: 'contentPlaying' },
    'preview.hover': { destination: 'self' },
  },
  transitionToPreview: {
    'operator.reset': { destination: 'idle' },
    'nav.idle': {
      destination: 'self',
      note: 'an already-active reverse handover continues and resolves to idle on completion',
    },
    'category.select': {
      destination: 'self',
      note: 'updates the pending category (context.pendingCategoryId); applied when the reverse handover completes. Immediate snap to categoryActive.preview is the FAILURE destination only (data-model.md: "categoryActive.preview (snap)"), not this interruption path.',
    },
    'nav.back': { destination: 'self', note: 'already reversing; ignored' },
    'project.select': { destination: 'self' },
    'content.select': { destination: 'self' },
    'preview.hover': { destination: 'self' },
  },
  recovering: {
    'operator.reset': { destination: 'idle' },
    'nav.idle': { destination: 'idle' },
    'category.select': { destination: 'self', note: 'recovery owns its exit' },
    'nav.back': { destination: 'self' },
    'project.select': { destination: 'self' },
    'content.select': { destination: 'self' },
    'preview.hover': { destination: 'self' },
  },
};
