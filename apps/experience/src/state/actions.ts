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

/** Records validated category ordering at the machine boundary (the source for FR-005 first preview). */
export const registerReleaseCategories = assign<
  ExperienceContext,
  ExperienceEvent,
  undefined,
  ExperienceEvent,
  never
>(({ event }) => {
  if (event.type !== 'internal.releaseLoaded') return {};
  return {
    categoryProjectIds: Object.fromEntries(
      event.categories.map((category) => [category.id, [...category.projectIds]]),
    ),
  };
});

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
  const firstProjectId = categoryId ? (context.categoryProjectIds[categoryId]?.[0] ?? null) : null;
  return {
    activeCategoryId: categoryId ?? null,
    pendingCategoryId: null,
    previewedProjectId: firstProjectId,
    selectedProjectId: null,
    activeContentPosition: null,
    activeSequenceId: null,
    activeVoiceoverId: null,
    generation: nextGeneration(context.generation),
  };
});

export const retargetPreview = assign<
  ExperienceContext,
  ExperienceEvent,
  undefined,
  ExperienceEvent,
  never
>(({ context, event }) => {
  if (event.type !== 'preview.hover') return {};
  if ('projectId' in event.payload) {
    const categoryProjects = context.activeCategoryId
      ? (context.categoryProjectIds[context.activeCategoryId] ?? [])
      : [];
    return categoryProjects.includes(event.payload.projectId)
      ? { previewedProjectId: event.payload.projectId }
      : {};
  }
  const categoryProjects = context.activeCategoryId
    ? (context.categoryProjectIds[context.activeCategoryId] ?? [])
    : [];
  if (categoryProjects.length === 0) return {};

  const currentIndex = Math.max(0, categoryProjects.indexOf(context.previewedProjectId ?? ''));
  const offset = event.payload.direction === 'next' ? 1 : -1;
  const nextIndex = (currentIndex + offset + categoryProjects.length) % categoryProjects.length;
  return { previewedProjectId: categoryProjects[nextIndex] ?? context.previewedProjectId };
});

/** State-entry adapter wiring for idle: all markers visible and the seamless globe loop active. */
export function activateGlobeIdle({ context }: { context: ExperienceContext }): void {
  const globe = context.runtime.globe?.adapter;
  if (!globe) return;
  const handle = globe.enterIdle();
  context.cleanup.register('globe-idle', () => handle.cancel());
}

/** State-entry adapter wiring for category preview: filter to three markers and auto-preview first. */
export function activateGlobeCategoryPreview({ context }: { context: ExperienceContext }): void {
  const globe = context.runtime.globe?.adapter;
  const categoryId = context.activeCategoryId;
  const projectId = context.previewedProjectId;
  if (!globe || !categoryId || !projectId) return;

  const categoryHandle = globe.setCategoryFilter(categoryId);
  context.cleanup.register('globe-category', () => categoryHandle.cancel());
  const previewHandle = globe.previewCategoryProject(projectId);
  context.cleanup.register('globe-preview', () => previewHandle.cancel());
}

/** Retargets the live globe camera after a valid hover action without queuing obsolete destinations. */
export function activateGlobePreviewRetarget({ context }: { context: ExperienceContext }): void {
  const globe = context.runtime.globe?.adapter;
  const projectId = context.previewedProjectId;
  if (!globe || !projectId) return;
  const handle = globe.previewProject(projectId);
  context.cleanup.register('globe-preview', () => handle.cancel());
}

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

/**
 * Requests a category switch from a landed/playing state, or updates the pending target while a
 * reverse handover is already in flight — applied once that handover completes
 * (`completeTransitionToPreview`). Deliberately does NOT bump `generation`: this action never
 * starts a new async operation itself (the transitions that pair it with
 * `beginTransitionToPreview` get their generation bump from that action instead), so an in-flight
 * handover's completion token must stay valid across repeated `category.select` presses (PH2
 * review round 1 finding #3 — bumping generation here stranded the machine in
 * `transitionToPreview` forever once a second category.select arrived mid-handover).
 */
export const requestCategorySwitch = assign<
  ExperienceContext,
  ExperienceEvent,
  undefined,
  ExperienceEvent,
  never
>(({ context, event }) => ({
  pendingCategoryId:
    event.type === 'category.select' ? event.payload.categoryId : context.pendingCategoryId,
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
  const categoryId = switchingCategory ? context.pendingCategoryId : context.activeCategoryId;
  return {
    activeCategoryId: categoryId,
    pendingCategoryId: null,
    previewedProjectId: switchingCategory
      ? (context.categoryProjectIds[categoryId ?? '']?.[0] ?? null)
      : context.previewedProjectId,
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
