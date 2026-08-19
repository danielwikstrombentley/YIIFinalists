import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  changeRecordSchema,
  editorialOptionSchema,
  metricClaimSchema,
  submissionSchema,
  violatesAiApprovalInvariant,
  type ChangeRecord,
  type EditorialOption,
  type MetricClaim,
  type Submission,
} from '@yii/content-schema';
import { z } from 'zod';

export interface EditorialProjectRecord {
  projectId: string;
  options: EditorialOption[];
  metrics: MetricClaim[];
  selectedMedia: string[];
  geographicFraming?: unknown;
  audit: ChangeRecord[];
}

const editorialProjectRecordSchema = z
  .object({
    projectId: z.string().min(1),
    options: z.array(editorialOptionSchema).max(5),
    metrics: z.array(metricClaimSchema),
    selectedMedia: z.array(z.string().min(1)),
    geographicFraming: z.unknown().optional(),
    audit: z.array(changeRecordSchema),
  })
  .strict();

export class EditorialStore {
  readonly #root: string;

  constructor(root = 'editorial') {
    this.#root = resolve(root);
  }

  pathFor(projectId: string): string {
    return resolve(this.#root, projectId, 'editorial.json');
  }

  async read(projectId: string): Promise<EditorialProjectRecord> {
    const raw = JSON.parse(await readFile(this.pathFor(projectId), 'utf8')) as unknown;
    return editorialProjectRecordSchema.parse(raw);
  }

  async readSubmission(projectId: string): Promise<Submission> {
    const raw = JSON.parse(
      await readFile(resolve(this.#root, projectId, 'submission.json'), 'utf8'),
    ) as unknown;
    return submissionSchema.parse(raw);
  }

  async write(record: EditorialProjectRecord): Promise<void> {
    const parsed = editorialProjectRecordSchema.parse(record);
    const file = this.pathFor(parsed.projectId);
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    await writeFile(temporary, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    await rename(temporary, file);
  }
}

export function assertReleaseEligible(options: readonly EditorialOption[]): void {
  const blocked = options.filter(
    (option) => option.reviewState !== 'approved' || violatesAiApprovalInvariant(option),
  );
  if (blocked.length > 0) {
    throw new Error(
      `Release references ${blocked.length} editorial option(s) that are not approved by a human.`,
    );
  }
}
