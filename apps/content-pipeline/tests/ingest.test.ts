import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { submissionSchema } from '@yii/content-schema';
import { ingestClickUpList } from '../src/ingest/clickup.ts';
import { importManualSubmission } from '../src/ingest/manual.ts';
import { normalizeSubmission } from '../src/ingest/normalize.ts';
import { FIXED_NOW } from './fixtures/editorial.ts';

describe('T057 ingestion', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'yii-ingest-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('normalizes fields and preserves stable anchors across idempotent and edited re-ingests', () => {
    const first = normalizeSubmission(
      {
        id: 'Project One',
        rawFields: { name: 'Project One' },
        passageFields: [{ field: 'description', text: 'First paragraph.\n\nSecond paragraph.' }],
        attachments: [],
      },
      { clock: () => new Date(FIXED_NOW) },
    );
    const unchanged = normalizeSubmission(
      {
        id: 'Project One',
        rawFields: { name: 'Project One' },
        passageFields: [{ field: 'description', text: 'First paragraph.\n\nSecond paragraph.' }],
        attachments: [],
      },
      { existing: first, clock: () => new Date('2026-08-20T10:00:00.000Z') },
    );
    const wordingEdited = normalizeSubmission(
      {
        id: 'Project One',
        rawFields: { name: 'Project One' },
        passageFields: [
          { field: 'description', text: 'First paragraph revised.\n\nSecond paragraph.' },
        ],
        attachments: [],
      },
      { existing: first, clock: () => new Date('2026-08-20T11:00:00.000Z') },
    );
    const edited = normalizeSubmission(
      {
        id: 'Project One',
        rawFields: { name: 'Project One', country: 'Sweden' },
        passageFields: [
          { field: 'description', text: 'Second paragraph.\n\nNew paragraph.' },
          { field: 'country', text: 'Sweden' },
        ],
        attachments: [],
      },
      { existing: unchanged, clock: () => new Date('2026-08-21T10:00:00.000Z') },
    );

    expect(submissionSchema.safeParse(first).success).toBe(true);
    expect(unchanged).toEqual(first);
    expect(wordingEdited.passages[0]?.id).toBe(first.passages[0]?.id);
    expect(edited.revision).toBe(2);
    expect(edited.passages.find((passage) => passage.text === 'Second paragraph.')?.id).toBe(
      first.passages.find((passage) => passage.text === 'Second paragraph.')?.id,
    );
  });

  it('imports a markdown folder and localizes its attachments', async () => {
    const folder = join(root, 'manual-source');
    await (await import('node:fs/promises')).mkdir(folder);
    await writeFile(
      join(folder, 'submission.md'),
      '---\nid: project-two\norganisation: Manual Studio\ncountry: Denmark\n---\n# Harbour Loop\n\nA connected harbour route.',
      'utf8',
    );
    await writeFile(join(folder, 'diagram.png'), 'image-bytes', 'utf8');

    const submission = await importManualSubmission({
      folder,
      storageRoot: join(root, 'sources'),
      clock: () => new Date(FIXED_NOW),
    });

    expect(submission.id).toBe('project-two');
    expect(submission.attachments[0]?.id).toBe('root-diagram-png');
    expect(submission.rawFields.organisation).toBe('Manual Studio');
    expect(submission.attachments).toHaveLength(1);
    await expect(
      readFile(join(root, 'sources', submission.attachments[0]!.localPath), 'utf8'),
    ).resolves.toBe('image-bytes');

    const reingested = await importManualSubmission({
      folder,
      storageRoot: join(root, 'sources'),
      existing: submission,
      clock: () => new Date('2026-08-20T10:00:00.000Z'),
    });
    expect(reingested).toEqual(submission);
  });

  it('enumerates a recorded ClickUp list fixture and downloads attachments without real network', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/list/list-1/task')) {
        return Response.json({ tasks: url.includes('page=0') ? [{ id: 'cu-101' }] : [] });
      }
      if (url.endsWith('/task/cu-101')) {
        return Response.json({
          id: 'cu-101',
          name: 'River Commons',
          description: 'Reconnects the riverfront.',
          custom_fields: [
            { name: 'Project ID', value: 'project-one' },
            { name: 'Organisation', value: 'Example Studio' },
            { name: 'Country', value: 'Sweden' },
          ],
          attachments: [{ id: 'att-1', title: 'plan.pdf', url: 'https://files.test/plan.pdf' }],
        });
      }
      if (url.endsWith('/task/cu-101/comment')) {
        return Response.json({
          comments: [{ id: 4, comment_text: 'Metric requires verification.' }],
        });
      }
      if (url === 'https://files.test/plan.pdf') {
        return new Response('pdf-bytes', { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    const [submission] = await ingestClickUpList({
      listId: 'list-1',
      storageRoot: join(root, 'sources'),
      token: 'test-token',
      baseUrl: 'https://api.test/api/v2',
      fetch: fetchMock as typeof fetch,
      clock: () => new Date(FIXED_NOW),
    });

    expect(submission?.clickupTaskId).toBe('cu-101');
    expect(submission?.rawFields.organisation).toBe('Example Studio');
    expect(submission?.passages.some((passage) => passage.field === 'comment-4')).toBe(true);
    expect(submission?.attachments).toHaveLength(1);
    await expect(
      readFile(join(root, 'sources', submission!.attachments[0]!.localPath), 'utf8'),
    ).resolves.toBe('pdf-bytes');
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('requires CLICKUP_API_TOKEN and never accepts it as submission data', async () => {
    await expect(
      ingestClickUpList({
        listId: 'list-1',
        storageRoot: join(root, 'sources'),
        token: '',
      }),
    ).rejects.toThrow(/CLICKUP_API_TOKEN/);
  });
});
