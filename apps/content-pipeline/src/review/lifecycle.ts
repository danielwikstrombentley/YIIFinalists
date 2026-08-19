import {
  editorialOptionSchema,
  isLegalReviewStateTransition,
  type EditorialOption,
  type ReviewState,
} from '@yii/content-schema';
import { appendAuditRecord } from './audit.ts';

export type EditorialActorRole = 'human-editor' | 'automation' | 'release-builder';

export interface EditorialTransitionContext {
  actor: string;
  role: EditorialActorRole;
  at?: string;
  note?: string;
}

export class EditorialLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditorialLifecycleError';
  }
}

export function transitionEditorialOption(
  option: EditorialOption,
  to: ReviewState,
  context: EditorialTransitionContext,
): EditorialOption {
  if (!isLegalReviewStateTransition(option.reviewState, to)) {
    throw new EditorialLifecycleError(
      `Illegal editorial transition: ${option.reviewState} -> ${to}.`,
    );
  }
  if (to === 'approved' && context.role !== 'human-editor') {
    throw new EditorialLifecycleError('Approval requires an explicit human editor action.');
  }
  if (to === 'published' && context.role !== 'release-builder') {
    throw new EditorialLifecycleError('Only a validated release build can mark content published.');
  }

  return editorialOptionSchema.parse(
    appendAuditRecord(
      { ...option, reviewState: to },
      {
        at: context.at ?? new Date().toISOString(),
        actor: context.actor,
        field: 'reviewState',
        previousValue: option.reviewState,
        newValue: to,
        note: context.note,
      },
    ),
  );
}
