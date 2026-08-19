import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { submissionSchema, type Submission } from '@yii/content-schema';
import { ingestClickUpList } from '../ingest/clickup.ts';
import { importManualSubmission, previewManualSubmission } from '../ingest/manual.ts';

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

async function existingSubmission(
  root: string,
  projectId: string,
): Promise<Submission | undefined> {
  try {
    return submissionSchema.parse(
      JSON.parse(await readFile(resolve(root, projectId, 'submission.json'), 'utf8')) as unknown,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function existingSubmissions(root: string): Promise<Map<string, Submission>> {
  const submissions = new Map<string, Submission>();
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return submissions;
    throw error;
  }
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
      .map(async (entry) => {
        const submission = await existingSubmission(root, entry.name);
        if (submission) submissions.set(submission.id, submission);
      }),
  );
  return submissions;
}

async function persist(root: string, submission: Submission): Promise<void> {
  const destination = resolve(root, submission.id);
  await mkdir(destination, { recursive: true });
  await writeFile(
    resolve(destination, 'submission.json'),
    `${JSON.stringify(submission, null, 2)}\n`,
    'utf8',
  );
}

export async function runIngestCommand(args: string[]): Promise<void> {
  const source = valueAfter(args, '--source');
  const storeRoot = resolve(valueAfter(args, '--store') ?? 'editorial');
  const sourceRoot = resolve(valueAfter(args, '--source-root') ?? resolve(storeRoot, '_sources'));
  let submissions: Submission[];

  if (source === 'clickup') {
    const listId = valueAfter(args, '--list');
    if (!listId) throw new Error('ingest --source clickup requires --list <listId>.');
    const existing = await existingSubmissions(storeRoot);
    submissions = await ingestClickUpList({ listId, storageRoot: sourceRoot, existing });
  } else if (source === 'folder') {
    const folder = args.find(
      (argument, index) => index > args.indexOf('--source') + 1 && !argument.startsWith('--'),
    );
    if (!folder) throw new Error('ingest --source folder requires a folder path.');
    const absoluteFolder = resolve(folder);
    const preview = await previewManualSubmission(absoluteFolder);
    submissions = [
      await importManualSubmission({
        folder: absoluteFolder,
        storageRoot: sourceRoot,
        existing: await existingSubmission(storeRoot, preview.id),
      }),
    ];
  } else {
    throw new Error('ingest requires --source clickup or --source folder.');
  }

  for (const submission of submissions) await persist(storeRoot, submission);
  console.log(`[content-pipeline] ingested ${submissions.length} submission(s) into ${storeRoot}`);
}
