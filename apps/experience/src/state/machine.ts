import { setup } from 'xstate';
import {
  activateGlobeCategoryPreview,
  activateGlobeIdle,
  activateGlobePreviewRetarget,
  beginContentPlaying,
  beginTransitionToPreview,
  beginTransitionToProject,
  cancelOwnedHandles,
  completeTransitionToPreview,
  enterCategoryPreview,
  enterProjectLanding,
  enterRecovering,
  registerReleaseCategories,
  requestCategorySwitch,
  resetToIdle,
  retargetPreview,
} from './actions.js';
import { createCleanupRegistry } from './cleanup-registry.js';
import { isCurrentGeneration, outranks } from './guards.js';
import { createExperienceRuntime } from './runtime.js';
import { INITIAL_CONTEXT, type ExperienceContext, type ExperienceEvent } from './types.js';

// Experience state machine skeleton (T011). States/transitions/destinations mirror data-model.md
// §3 "States & destinations" exactly. Renderer/orchestrator adapters are stubbed — entry/exit
// actions only touch `context.cleanup` (a handle registry) and machine context, never real GPU/DOM
// resources; those are wired in by the tasks that build the real adapters (PH3+) without changing
// this machine's states, events, or guard order.
//
// FR-019 priority order is enforced two ways: (1) `operator.reset` / `nav.idle` are declared once
// at the root and bubble to every leaf state (XState event bubbling) so the two highest-priority
// actions always reach `idle` regardless of what is active; (2) exclusive/transitional states
// (`transitionToProject`, `transitionToPreview`) explicitly guard lower-priority-vs-current-action
// interruptions with `outranks()` so a stray lower-priority action arriving mid-transition is a
// structural no-op even if it somehow reached the machine (defense in depth — the input boundary,
// T013, is the primary gate).

export const experienceMachine = setup({
  types: {} as {
    context: ExperienceContext;
    events: ExperienceEvent;
  },
}).createMachine({
  id: 'experience',
  initial: 'boot',
  context: () => ({
    ...INITIAL_CONTEXT,
    cleanup: createCleanupRegistry(),
    runtime: createExperienceRuntime(),
  }),
  // Root-level handlers bubble to every state that doesn't define its own (XState event
  // bubbling): the two highest FR-019 priorities always resolve to a full reset, from anywhere.
  on: {
    'internal.releaseLoaded': { actions: [registerReleaseCategories] },
    'operator.reset': { target: '.idle', actions: [resetToIdle] },
    'nav.idle': { target: '.idle', actions: [resetToIdle] },
    'internal.adapterFailure': { target: '.recovering', actions: [enterRecovering] },
  },
  states: {
    boot: {
      on: {
        'internal.assetsVerified': { target: 'idle' },
      },
    },
    idle: {
      entry: [activateGlobeIdle],
      exit: [cancelOwnedHandles],
      on: {
        'category.select': { target: 'categoryActive.preview', actions: [enterCategoryPreview] },
      },
    },
    categoryActive: {
      initial: 'preview',
      entry: [activateGlobeCategoryPreview],
      exit: [cancelOwnedHandles],
      on: {
        'nav.back': { target: 'idle' },
      },
      states: {
        preview: {
          on: {
            'preview.hover': { actions: [retargetPreview, activateGlobePreviewRetarget] },
            'project.select': {
              target: '#experience.transitionToProject',
              actions: [beginTransitionToProject],
            },
            'category.select': {
              target: 'preview',
              reenter: true,
              actions: [enterCategoryPreview, activateGlobeCategoryPreview],
            },
          },
        },
      },
    },
    transitionToProject: {
      exit: [cancelOwnedHandles],
      on: {
        'internal.handoverToProjectComplete': {
          target: 'projectLanding',
          guard: ({ context, event }) => isCurrentGeneration(context, event),
          actions: [enterProjectLanding],
        },
        'category.select': {
          target: 'categoryActive.preview',
          guard: ({ event }) => outranks(event, 'project.select'),
          actions: [enterCategoryPreview],
        },
        'nav.back': {
          target: 'categoryActive.preview',
          guard: ({ event }) => outranks(event, 'project.select'),
        },
      },
    },
    projectLanding: {
      exit: [cancelOwnedHandles],
      on: {
        'content.select': { target: 'contentPlaying', actions: [beginContentPlaying] },
        'nav.back': { target: 'transitionToPreview', actions: [beginTransitionToPreview] },
        'category.select': {
          target: 'transitionToPreview',
          actions: [requestCategorySwitch, beginTransitionToPreview],
        },
      },
    },
    contentPlaying: {
      exit: [cancelOwnedHandles],
      on: {
        'internal.sequenceComplete': {
          target: 'contentFinalHold',
          guard: ({ context, event }) => isCurrentGeneration(context, event),
        },
        'content.select': {
          target: 'contentPlaying',
          reenter: true,
          actions: [beginContentPlaying],
        },
        'nav.back': { target: 'transitionToPreview', actions: [beginTransitionToPreview] },
        'category.select': {
          target: 'transitionToPreview',
          actions: [requestCategorySwitch, beginTransitionToPreview],
        },
      },
    },
    contentFinalHold: {
      exit: [cancelOwnedHandles],
      on: {
        'content.select': { target: 'contentPlaying', actions: [beginContentPlaying] },
        'nav.back': { target: 'transitionToPreview', actions: [beginTransitionToPreview] },
        'category.select': {
          target: 'transitionToPreview',
          actions: [requestCategorySwitch, beginTransitionToPreview],
        },
      },
    },
    transitionToPreview: {
      exit: [cancelOwnedHandles],
      on: {
        'internal.handoverToPreviewComplete': {
          target: 'categoryActive.preview',
          guard: ({ context, event }) => isCurrentGeneration(context, event),
          actions: [completeTransitionToPreview],
        },
        'category.select': { actions: [requestCategorySwitch] },
      },
    },
    recovering: {
      on: {
        'internal.recovered': { target: 'idle', actions: [resetToIdle] },
      },
    },
  },
});

export type ExperienceMachine = typeof experienceMachine;
