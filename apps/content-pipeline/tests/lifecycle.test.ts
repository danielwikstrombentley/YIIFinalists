import { describe, expect, it } from 'vitest';
import { violatesAiApprovalInvariant } from '@yii/content-schema';
import { EditorialLifecycleError, transitionEditorialOption } from '../src/review/lifecycle.ts';
import { editEditorialOption } from '../src/review/audit.ts';
import { assertReleaseEligible } from '../src/review/store.ts';
import { createEditorialOption, FIXED_NOW } from './fixtures/editorial.ts';

describe('T056 editorial lifecycle invariants', () => {
  it('supports draft -> in-review -> returned -> in-review -> approved -> published', () => {
    let option = createEditorialOption();
    option = transitionEditorialOption(option, 'in-review', {
      actor: 'editor@example.com',
      role: 'human-editor',
      at: FIXED_NOW,
    });
    option = transitionEditorialOption(option, 'returned', {
      actor: 'editor@example.com',
      role: 'human-editor',
      at: FIXED_NOW,
    });
    option = transitionEditorialOption(option, 'in-review', {
      actor: 'editor@example.com',
      role: 'human-editor',
      at: FIXED_NOW,
    });
    option = transitionEditorialOption(option, 'approved', {
      actor: 'editor@example.com',
      role: 'human-editor',
      at: FIXED_NOW,
    });
    option = transitionEditorialOption(option, 'published', {
      actor: 'release-builder',
      role: 'release-builder',
      at: FIXED_NOW,
    });

    expect(option.reviewState).toBe('published');
  });

  it('makes rejected terminal and blocks illegal skips', () => {
    const inReview = transitionEditorialOption(createEditorialOption(), 'in-review', {
      actor: 'editor@example.com',
      role: 'human-editor',
      at: FIXED_NOW,
    });
    const rejected = transitionEditorialOption(inReview, 'rejected', {
      actor: 'editor@example.com',
      role: 'human-editor',
      at: FIXED_NOW,
    });

    expect(() =>
      transitionEditorialOption(rejected, 'in-review', {
        actor: 'editor@example.com',
        role: 'human-editor',
        at: FIXED_NOW,
      }),
    ).toThrow(EditorialLifecycleError);
    expect(() =>
      transitionEditorialOption(createEditorialOption(), 'approved', {
        actor: 'editor@example.com',
        role: 'human-editor',
        at: FIXED_NOW,
      }),
    ).toThrow(EditorialLifecycleError);
  });

  it('permits approval only through a human-editor transition', () => {
    const inReview = transitionEditorialOption(createEditorialOption(), 'in-review', {
      actor: 'editor@example.com',
      role: 'human-editor',
      at: FIXED_NOW,
    });

    expect(() =>
      transitionEditorialOption(inReview, 'approved', {
        actor: 'automation',
        role: 'automation',
        at: FIXED_NOW,
      }),
    ).toThrow(/human/i);
  });

  it('blocks every AI-produced record from release until approved', () => {
    const draft = createEditorialOption();
    expect(violatesAiApprovalInvariant(draft)).toBe(true);
    expect(() => assertReleaseEligible([draft])).toThrow(/not approved/i);

    const inReview = transitionEditorialOption(draft, 'in-review', {
      actor: 'editor@example.com',
      role: 'human-editor',
      at: FIXED_NOW,
    });
    const approved = transitionEditorialOption(inReview, 'approved', {
      actor: 'editor@example.com',
      role: 'human-editor',
      at: FIXED_NOW,
    });
    expect(() => assertReleaseEligible([approved])).not.toThrow();
  });

  it('retains original wording and every revision while versioning display and voiceover separately', () => {
    let option = createEditorialOption();
    option = editEditorialOption(option, 'draftDisplayText', {
      text: 'Revised display copy.',
      sourceLinks: option.sourceLinks,
      actor: 'editor@example.com',
      at: FIXED_NOW,
    });
    option = editEditorialOption(option, 'draftVoiceoverText', {
      text: 'Revised narration.',
      sourceLinks: option.sourceLinks,
      actor: 'editor@example.com',
      at: '2026-08-19T10:01:00.000Z',
    });

    expect(option.displayTextVersion).toBe(2);
    expect(option.voiceoverTextVersion).toBe(2);
    expect(option.audit).toHaveLength(2);
    expect(option.audit[0]?.previousValue).toEqual(
      createEditorialOption().draftDisplayText,
    );
    expect(option.audit[1]?.previousValue).toEqual(
      createEditorialOption().draftVoiceoverText,
    );
  });
});