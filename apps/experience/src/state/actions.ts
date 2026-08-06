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
  context.runtime.cesium?.reset();
  const globe = context.runtime.globe?.adapter;
  if (!globe) return;
  globe.start();
  const handle = globe.enterIdle();
  context.cleanup.register('globe-idle', () => handle.cancel());
}

/** State-entry adapter wiring for category preview: filter to three markers and auto-preview first. */
export function activateGlobeCategoryPreview({ context }: { context: ExperienceContext }): void {
  context.runtime.cesium?.reset();
  const globe = context.runtime.globe?.adapter;
  const categoryId = context.activeCategoryId;
  const projectId = context.previewedProjectId;
  if (!globe || !categoryId || !projectId) return;

  globe.start();
  const categoryHandle = globe.setCategoryFilter(categoryId);
  context.cleanup.register('globe-category', () => categoryHandle.cancel());
  const previewHandle = globe.previewCategoryProject(projectId);
  context.cleanup.register('globe-preview', () => previewHandle.cancel());
  prewarmCesiumPreview(context);
}

/** Retargets the live globe camera after a valid hover action without queuing obsolete destinations. */
export function activateGlobePreviewRetarget({ context }: { context: ExperienceContext }): void {
  const globe = context.runtime.globe?.adapter;
  const projectId = context.previewedProjectId;
  if (!globe || !projectId) return;
  const handle = globe.previewProject(projectId);
  context.cleanup.register('globe-preview', () => handle.cancel());
  prewarmCesiumPreview(context);
}

function prewarmCesiumPreview(context: ExperienceContext): void {
  const projectId = context.previewedProjectId;
  const project = projectId ? context.runtime.globe?.getProject(projectId) : undefined;
  if (project) context.runtime.cesium?.prewarmPreview(project);
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

interface HandoverActionSelf {
  send(event: ExperienceEvent): void;
  getSnapshot(): { context: ExperienceContext };
}

function isCurrentHandoverGeneration(self: HandoverActionSelf, generation: number): boolean {
  return self.getSnapshot().context.generation === generation;
}

function reportHandoverFailure(self: HandoverActionSelf, generation: number, reason: string): void {
  if (!isCurrentHandoverGeneration(self, generation)) return;
  self.send({ type: 'internal.handoverToProjectFailed', generation, reason });
}

function launchForwardHandover(
  context: ExperienceContext,
  self: HandoverActionSelf,
  generation: number,
): void {
  const projectId = context.selectedProjectId;
  const project = projectId ? context.runtime.globe?.getProject(projectId) : undefined;
  const handover = context.runtime.cesium?.handover;
  if (!project || !handover) {
    reportHandoverFailure(
      self,
      generation,
      'The selected project or Cesium handover runtime is unavailable.',
    );
    return;
  }

  const operation = handover.startForward(project);
  context.cleanup.register('handover-forward', () => operation.cancel());
  void operation.completion.then((result) => {
    if (result.status === 'completed' || result.status === 'fallback') {
      if (isCurrentHandoverGeneration(self, generation)) {
        self.send({ type: 'internal.handoverToProjectComplete', generation });
      }
      return;
    }
    // Expected navigation interruption resolves as `cancelled` without a reason. A controller
    // failure includes its reason and returns safely to the already-active category preview.
    if (result.reason) reportHandoverFailure(self, generation, result.reason);
  });
}

function launchConfiguredForwardHandover(
  context: ExperienceContext,
  self: HandoverActionSelf,
  generation: number,
  presentation: NonNullable<ExperienceContext['runtime']['cesium']>,
): void {
  const launchIfCurrent = (): void => {
    if (!isCurrentHandoverGeneration(self, generation)) return;
    if (context.runtime.cesium !== presentation) return;
    launchForwardHandover(context, self, generation);
  };

  // Configuration retrieval is intentionally fail-soft: `configureFromKiosk()` catches endpoint
  // failures so the normal path resolves, while this rejection handler still preserves the
  // adapter's documented fallback behaviour if a future config source rejects.
  void presentation.configurationReady.then(launchIfCurrent, launchIfCurrent);
}

/** Starts the state-owned forward handover and reports only generation-checked terminal events. */
export function startForwardHandover({
  context,
  self,
}: {
  context: ExperienceContext;
  self: HandoverActionSelf;
}): void {
  const generation = context.generation;
  // Adapter-free state tests deliberately drive completion events themselves. In the mounted
  // browser shell a dynamically loaded renderer advertises `cesiumReady`; wait for it rather
  // than letting a large Cesium module delay first paint or dropping a valid confirmation.
  if (!context.runtime.cesium) {
    const ready = context.runtime.cesiumReady;
    if (!ready) return;
    void ready.then((presentation) => {
      if (!isCurrentHandoverGeneration(self, generation)) return;
      if (!presentation) {
        reportHandoverFailure(self, generation, 'Cesium presentation startup failed.');
        return;
      }
      launchConfiguredForwardHandover(context, self, generation, presentation);
    });
    return;
  }
  launchConfiguredForwardHandover(context, self, generation, context.runtime.cesium);
}

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

/** Landing owns option-media warming; exiting the state cancels it through CleanupRegistry. */
export function preloadLandingOptionAssets({ context }: { context: ExperienceContext }): void {
  const projectId = context.selectedProjectId;
  const project = projectId ? context.runtime.globe?.getProject(projectId) : undefined;
  if (!project) return;
  const handle = context.runtime.cesium?.preloadLandingOptions(project);
  if (handle) context.cleanup.register('landing-option-preloads', () => handle.cancel());
}

/** Fatal forward-handover failure returns to the pre-existing preview without stale selection. */
export const returnToPreviewAfterHandoverFailure = assign<
  ExperienceContext,
  ExperienceEvent,
  undefined,
  ExperienceEvent,
  never
>(({ context, event }) => ({
  selectedProjectId: null,
  activeContentPosition: null,
  activeSequenceId: null,
  activeVoiceoverId: null,
  lastError: {
    atState: 'transitionToProject',
    reason: event.type === 'internal.handoverToProjectFailed' ? event.reason : 'Unknown failure',
  },
  generation: nextGeneration(context.generation),
}));

/** Leaving an interrupted forward transition by back must also clear its selected-project ref. */
export const returnToPreview = assign<
  ExperienceContext,
  ExperienceEvent,
  undefined,
  ExperienceEvent,
  never
>(({ context }) => ({
  selectedProjectId: null,
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
