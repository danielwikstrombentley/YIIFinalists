import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import type { SourceAttachment, Submission } from '@yii/content-schema';
import { normalizeSubmission, toSlug } from './normalize.ts';
import type { PassageField } from './passages.ts';

const DEFAULT_CLICKUP_BASE_URL = 'https://api.clickup.com/api/v2';

interface ClickUpListResponse {
  tasks?: Array<{ id: string }>;
  last_page?: boolean;
}

interface ClickUpCustomField {
  id?: string;
  name?: string;
  value?: unknown;
  type_config?: { options?: Array<{ id?: string; name?: string; label?: string }> };
}

interface ClickUpAttachment {
  id?: string;
  title?: string;
  name?: string;
  url?: string;
  url_w_query?: string;
}

interface ClickUpTask {
  id?: string;
  name?: string;
  description?: string;
  text_content?: string;
  custom_fields?: ClickUpCustomField[];
  attachments?: ClickUpAttachment[];
}

interface ClickUpComment {
  id?: number | string;
  comment_text?: string;
  text_content?: string;
  comment?: Array<{ text?: string }>;
  attachments?: ClickUpAttachment[];
}

interface ClickUpCommentsResponse {
  comments?: ClickUpComment[];
}

export interface ClickUpIngestOptions {
  listId: string;
  storageRoot: string;
  token?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  existing?: ReadonlyMap<string, Submission>;
  clock?: () => Date;
}

function jsonHeaders(token: string): HeadersInit {
  return { Authorization: token, Accept: 'application/json' };
}

async function requireResponse(response: Response, context: string): Promise<Response> {
  if (!response.ok) throw new Error(`ClickUp ${context} failed with HTTP ${response.status}.`);
  return response;
}

function canonicalFieldName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
  const aliases: Record<string, string> = {
    organization: 'organisation',
    organisation: 'organisation',
    category: 'category',
    country: 'country',
    location: 'location',
    links: 'links',
    link: 'links',
    metrics: 'metrics',
    metric: 'metrics',
    'product references': 'productReferences',
    products: 'productReferences',
    'project id': 'projectId',
  };
  return (
    aliases[normalized] ??
    normalized.replace(/\s+(.)/g, (_, letter: string) => letter.toUpperCase())
  );
}

function customFieldValue(field: ClickUpCustomField): unknown {
  const value = field.value;
  const options = field.type_config?.options ?? [];
  const decode = (item: unknown): unknown => {
    if (typeof item === 'string' || typeof item === 'number') {
      const option = options.find((candidate) => String(candidate.id) === String(item));
      return option?.name ?? option?.label ?? item;
    }
    if (item && typeof item === 'object' && 'name' in item) {
      return String((item as { name: unknown }).name);
    }
    return item;
  };
  return Array.isArray(value) ? value.map(decode) : decode(value);
}

