import {
  changeRecordSchema,
  KNOWN_FORMAT_IDS,
  metricClaimSchema,
  type ChangeRecord,
  type EditorialOption,
  type PassageRef,
  type ReviewState,
  type Submission,
  type SourcedText,
} from '@yii/content-schema';
import { z } from 'zod';
import { editEditorialOption, replaceEditorialField } from './audit.ts';
import { transitionEditorialOption } from './lifecycle.ts';
import { EditorialStore, type EditorialProjectRecord } from './store.ts';

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function requireValue(args: readonly string[], flag: string): string {
  const value = valueAfter(args, flag);
  if (!value) throw new Error(`${flag} requires a value.`);
  return value;
}

function selectedOption(
  record: EditorialProjectRecord,
  args: readonly string[],
): {
  index: number;
  option: EditorialOption;
} {
  const position = Number(requireValue(args, '--position'));
  const index = record.options.findIndex((option) => option.position === position);
  const option = record.options[index];
  if (!option) throw new Error(`No editorial option exists at position ${position}.`);
  return { index, option };
}

function parseSourceLinks(args: readonly string[], fallback: PassageRef[]): PassageRef[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--source' && args[index + 1]) values.push(args[index + 1]!);
  }
  if (values.length === 0) return fallback;
  return values.map((value) => {
    const separator = value.indexOf(':');
    if (separator <= 0 || separator === value.length - 1) {
      throw new Error(`Invalid --source "${value}"; expected submissionId:passageId.`);
    }
    return { submissionId: value.slice(0, separator), passageId: value.slice(separator + 1) };
  });
}

function withOption(
  record: EditorialProjectRecord,
  index: number,
  option: EditorialOption,
): EditorialProjectRecord {
  return {
    ...record,
    options: record.options.map((current, currentIndex) =>
      currentIndex === index ? option : current,
    ),
  };
}

function editProjectField<K extends 'metrics' | 'selectedMedia' | 'geographicFraming'>(
  record: EditorialProjectRecord,
  field: K,
  value: EditorialProjectRecord[K],
  context: { actor: string; note?: string },
): EditorialProjectRecord {
  const auditRecord: ChangeRecord = changeRecordSchema.parse({
    at: new Date().toISOString(),
    actor: context.actor,
    field,
    previousValue: record[field] ?? null,
    newValue: value ?? null,
    note: context.note,
  });
  return { ...record, [field]: value, audit: [...record.audit, auditRecord] };
}

function workflowState(action: string): ReviewState | undefined {
  const states: Record<string, ReviewState> = {
    open: 'in-review',
    accept: 'approved',
    ready: 'approved',
    approve: 'approved',
    return: 'returned',
    returned: 'returned',
    reject: 'rejected',
  };
  return states[action];
}

function trace(option: EditorialOption, submission: Submission): void {
  const passages = new Map(submission.passages.map((passage) => [passage.id, passage]));
  const claims: Array<readonly [string, SourcedText]> = [
    ['title', option.title],
    ['rationale', option.rationale],
    ['displayText', option.draftDisplayText],
    ['voiceoverText', option.draftVoiceoverText],
    ...option.mediaRecommendations.map((item, index): readonly [string, SourcedText] => [
      `mediaRecommendation[${index}]`,
      item,
    ]),
  ];
  for (const [field, claim] of claims) {
    console.log(`- ${field}: ${claim.text}`);
    for (const source of claim.sourceLinks) {
      const passage = passages.get(source.passageId);
      console.log(
        `  source: ${source.submissionId}:${source.passageId} (${passage?.field ?? 'missing'}) ${passage?.text ?? '[missing passage]'}`,
      );
    }
  }
  for (const attachment of submission.attachments) {
    console.log(
      `- attachment: ${attachment.id} (${attachment.localPath}) origin=${attachment.originUrl}`,
    );
  }
}

