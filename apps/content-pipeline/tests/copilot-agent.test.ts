import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importCopilotDrafts } from '../src/analyze/copilot-agent.ts';
import { emitDraftingWorkspace } from '../src/analyze/workspace-emitter.ts';
import { DraftValidationError } from '../src/analyze/provider.ts';
import {
  createAnalysisContent,
  createOptionContent,
  createSubmission,
  FIXED_NOW,
} from './fixtures/editorial.ts';

describe('T059 Copilot agent drafting driver', () => {
  let workRoot: string;

  beforeEach(async () => {
    workRoot = await mkdtemp(join(tmpdir(), 'yii-drafting-workspace-'));
  });

  afterEach(async () => {
    await rm(workRoot, { recursive: true, force: true });
  });

  it('emits a self-contained workspace with source data, schemas, and instructions', async () => {
    const result = await emitDraftingWorkspace({ submission: createSubmission(), workRoot });

    expect(result.files).toEqual(
      expect.arrayContaining([
        'submission.json',
        'instructions.md',
        'schema/analysis-content.schema.json',
        'schema/options-content.schema.json',
      ]),
    );
    await expect(readFile(join(result.directory, 'submission.json'), 'utf8')).resolves.toContain(
      'description-p-1',
    );
    await expect(readFile(join(result.directory, 'instructions.md'), 'utf8')).resolves.toContain(
      'Never mark content approved',
    );
  });

  it('round-trips valid hand-written drafts with Copilot provenance', async () => {
    const submission = createSubmission();
    const workspace = await emitDraftingWorkspace({ submission, workRoot });
    await writeFile(
      join(workspace.directory, 'analysis.draft.json'),
      JSON.stringify(createAnalysisContent()),
    );
    await writeFile(
      join(workspace.directory, 'options.draft.json'),
      JSON.stringify([createOptionContent()]),
    );

    const imported = await importCopilotDrafts({
      submission,
      workspaceDirectory: workspace.directory,
      clock: () => new Date(FIXED_NOW),
    });
    expect(imported.analysis.producedBy).toBe('copilot-agent');
    expect(imported.options.producedBy).toBe('copilot-agent');
    expect(imported.options.status).toBe('draft');
  });

  it('rejects invalid and unreferenced hand-written drafts like the API driver', async () => {
    const submission = createSubmission();
    const workspace = await emitDraftingWorkspace({ submission, workRoot });
    await writeFile(
      join(workspace.directory, 'analysis.draft.json'),
      JSON.stringify(createAnalysisContent()),
    );
    await writeFile(
      join(workspace.directory, 'options.draft.json'),
      JSON.stringify([
        createOptionContent({
          title: {
            text: 'No source',
            sourceLinks: [{ submissionId: 'project-one', passageId: 'not-there' }],
          },
        }),
      ]),
    );

    await expect(
      importCopilotDrafts({ submission, workspaceDirectory: workspace.directory }),
    ).rejects.toThrow(DraftValidationError);
  });
});
