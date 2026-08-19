import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { submissionSchema } from '@yii/content-schema';
import { importCopilotDrafts } from '../analyze/copilot-agent.ts';
import { persistDraftSet } from '../analyze/draft-store.ts';

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

export async function runIngestDraftsCommand(args: string[]): Promise<void> {
  const projectId = args.find((argument) => !argument.startsWith('--'));
  if (!projectId)
    throw new Error('Usage: ingest-drafts <projectId> [--work-root DIR] [--store DIR]');
  const workRoot = resolve(valueAfter(args, '--work-root') ?? 'work');
  const storeRoot = resolve(valueAfter(args, '--store') ?? 'editorial');
  const workspaceDirectory = resolve(workRoot, projectId, 'drafting');
  const rawWorkspaceSubmission = JSON.parse(
    await readFile(resolve(workspaceDirectory, 'submission.json'), 'utf8'),
  ) as unknown;
  const workspaceSubmission = submissionSchema.parse(rawWorkspaceSubmission);
  let submission = workspaceSubmission;
  try {
    const rawStoredSubmission = JSON.parse(
      await readFile(resolve(storeRoot, projectId, 'submission.json'), 'utf8'),
    ) as unknown;
    submission = submissionSchema.parse(rawStoredSubmission);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (workspaceSubmission.id !== projectId || submission.id !== projectId) {
    throw new Error(`Submission id does not match requested project "${projectId}".`);
  }
  if (JSON.stringify(workspaceSubmission) !== JSON.stringify(submission)) {
    throw new Error('Drafting workspace submission differs from the stored traceability source.');
  }
  const drafts = await importCopilotDrafts({ submission, workspaceDirectory });
  await persistDraftSet({ submission, drafts, storeRoot });
  const destination = resolve(storeRoot, projectId, 'drafts');
  console.log(`[content-pipeline] imported Copilot drafts for "${projectId}" into ${destination}`);
}
