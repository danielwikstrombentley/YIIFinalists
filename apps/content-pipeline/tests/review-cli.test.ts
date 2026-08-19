import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runReviewCommand } from '../src/review/cli.ts';
import { assertReleaseEligible, EditorialStore } from '../src/review/store.ts';
import { createEditorialOption, createSubmission } from './fixtures/editorial.ts';

describe('T060 review CLI', () => {
  let storeRoot: string;

  beforeEach(async () => {
    storeRoot = await mkdtemp(join(tmpdir(), 'yii-review-cli-'));
    await mkdir(join(storeRoot, 'project-one'), { recursive: true });
    await writeFile(
      join(storeRoot, 'project-one', 'submission.json'),
      `${JSON.stringify(createSubmission(), null, 2)}\n`,
    );
    await new EditorialStore(storeRoot).write({
      projectId: 'project-one',
      options: [createEditorialOption()],
      metrics: [],
      selectedMedia: [],
      audit: [],
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(storeRoot, { recursive: true, force: true });
  });

  it('shows per-claim source passage wording during review', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runReviewCommand([
      '--project',
      'project-one',
      '--position',
      '1',
      '--action',
      'trace',
      '--actor',
      'editor@example.com',
      '--store',
      storeRoot,
    ]);

    expect(log).toHaveBeenCalledWith(expect.stringContaining('Three neighbourhoods, reconnected'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('description-p-1'));
    expect(log.mock.calls.flat().join('\n')).toMatch(
      /reconnects three neighbourhoods along the river/i,
    );
  });

  it('versions display and voiceover separately and human-approves through legal transitions', async () => {
    const common = [
      '--project',
      'project-one',
      '--position',
      '1',
      '--actor',
      'editor@example.com',
      '--store',
      storeRoot,
    ];
    await runReviewCommand([...common, '--action', 'open']);
    await runReviewCommand([...common, '--action', 'rewrite-display', '--text', 'Edited display.']);
    let record = await new EditorialStore(storeRoot).read('project-one');
    expect(record.options[0]?.displayTextVersion).toBe(2);
    expect(record.options[0]?.voiceoverTextVersion).toBe(1);

    await runReviewCommand([
      ...common,
      '--action',
      'rewrite-voiceover',
      '--text',
      'Edited voiceover.',
    ]);
    await runReviewCommand([...common, '--action', 'accept']);
    record = await new EditorialStore(storeRoot).read('project-one');
    expect(record.options[0]?.voiceoverTextVersion).toBe(2);
    expect(record.options[0]?.reviewState).toBe('approved');
    expect(() => assertReleaseEligible(record.options)).not.toThrow();
  });

  it('applies the remaining editorial operations with an audit trail', async () => {
    const store = new EditorialStore(storeRoot);
    const original = await store.read('project-one');
    await store.write({
      ...original,
      options: [
        original.options[0]!,
        createEditorialOption({
          position: 2,
          title: {
            text: 'Second option',
            sourceLinks: original.options[0]!.sourceLinks,
          },
        }),
      ],
    });
    const common = [
      '--project',
      'project-one',
      '--position',
      '1',
      '--actor',
      'editor@example.com',
      '--store',
      storeRoot,
    ];
    const source = 'project-one:description-p-1';
    await runReviewCommand([...common, '--action', 'rename', '--text', 'Renamed overview']);
    await runReviewCommand([...common, '--action', 'reorder', '--to', '2']);
    const positionTwo = common.map((value) => (value === '1' ? '2' : value));
    await runReviewCommand([
      ...positionTwo,
      '--action',
      'remove-claim',
      '--field',
      'display',
      '--text',
      'Supported wording only.',
      '--source',
      source,
    ]);
    await runReviewCommand([...positionTwo, '--action', 'set-format', '--format', 'quote']);
    await runReviewCommand([...positionTwo, '--action', 'select-media', '--media', 'hero.jpg']);
    await runReviewCommand([
      ...positionTwo,
      '--action',
      'edit-metrics',
      '--json',
      JSON.stringify([
        {
          label: 'Connected neighbourhoods',
          value: '3',
          verified: true,
          sourceLinks: [{ submissionId: 'project-one', passageId: 'description-p-1' }],
        },
      ]),
    ]);
    await runReviewCommand([
      ...positionTwo,
      '--action',
      'set-framing',
      '--json',
      JSON.stringify({ scopeType: 'city' }),
    ]);
    await runReviewCommand([...positionTwo, '--action', 'open']);
    await runReviewCommand([...positionTwo, '--action', 'return']);

    const record = await store.read('project-one');
    const edited = record.options.find((option) => option.position === 2)!;
    expect(edited.title.text).toBe('Renamed overview');
    expect(edited.draftDisplayText.text).toBe('Supported wording only.');
    expect(edited.formatRecommendation).toBe('quote');
    expect(edited.reviewState).toBe('returned');
    expect(record.selectedMedia).toEqual(['hero.jpg']);
    expect(record.metrics).toHaveLength(1);
    expect(record.geographicFraming).toEqual({ scopeType: 'city' });
    expect(record.audit).toHaveLength(3);
  });
});
