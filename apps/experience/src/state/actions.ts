import { assign } from 'xstate';
import { nextGeneration } from './generation.js';
import type { ExperienceContext, ExperienceEvent } from './types.js';

// Entry/exit actions. Renderer/orchestrator adapters are stubbed in PH2 (T011 scope) — actions
// only ever touch `context` and the `cleanup` handle registry; real adapter wiring lands with the
// renderer/orchestrator tasks in PH3+ without changing this module's shape.

/** Exit action attached to every state that can own adapter handles (architecture rule). */
export function cancelOwnedHandles({ context }: { context: ExperienceContext }): void {
  context.cleanup.cancelAll();
}

export const resetToIdle = assign<
  ExperienceContext,
  ExperienceEvent,
  undefined,
  ExperienceEvent,
  never
>(({ context }) => ({
  activeCategoryId: null,
  pendingCategoryId: null,
  previewedProjectId: null,
  selectedProjectId: null,
  activeContentPosition: null,
  activeSequenceId: null,
  activeVoiceoverId: null,
  lastError: null,
  generation: nextGeneration(context.generation),
}));

export const enterCategoryPreview = assign<
  ExperienceContext,
  ExperienceEvent,
  undefined,
  ExperienceEvent,
  never
>(({ context, event }) => {
  const categoryId =
    event.type === 'category.select'
      ? event.payload.categoryId
      : (context.pendingCategoryId ?? context.activeCategoryId);
  return {
    activeCategoryId: categoryId ?? null,
    pendingCategoryId: null,
    previewedProjectId: null,
    generation: nextGeneration(context.generation),
  };
});

export const retargetPreview = assign<
  ExperienceContext,
  ExperienceEvent,
  undefined,
  ExperienceEvent,
  never
>(({ event }) => {
  if (event.type !== 'preview.hover') return {};
  // The `direction` form (next/prev) is resolved against the active category's ordered project
  // list upstream (app shell / content loader) before reaching the machine — the machine only
  // ever sees a concrete `projectId` here. `direction` payloads are accepted as a documented
  // no-op at this layer so the contract's full action set is still legally receivable.
  if ('projectId' in event.payload) {
    return { previewedProjectId: event.payload.projectId };
  }
  return {};
});

export const beginTransitionToProject = assign<
  ExperienceContext,
  ExperienceEvent,
  undefined,
  ExperienceEvent,
  never
>(({ context }) => ({
  selectedProjectId: context.previewedProjectId,
  generation: nextGeneration(context.generation),
}));

export const enterProjectLanding = assign<
  ExperienceContext,
  ExperienceEvent,
  undefined,
  ExperienceEvent,
  never
>(({ context }) => ({
  activeContentPosition: null,
  activeSequenceId: null,
  activeVoiceoverId: null,
  generation: nextGeneration(context.generation),
}));

export const beginContentPlaying = assign<
  ExperienceContext,
  ExperienceEvent,
  undefined,
  ExperienceEvent,
  never
>(({ context, event }) => {
  if (event.type !== 'content.select') return {};
  const sequenceId = `${context.selectedProjectId ?? 'unknown'}:${event.payload.position}`;
  return {
    activeContentPosition: event.payload.position,
    activeSequenceId: sequenceId,
    activeVoiceoverId: sequenceId,
    generation: nextGeneration(context.generation),
  };
});

/** Requests a category switch from a landed/playing state — applied once the reverse handover completes. */
export const requestCategorySwitch = assign<
  ExperienceContext,
  ExperienceEvent,
  undefined,
  ExperienceEvent,
  never
>(({ context, event }) => ({
  pendingCategoryId:
    event.type === 'category.select' ? event.payload.categoryId : context.pendingCategoryId,
  generation: nextGeneration(context.generation),
}));

export const beginTransitionToPreview = assign<
  ExperienceContext,
  ExperienceEvent,
  undefined,
  ExperienceEvent,
  never
>(({ context }) => ({
  generation: nextGeneration(context.generation),
}));

export const completeTransitionToPreview = assign<
  ExperienceContext,
  ExperienceEvent,
  undefined,
  ExperienceEvent,
  never
>(({ context }) => {
  const switchingCategory = context.pendingCategoryId !== null;
  return {
    activeCategoryId: switchingCategory ? context.pendingCategoryId : context.activeCategoryId,
    pendingCategoryId: null,
    previewedProjectId: switchingCategory ? null : context.previewedProjectId,
    selectedProjectId: null,
    activeContentPosition: null,
    activeSequenceId: null,
    activeVoiceoverId: null,
  };
});

export const enterRecovering = assign<
  ExperienceContext,
  ExperienceEvent,
  undefined,
  ExperienceEvent,
  never
>(({ context, event }) => ({
  lastError: {
    atState: 'unknown',
    reason: event.type === 'internal.adapterFailure' ? event.reason : 'unknown',
  },
  generation: nextGeneration(context.generation),
}));
