import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import type { SourceAttachment, Submission } from '@yii/content-schema';
import { normalizeSubmission, toSlug } from './normalize.ts';

export interface ManualImportOptions {
  folder: string;
  storageRoot: string;
  existing?: Submission;
  clock?: () => Date;
}

export interface ManualSubmissionPreview {
  id: string;
  metadata: Record<string, string>;
  body: string;
  markdownFile: string;
}

function parseFrontMatter(markdown: string): {
  metadata: Record<string, string>;
  body: string;
} {
  const normalized = markdown.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return { metadata: {}, body: normalized.trim() };
  const end = normalized.indexOf('\n---\n', 4);
  if (end === -1) return { metadata: {}, body: normalized.trim() };
  const metadata: Record<string, string> = {};
  for (const line of normalized.slice(4, end).split('\n')) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key && value) metadata[key] = value;
  }
  return { metadata, body: normalized.slice(end + 5).trim() };
}

function firstHeading(markdown: string): string | undefined {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

export async function previewManualSubmission(folder: string): Promise<ManualSubmissionPreview> {
  const entries = await readdir(folder, { withFileTypes: true });
  const markdownEntry =
    entries.find((entry) => entry.isFile() && entry.name === 'submission.md') ??
    entries.find((entry) => entry.isFile() && entry.name.endsWith('.md'));
  if (!markdownEntry) throw new Error('No markdown submission found in the selected folder.');
  const markdown = await readFile(join(folder, markdownEntry.name), 'utf8');
  const { metadata, body } = parseFrontMatter(markdown);
  return {
    id: toSlug(metadata.id ?? metadata.projectId ?? basename(folder)),
    metadata,
    body,
    markdownFile: markdownEntry.name,
  };
}

export async function importManualSubmission(options: ManualImportOptions): Promise<Submission> {
  const entries = await readdir(options.folder, { withFileTypes: true });
  const preview = await previewManualSubmission(options.folder);
  const { id, metadata, body } = preview;
  const rawFields: Record<string, unknown> = {
    ...metadata,
    name: metadata.name ?? firstHeading(body) ?? id,
    description: body,
    source: `manual:${preview.markdownFile}`,
  };

  const attachmentDir = join(options.storageRoot, id, 'attachments');
  await mkdir(attachmentDir, { recursive: true });
  const attachments: SourceAttachment[] = [];
  const nestedAttachmentFiles = await (async () => {
    try {
      return (await readdir(join(options.folder, 'attachments'), { withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => ({ name: entry.name, source: join(options.folder, 'attachments') }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  })();
  const attachmentFiles = [
    ...entries
      .filter((entry) => entry.isFile() && !entry.name.endsWith('.md'))
      .map((entry) => ({ name: entry.name, source: options.folder })),
    ...nestedAttachmentFiles,
  ];
  for (const entry of attachmentFiles) {
    const attachmentId = toSlug(
      `${entry.source === options.folder ? 'root' : 'attachments'}-${entry.name}`,
    );
    const destination = join(attachmentDir, `${attachmentId}-${basename(entry.name)}`);
    await copyFile(join(entry.source, entry.name), destination);
    attachments.push({
      id: attachmentId,
      originUrl: `manual:${entry.source === options.folder ? entry.name : `attachments/${entry.name}`}`,
      localPath: relative(options.storageRoot, destination).split('\\').join('/'),
    });
  }

  return normalizeSubmission(
    {
      id,
      rawFields,
      passageFields: [
        ...Object.entries(metadata).map(([field, text]) => ({ field, text })),
        { field: 'description', text: body },
      ],
      attachments,
    },
    { existing: options.existing, clock: options.clock },
  );
}