function passageText(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function commentText(comment: ClickUpComment): string {
  return (
    comment.comment_text ??
    comment.text_content ??
    comment.comment?.map((part) => part.text ?? '').join('') ??
    ''
  ).trim();
}

function attachmentName(attachment: ClickUpAttachment): string {
  const safe = basename(attachment.title ?? attachment.name ?? 'attachment').replace(
    /[^a-zA-Z0-9._-]+/g,
    '-',
  );
  return safe || 'attachment';
}

async function localizeAttachments(
  attachments: readonly ClickUpAttachment[],
  submissionId: string,
  storageRoot: string,
  token: string,
  fetcher: typeof fetch,
): Promise<SourceAttachment[]> {
  const destinationDir = join(storageRoot, submissionId, 'attachments');
  await mkdir(destinationDir, { recursive: true });

  const localized: SourceAttachment[] = [];
  for (const [index, attachment] of attachments.entries()) {
    const originUrl = attachment.url_w_query ?? attachment.url;
    if (!originUrl) continue;
    const id = String(attachment.id ?? `attachment-${index + 1}`);
    const destination = join(destinationDir, `${toSlug(id)}-${attachmentName(attachment)}`);
    const response = await requireResponse(
      await fetcher(originUrl, { headers: jsonHeaders(token) }),
      `attachment download (${id})`,
    );
    await writeFile(destination, new Uint8Array(await response.arrayBuffer()));
    localized.push({
      id,
      originUrl,
      localPath: relative(storageRoot, destination).split('\\').join('/'),
    });
  }
  return localized;
}

async function listTaskIds(
  listId: string,
  baseUrl: string,
  token: string,
  fetcher: typeof fetch,
): Promise<string[]> {
  const taskIds: string[] = [];
  for (let page = 0; ; page += 1) {
    const url = `${baseUrl}/list/${encodeURIComponent(listId)}/task?include_closed=true&page=${page}`;
    const response = await requireResponse(
      await fetcher(url, { headers: jsonHeaders(token) }),
      `list enumeration (${listId})`,
    );
    const body = (await response.json()) as ClickUpListResponse;
    const tasks = body.tasks ?? [];
    taskIds.push(...tasks.map((task) => task.id));
    if (body.last_page === true || tasks.length === 0) break;
  }
  return taskIds;
}

export async function ingestClickUpList(options: ClickUpIngestOptions): Promise<Submission[]> {
  const token = options.token ?? process.env.CLICKUP_API_TOKEN;
  if (!token) throw new Error('CLICKUP_API_TOKEN is required for ClickUp ingestion.');
  const fetcher = options.fetch ?? globalThis.fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_CLICKUP_BASE_URL).replace(/\/$/, '');
  const submissions: Submission[] = [];

  for (const taskId of await listTaskIds(options.listId, baseUrl, token, fetcher)) {
    const [taskResponse, commentsResponse] = await Promise.all([
      requireResponse(
        await fetcher(`${baseUrl}/task/${encodeURIComponent(taskId)}`, {
          headers: jsonHeaders(token),
        }),
        `task read (${taskId})`,
      ),
      requireResponse(
        await fetcher(`${baseUrl}/task/${encodeURIComponent(taskId)}/comment`, {
          headers: jsonHeaders(token),
        }),
        `comment read (${taskId})`,
      ),
    ]);
    const task = (await taskResponse.json()) as ClickUpTask;
    const comments = ((await commentsResponse.json()) as ClickUpCommentsResponse).comments ?? [];
    const rawFields: Record<string, unknown> = {
      name: task.name ?? task.id,
      description: task.description ?? task.text_content ?? '',
    };
    for (const field of task.custom_fields ?? []) {
      if (!field.name) continue;
      rawFields[canonicalFieldName(field.name)] = customFieldValue(field);
    }
    if (comments.length > 0) rawFields.comments = comments.map(commentText).filter(Boolean);

    const authoritativeTaskId = task.id ?? taskId;
    const sourceId = passageText(rawFields.projectId) ?? authoritativeTaskId;
    const submissionId = toSlug(sourceId);
    const passageFields: PassageField[] = [];
    for (const [field, value] of Object.entries(rawFields)) {
      if (field === 'comments') continue;
      const text = passageText(value);
      if (text) passageFields.push({ field, text });
    }
    for (const comment of comments) {
      const text = commentText(comment);
      if (text) passageFields.push({ field: `comment-${comment.id ?? 'unknown'}`, text });
    }

    const allAttachments = [
      ...(task.attachments ?? []),
      ...comments.flatMap((comment) => comment.attachments ?? []),
    ];
    const attachments = await localizeAttachments(
      allAttachments,
      submissionId,
      options.storageRoot,
      token,
      fetcher,
    );
    submissions.push(
      normalizeSubmission(
        {
          id: submissionId,
          clickupTaskId: authoritativeTaskId,
          rawFields,
          passageFields,
          attachments,
        },
        { existing: options.existing?.get(submissionId), clock: options.clock },
      ),
    );
  }
  return submissions;
}
