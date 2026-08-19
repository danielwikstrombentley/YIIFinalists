import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  draftAnalysisContentSchema,
  draftAnalysisEnvelopeSchema,
  proposedOptionContentsSchema,
  proposedOptionsEnvelopeSchema,
  type DraftAnalysisContent,
  type ProposedOptionContent,
  type Submission,
} from '@yii/content-schema';
import { assertSubmissionReferences, DraftValidationError, type Draft } from './provider.ts';

export const COPILOT_ANALYZE_PROMPT_VERSION = 'copilot-analyze.v1';
export const COPILOT_PROPOSE_PROMPT_VERSION = 'copilot-propose.v1';

export interface ImportedCopilotDrafts {
  analysis: Draft<DraftAnalysisContent>;
  options: Draft<ProposedOptionContent[]>;
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as unknown;
  } catch (error) {
    throw new DraftValidationError(`Could not read a valid draft JSON file at ${file}.`, error);
  }
}

export async function importCopilotDrafts(options: {
  submission: Submission;
  workspaceDirectory: string;
  clock?: () => Date;
}): Promise<ImportedCopilotDrafts> {
  const [rawAnalysis, rawOptions] = await Promise.all([
    readJson(resolve(options.workspaceDirectory, 'analysis.draft.json')),
    readJson(resolve(options.workspaceDirectory, 'options.draft.json')),
  ]);
  const analysis = draftAnalysisContentSchema.safeParse(rawAnalysis);
  const proposedOptions = proposedOptionContentsSchema.safeParse(rawOptions);
  if (!analysis.success || !proposedOptions.success) {
    throw new DraftValidationError('Copilot draft files failed the shared drafting schemas.', {
      analysis: analysis.success ? undefined : analysis.error.issues,
      options: proposedOptions.success ? undefined : proposedOptions.error.issues,
    });
  }
  if (analysis.data.submissionId !== options.submission.id) {
    throw new DraftValidationError('Copilot analysis references the wrong submission.');
  }
  if (proposedOptions.data.some((option) => option.projectId !== options.submission.id)) {
    throw new DraftValidationError('Copilot options reference the wrong project.');
  }
  assertSubmissionReferences(analysis.data, options.submission);
  assertSubmissionReferences(proposedOptions.data, options.submission);

  const createdAt = (options.clock ?? (() => new Date()))().toISOString();
  return {
    analysis: draftAnalysisEnvelopeSchema.parse({
      data: analysis.data,
      producedBy: 'copilot-agent',
      promptVersion: COPILOT_ANALYZE_PROMPT_VERSION,
      createdAt,
      status: 'draft',
    }),
    options: proposedOptionsEnvelopeSchema.parse({
      data: proposedOptions.data,
      producedBy: 'copilot-agent',
      promptVersion: COPILOT_PROPOSE_PROMPT_VERSION,
      createdAt,
      status: 'draft',
    }),
  };
}
