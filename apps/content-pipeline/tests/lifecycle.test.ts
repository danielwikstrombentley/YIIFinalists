import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { violatesAiApprovalInvariant } from '@yii/content-schema';
import { persistDraftSet } from '../src/analyze/draft-store.ts';
import { EditorialLifecycleError, transitionEditorialOption } from '../src/review/lifecycle.ts';
import { editEditorialOption } from '../src/review/audit.ts';
import { assertReleaseEligible, EditorialStore } from '../src/review/store.ts';
import {
  createAnalysisContent,
  createEditorialOption,
  createOptionContent,
  createSubmission,
  FIXED_NOW,
} from './fixtures/editorial.ts';

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
    expect(option.audit[0]?.previousValue).toEqual(createEditorialOption().draftDisplayText);
    expect(option.audit[1]?.previousValue).toEqual(createEditorialOption().draftVoiceoverText);
  });

  it('demonstrates ingest-draft -> trace -> edit -> human approval with release gating', async () => {
    const storeRoot = await mkdtemp(join(tmpdir(), 'yii-editorial-store-'));
    try {
      const submission = createSubmission();
      const analysis = {
        data: createAnalysisContent(),
        producedBy: 'copilot-agent' as const,
        promptVersion: 'copilot-analyze.v1',
        createdAt: FIXED_NOW,
        status: 'draft' as const,
      };
      const options = {
        data: [createOptionContent()],
        producedBy: 'copilot-agent' as const,
        promptVersion: 'copilot-propose.v1',
        createdAt: FIXED_NOW,
        status: 'draft' as const,
      };
      const stored = await persistDraftSet({
        submission,
        drafts: { analysis, options },
        storeRoot,
      });
      expect(() => assertReleaseEligible(stored.options)).toThrow(/not approved/i);
      expect(stored.options[0]?.audit[0]?.note).toContain('Original AI draft');

      const opened = transitionEditorialOption(stored.options[0]!, 'in-review', {
        actor: 'editor@example.com',
        role: 'human-editor',
        at: FIXED_NOW,
      });
      const edited = editEditorialOption(opened, 'draftDisplayText', {
        text: 'Editor-approved riverfront story.',
        sourceLinks: opened.draftDisplayText.sourceLinks,
        actor: 'editor@example.com',
        at: '2026-08-19T10:01:00.000Z',
      });
      const approved = transitionEditorialOption(edited, 'approved', {
        actor: 'editor@example.com',
        role: 'human-editor',
        at: '2026-08-19T10:02:00.000Z',
      });
      await new EditorialStore(storeRoot).write({ ...stored, options: [approved] });

      expect(() => assertReleaseEligible([approved])).not.toThrow();
      const persisted = JSON.parse(
        await readFile(join(storeRoot, 'project-one', 'editorial.json'), 'utf8'),
      ) as { options: Array<{ reviewState: string; audit: unknown[] }> };
      expect(persisted.options[0]?.reviewState).toBe('approved');
      expect(persisted.options[0]?.audit).toHaveLength(8);
    } finally {
      await rm(storeRoot, { recursive: true, force: true });
    }
  });
});
