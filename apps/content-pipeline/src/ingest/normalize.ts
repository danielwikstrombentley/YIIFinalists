import { submissionSchema, type SourceAttachment, type Submission } from '@yii/content-schema';
import { createStablePassages, type PassageField } from './passages.ts';

export interface NormalizedSubmissionInput {
  id: string;
  clickupTaskId?: string;
  rawFields: Record<string, unknown>;
  passageFields: PassageField[];
  attachments: SourceAttachment[];
}

export interface NormalizeSubmissionOptions {
  existing?: Submission;
  clock?: () => Date;
}

export function toSlug(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug) throw new Error(`Cannot derive a submission id from "${value}".`);
  return slug;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function materialFingerprint(value: Omit<Submission, 'ingestedAt' | 'revision'>): string {
  return JSON.stringify(stableValue(value));
}

export function normalizeSubmission(
  input: NormalizedSubmissionInput,
  options: NormalizeSubmissionOptions = {},
): Submission {
  const previous = options.existing;
  const base = {
    id: toSlug(input.id),
    ...(input.clickupTaskId ? { clickupTaskId: input.clickupTaskId } : {}),
    rawFields: input.rawFields,
    passages: createStablePassages(input.passageFields, previous?.passages),
    attachments: input.attachments,
  };

  if (previous) {
    const previousBase = {
      id: previous.id,
      ...(previous.clickupTaskId ? { clickupTaskId: previous.clickupTaskId } : {}),
      rawFields: previous.rawFields,
      passages: previous.passages,
      attachments: previous.attachments,
    };
    if (materialFingerprint(base) === materialFingerprint(previousBase)) return previous;
  }

  return submissionSchema.parse({
    ...base,
    ingestedAt: (options.clock ?? (() => new Date()))().toISOString(),
    revision: previous ? previous.revision + 1 : 1,
  });
}
