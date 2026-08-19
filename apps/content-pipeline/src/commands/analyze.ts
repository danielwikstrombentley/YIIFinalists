import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { submissionSchema } from '@yii/content-schema';
import { createApiLlmDraftingProvider } from '../analyze/api-llm.ts';
import { loadPipelineDraftingConfig } from '../analyze/config.ts';
import { persistDraftSet } from '../analyze/draft-store.ts';
import { emitDraftingWorkspace } from '../analyze/workspace-emitter.ts';

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

export async function runAnalyzeCommand(args: string[]): Promise<void> {
  const projectId = valueAfter(args, '--project');
  if (!projectId) throw new Error('analyze requires --project <projectId>.');
  const driver = valueAfter(args, '--driver') ?? 'api-llm';
  const storeRoot = resolve(valueAfter(args, '--store') ?? 'editorial');
  const submission = submissionSchema.parse(
    JSON.parse(await readFile(resolve(storeRoot, projectId, 'submission.json'), 'utf8')) as unknown,
  );

  if (driver === 'copilot-agent') {
    const result = await emitDraftingWorkspace({
      submission,
      workRoot: valueAfter(args, '--work-root'),
    });
    console.log(`[content-pipeline] emitted drafting workspace at ${result.directory}`);
    return;
  }
  if (driver !== 'api-llm') throw new Error(`Unsupported drafting driver "${driver}".`);

  const config = await loadPipelineDraftingConfig({ configFile: valueAfter(args, '--config') });
  const provider = await createApiLlmDraftingProvider({ config });
  const analysis = await provider.analyzeSubmission({ submission });
  const options = await provider.proposeOptions({ submission, analysis: analysis.data });
  await persistDraftSet({ submission, drafts: { analysis, options }, storeRoot });
  console.log(
    `[content-pipeline] generated ${options.data.length} draft option(s) for "${projectId}"`,
  );
}