export async function runReviewCommand(args: string[]): Promise<void> {
  const projectId = requireValue(args, '--project');
  const action = requireValue(args, '--action');
  const actor = requireValue(args, '--actor');
  const store = new EditorialStore(valueAfter(args, '--store') ?? 'editorial');
  let record = await store.read(projectId);
  const selection = selectedOption(record, args);
  let option = selection.option;

  if (action === 'trace') {
    trace(option, await store.readSubmission(projectId));
    return;
  }

  const to = workflowState(action);
  if (to) {
    option = transitionEditorialOption(option, to, {
      actor,
      role: 'human-editor',
      note: valueAfter(args, '--note'),
    });
  } else if (['rename', 'rewrite-display', 'rewrite-voiceover'].includes(action)) {
    const field =
      action === 'rename'
        ? 'title'
        : action === 'rewrite-display'
          ? 'draftDisplayText'
          : 'draftVoiceoverText';
    option = editEditorialOption(option, field, {
      actor,
      text: requireValue(args, '--text'),
      sourceLinks: parseSourceLinks(args, option[field].sourceLinks),
      note: valueAfter(args, '--note'),
    });
  } else if (action === 'reorder') {
    const target = Number(requireValue(args, '--to')) as EditorialOption['position'];
    const collision = record.options.findIndex(
      (candidate, index) => index !== selection.index && candidate.position === target,
    );
    if (collision !== -1) {
      record = withOption(
        record,
        collision,
        replaceEditorialField(record.options[collision]!, 'position', option.position, {
          actor,
          note: 'Position swap',
        }),
      );
    }
    option = replaceEditorialField(option, 'position', target, { actor, note: 'Position reorder' });
  } else if (action === 'remove-claim') {
    const field = requireValue(args, '--field');
    if (field === 'media-recommendation') {
      const index = Number(requireValue(args, '--index'));
      if (!Number.isInteger(index) || !option.mediaRecommendations[index]) {
        throw new Error(`No media recommendation exists at index ${String(index)}.`);
      }
      option = replaceEditorialField(
        option,
        'mediaRecommendations',
        option.mediaRecommendations.filter((_, currentIndex) => currentIndex !== index),
        { actor, note: 'Removed unsupported media recommendation' },
      );
    } else {
      const fields = {
        title: 'title',
        rationale: 'rationale',
        display: 'draftDisplayText',
        voiceover: 'draftVoiceoverText',
      } as const;
      const editableField = fields[field as keyof typeof fields];
      if (!editableField) {
        throw new Error(
          'remove-claim --field must be title, rationale, display, voiceover, or media-recommendation.',
        );
      }
      option = editEditorialOption(option, editableField, {
        actor,
        text: requireValue(args, '--text'),
        sourceLinks: parseSourceLinks(args, option[editableField].sourceLinks),
        note: 'Removed unsupported claim; retained supported wording only',
      });
    }
  } else if (action === 'set-format') {
    const format = requireValue(args, '--format');
    if (!KNOWN_FORMAT_IDS.includes(format as (typeof KNOWN_FORMAT_IDS)[number])) {
      throw new Error(`Unsupported content format "${format}".`);
    }
    option = replaceEditorialField(
      option,
      'formatRecommendation',
      format as EditorialOption['formatRecommendation'],
      { actor },
    );
  } else if (action === 'set-media-recommendation') {
    const text = requireValue(args, '--text');
    option = replaceEditorialField(
      option,
      'mediaRecommendations',
      [{ text, sourceLinks: parseSourceLinks(args, option.sourceLinks) }],
      { actor },
    );
  } else if (action === 'select-media') {
    record = editProjectField(
      record,
      'selectedMedia',
      args.flatMap((argument, index) =>
        argument === '--media' && args[index + 1] ? [args[index + 1]!] : [],
      ),
      { actor },
    );
  } else if (action === 'set-framing' || action === 'edit-metrics') {
    const raw = JSON.parse(requireValue(args, '--json')) as unknown;
    if (action === 'set-framing') {
      record = editProjectField(record, 'geographicFraming', raw, { actor });
    } else {
      record = editProjectField(record, 'metrics', z.array(metricClaimSchema).parse(raw), {
        actor,
      });
    }
  } else {
    throw new Error(`Unknown review action "${action}".`);
  }

  await store.write(withOption(record, selection.index, option));
  console.log(
    `[content-pipeline] ${action} applied to "${projectId}" position ${String(option.position)}`,
  );
}
