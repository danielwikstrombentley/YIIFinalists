import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  changeRecordSchema,
  editorialOptionSchema,
  type DraftAnalysisContent,
  type EditorialOption,
  type PassageRef,
  type ProposedOptionContent,
  type Submission,
} from '@yii/content-schema';
import type { Draft } from './provider.ts';
import { EditorialStore, type EditorialProjectRecord } from '../review/store.ts';

export interface DraftSet {
  analysis: Draft<DraftAnalysisContent>;
  options: Draft<ProposedOptionContent[]>;
}

function uniqueSourceLinks(option: ProposedOptionContent): PassageRef[] {
  const links = [
    ...option.title.sourceLinks,
    ...option.rationale.sourceLinks,
    ...option.draftDisplayText.sourceLinks,
    ...option.draftVoiceoverText.sourceLinks,
    ...option.mediaRecommendations.flatMap((recommendation) => recommendation.sourceLinks),
  ];
  return Array.from(
    new Map(links.map((link) => [`${link.submissionId}\0${link.passageId}`, link])).values(),
  );
}

function originalWordingAudit(
  option: ProposedOptionContent,
  draft: Draft<ProposedOptionContent[]>,
): EditorialOption['audit'] {
  return (
    [
      ['title', option.title],
      ['rationale', option.rationale],
      ['draftDisplayText', option.draftDisplayText],
      ['draftVoiceoverText', option.draftVoiceoverText],
      ['mediaRecommendations', option.mediaRecommendations],
    ] as const
  ).map(([field, value]) =>
    changeRecordSchema.parse({
      at: draft.createdAt,
      actor: draft.producedBy,
      field,
      previousValue: null,
      newValue: value,
      note: `Original AI draft (${draft.promptVersion})`,
    }),
  );
}

export function createEditorialOptionFromDraft(
  option: ProposedOptionContent,
  draft: Draft<ProposedOptionContent[]>,
): EditorialOption {
  return editorialOptionSchema.parse({
    ...option,
    sourceLinks: uniqueSourceLinks(option),
    displayTextVersion: 1,
    voiceoverTextVersion: 1,
    reviewState: 'draft',
    producedBy: draft.producedBy,
    promptVersion: draft.promptVersion,
    audit: originalWordingAudit(option, draft),
  });
}

export async function persistDraftSet(options: {
  submission: Submission;
  drafts: DraftSet;
  storeRoot?: string;
}): Promise<EditorialProjectRecord> {
  const storeRoot = resolve(options.storeRoot ?? 'editorial');
  const projectRoot = resolve(storeRoot, options.submission.id);
  const draftRoot = resolve(projectRoot, 'drafts');
  await mkdir(draftRoot, { recursive: true });

  const record: EditorialProjectRecord = {
    projectId: options.submission.id,
    options: options.drafts.options.data.map((option) =>
      createEditorialOptionFromDraft(option, options.drafts.options),
    ),
    metrics: options.drafts.analysis.data.quantResults,
    selectedMedia: [],
    audit: [],
  };

  await Promise.all([
    writeFile(
      resolve(projectRoot, 'submission.json'),
      `${JSON.stringify(options.submission, null, 2)}\n`,
      'utf8',
    ),
    writeFile(
      resolve(draftRoot, 'analysis.json'),
      `${JSON.stringify(options.drafts.analysis, null, 2)}\n`,
      'utf8',
    ),
    writeFile(
      resolve(draftRoot, 'options.json'),
      `${JSON.stringify(options.drafts.options, null, 2)}\n`,
      'utf8',
    ),
    new EditorialStore(storeRoot).write(record),
  ]);
  return record;
}
