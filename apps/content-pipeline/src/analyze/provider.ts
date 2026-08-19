import type {
  DraftAnalysisContent,
  ProducedBy,
  ProposedOptionContent,
  Submission,
  TextRevisionContent,
} from '@yii/content-schema';

export interface Draft<T> {
  data: T;
  producedBy: ProducedBy;
  model?: string;
  promptVersion: string;
  createdAt: string;
  status: 'draft';
}

export interface SubmissionBundle {
  submission: Submission;
}

export interface RewriteRequest extends SubmissionBundle {
  field: 'displayText' | 'voiceoverText';
  text: string;
  instruction: string;
}

export interface DraftingProvider {
  analyzeSubmission(input: SubmissionBundle): Promise<Draft<DraftAnalysisContent>>;
  proposeOptions(
    input: SubmissionBundle & { analysis: DraftAnalysisContent },
  ): Promise<Draft<ProposedOptionContent[]>>;
  assistRewrite(input: RewriteRequest): Promise<Draft<TextRevisionContent>>;
}

export class DraftValidationError extends Error {
  readonly details: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'DraftValidationError';
    this.details = details;
  }
}

interface PassageReference {
  submissionId: string;
  passageId: string;
}

function collectPassageReferences(value: unknown, references: PassageReference[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectPassageReferences(item, references);
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'sourceLinks' && Array.isArray(child)) {
      for (const item of child) {
        if (
          item &&
          typeof item === 'object' &&
          typeof (item as PassageReference).submissionId === 'string' &&
          typeof (item as PassageReference).passageId === 'string'
        ) {
          references.push(item as PassageReference);
        }
      }
    } else {
      collectPassageReferences(child, references);
    }
  }
}

export function assertSubmissionReferences(value: unknown, submission: Submission): void {
  const availablePassages = new Set(submission.passages.map((passage) => passage.id));
  const references: PassageReference[] = [];
  collectPassageReferences(value, references);

  const invalid = references.filter(
    (reference) =>
      reference.submissionId !== submission.id || !availablePassages.has(reference.passageId),
  );
  if (invalid.length > 0) {
    throw new DraftValidationError('Draft contains references outside the source submission.', {
      invalidReferences: invalid,
    });
  }
}
