import type { SemanticAction } from '@yii/semantic-actions';
import type { CleanupRegistry } from './cleanup-registry.js';
import type { ExperienceRuntime } from './runtime.js';

// `connection.status` is diagnostics-only and must never reach the machine (contracts/
// semantic-input.md boundary rule 6) — excluded from the event union at the type level too.
export type MachineBoundSemanticAction = Exclude<SemanticAction, { type: 'connection.status' }>;

export type ContentOptionPosition = 1 | 2 | 3 | 4 | 5;

/** Internal, adapter-originated events (handover/sequence completion, failures, recovery). */
export type InternalEvent =
  | { type: 'internal.assetsVerified' }
  | {
      type: 'internal.releaseLoaded';
      categories: readonly { id: string; projectIds: readonly string[] }[];
    }
  | { type: 'internal.handoverToProjectComplete'; generation: number }
  | { type: 'internal.handoverToProjectFailed'; generation: number; reason: string }
  | { type: 'internal.handoverToPreviewComplete'; generation: number }
  | { type: 'internal.sequenceComplete'; generation: number }
  | { type: 'internal.adapterFailure'; reason: string }
  | { type: 'internal.recovered' };

export type ExperienceEvent = MachineBoundSemanticAction | InternalEvent;

/**
 * Machine context — Principle I: one active category/preview/selection/content/sequence/
 * voiceover at all times, enforced by shape (single nullable refs, never collections).
 */
export interface ExperienceContext {
  /** Validated category ordering, used to make the first category project the active preview. */
  categoryProjectIds: Readonly<Record<string, readonly string[]>>;
  activeCategoryId: string | null;
  /** Set when a category switch is requested while landed/playing; applied on reverse-handover completion. */
  pendingCategoryId: string | null;
  /** Keeps `nav.idle` pending until the visual reverse handover has restored the globe. */
  returnToIdleAfterReverse: boolean;
  previewedProjectId: string | null;
  selectedProjectId: string | null;
  activeContentPosition: ContentOptionPosition | null;
  activeSequenceId: string | null;
  activeVoiceoverId: string | null;
  /** Bumped on every state-scoped async operation; stale completions are discarded (research.md R5/R6). */
  generation: number;
  lastError: { atState: string; reason: string } | null;
  /** Adapter-handle registry (renderer/orchestrator handles are stubbed until PH3+). */
  cleanup: CleanupRegistry;
  /** Runtime adapter registry populated by the app shell only after release revalidation. */
  runtime: ExperienceRuntime;
}

export const INITIAL_CONTEXT: Omit<ExperienceContext, 'cleanup' | 'runtime'> = {
  categoryProjectIds: {},
  activeCategoryId: null,
  pendingCategoryId: null,
  returnToIdleAfterReverse: false,
  previewedProjectId: null,
  selectedProjectId: null,
  activeContentPosition: null,
  activeSequenceId: null,
  activeVoiceoverId: null,
  generation: 0,
  lastError: null,
};
