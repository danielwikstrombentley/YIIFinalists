import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  draftAnalysisContentSchema,
  proposedOptionContentsSchema,
  type Submission,
} from '@yii/content-schema';
import { z } from 'zod';

export interface DraftingWorkspaceResult {
  directory: string;
  files: string[];
}

function instructions(projectId: string): string {
  return `# Draft YII project ${projectId}

Work only from \`submission.json\` and its anchored passages. Do not browse for or invent facts.

1. Write \`analysis.draft.json\` containing one object matching
   \`schema/analysis-content.schema.json\`.
2. Write \`options.draft.json\` containing one to five objects matching
   \`schema/options-content.schema.json\`. The first must be the Project Overview. Return fewer
   options rather than filler.
3. Every claim, metric, title, rationale, display line, voiceover line, and media recommendation
   must cite existing \`submissionId\` + \`passageId\` values from \`submission.json\`.
4. Identify uncertainty and missing assets. Never mark content approved or published.

The pipeline validates and imports both files; invalid or unreferenced drafts are rejected.
`;
}

export async function emitDraftingWorkspace(options: {
  submission: Submission;
  workRoot?: string;
}): Promise<DraftingWorkspaceResult> {
  const directory = resolve(options.workRoot ?? 'work', options.submission.id, 'drafting');
  const schemaDirectory = resolve(directory, 'schema');
  await mkdir(schemaDirectory, { recursive: true });

  const files: Array<[string, string]> = [
    ['submission.json', `${JSON.stringify(options.submission, null, 2)}\n`],
    ['instructions.md', instructions(options.submission.id)],
    [
      'schema/analysis-content.schema.json',
      `${JSON.stringify(z.toJSONSchema(draftAnalysisContentSchema, { unrepresentable: 'any' }), null, 2)}\n`,
    ],
    [
      'schema/options-content.schema.json',
      `${JSON.stringify(
        z.toJSONSchema(proposedOptionContentsSchema, { unrepresentable: 'any' }),
        null,
        2,
      )}\n`,
    ],
  ];

  await Promise.all(files.map(([name, contents]) => writeFile(resolve(directory, name), contents)));
  return { directory, files: files.map(([name]) => name) };
}
