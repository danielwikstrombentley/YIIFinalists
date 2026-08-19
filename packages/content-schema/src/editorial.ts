import { z } from 'zod';
import { passageRefSchema, slugSchema } from './shared.js';
import { KNOWN_FORMAT_IDS } from './content-option.js';

// Editorial / Pipeline Domain — data-model.md §2. Prep-time only; never read by the public
// runtime. Traceability root is Submission; every downstream claim carries PassageRef links
// back to it (FR-032/FR-034/SC-012).

export const sourcePassageSchema = z
  .object({
    id: z.string().min(1),
    field: z.string().min(1),
    text: z.string(),
  })
  .strict();
export type SourcePassage = z.infer<typeof sourcePassageSchema>;

export const sourceAttachmentSchema = z
  .object({
    id: z.string().min(1),
    originUrl: z.string().min(1),
    localPath: z.string().min(1),
  })
  .strict();
export type SourceAttachment = z.infer<typeof sourceAttachmentSchema>;

export const submissionSchema = z
  .object({
    id: slugSchema,
    clickupTaskId: z.string().min(1).optional(),
    rawFields: z.record(z.string(), z.unknown()),
    passages: z.array(sourcePassageSchema),
    attachments: z.array(sourceAttachmentSchema),
    ingestedAt: z.iso.datetime({ offset: true }),
    revision: z.number().int().nonnegative(),
  })
  .strict();
export type Submission = z.infer<typeof submissionSchema>;

/** A statement that must carry at least one source-passage link (FR-032). */
export const sourcedTextSchema = z
  .object({
    text: z.string().min(1),
    sourceLinks: z.array(passageRefSchema).min(1),
  })
  .strict();
export type SourcedText = z.infer<typeof sourcedTextSchema>;
export type Claim = SourcedText;
export const claimSchema = sourcedTextSchema;

const producedBySchema = z.union([
  z.literal('copilot-agent'),
  z
    .string()
    .regex(
      /^api-llm:[a-z0-9_-]+:[a-zA-Z0-9._-]+$/,
      'must be "api-llm:<provider>:<model>" or "copilot-agent"',
    ),
]);
export type ProducedBy = z.infer<typeof producedBySchema>;

const draftProvenanceSchema = z
  .object({
    producedBy: producedBySchema,
    promptVersion: z.string().min(1),
    createdAt: z.iso.datetime({ offset: true }),
    status: z.literal('draft'),
  })
  .strict();
export type DraftProvenance = z.infer<typeof draftProvenanceSchema>;

export const draftAnalysisContentSchema = z
  .object({
    submissionId: slugSchema,
    summary: sourcedTextSchema,
    purpose: sourcedTextSchema,
    geographicScope: sourcedTextSchema,
    challenges: z.array(sourcedTextSchema),
    approaches: z.array(sourcedTextSchema),
    outcomes: z.array(sourcedTextSchema),
    quantResults: z.array(
      z
        .object({
          label: z.string().min(1),
          value: z.string().min(1),
          verified: z.boolean(),
          sourceLinks: z.array(passageRefSchema).min(1),
        })
        .strict(),
    ),
    themes: z.array(sourcedTextSchema),
    needsVerification: z.array(claimSchema),
    missingInfo: z.array(z.string().min(1)),
  })
  .strict();
export type DraftAnalysisContent = z.infer<typeof draftAnalysisContentSchema>;

export const draftAnalysisSchema = draftAnalysisContentSchema.extend(draftProvenanceSchema.shape);
export type DraftAnalysis = z.infer<typeof draftAnalysisSchema>;

export const REVIEW_STATES = [
  'draft',
  'in-review',
  'returned',
  'approved',
  'published',
  'rejected',
] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

/** Legal reviewState transitions (data-model.md §2 "State transitions (editorial lifecycle)"). */
export const REVIEW_STATE_TRANSITIONS: Readonly<Record<ReviewState, readonly ReviewState[]>> = {
  draft: ['in-review'],
  'in-review': ['returned', 'approved', 'rejected'],
  returned: ['in-review'],
  approved: ['published'],
  published: [],
  rejected: [],
};

export function isLegalReviewStateTransition(from: ReviewState, to: ReviewState): boolean {
  return REVIEW_STATE_TRANSITIONS[from].includes(to);
}

export const changeRecordSchema = z
  .object({
    at: z.iso.datetime({ offset: true }),
    actor: z.string().min(1),
    field: z.string().min(1),
    previousValue: z.unknown(),
    newValue: z.unknown(),
    note: z.string().optional(),
  })
  .strict();
export type ChangeRecord = z.infer<typeof changeRecordSchema>;

const assetRequestSchema = z.object({ description: z.string().min(1) }).strict();

export const proposedOptionContentSchema = z
  .object({
    projectId: slugSchema,
    position: z
      .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
      .nullable(),
    title: sourcedTextSchema,
    rationale: sourcedTextSchema,
    draftDisplayText: sourcedTextSchema,
    draftVoiceoverText: sourcedTextSchema,
    formatRecommendation: z.enum(KNOWN_FORMAT_IDS).optional(),
    mediaRecommendations: z.array(sourcedTextSchema),
    missingAssets: z.array(assetRequestSchema),
  })
  .strict();
export type ProposedOptionContent = z.infer<typeof proposedOptionContentSchema>;

export const proposedOptionSchema = proposedOptionContentSchema.extend(draftProvenanceSchema.shape);
export type ProposedOption = z.infer<typeof proposedOptionSchema>;

/** Project Overview plus at most four additional options; meaningful drafts are never padded. */
export const proposedOptionsSchema = z.array(proposedOptionSchema).min(1).max(5);

export const draftAnalysisEnvelopeSchema = z
  .object({
    data: draftAnalysisContentSchema,
    producedBy: producedBySchema,
    model: z.string().min(1).optional(),
    promptVersion: z.string().min(1),
    createdAt: z.iso.datetime({ offset: true }),
    status: z.literal('draft'),
  })
  .strict();

export const proposedOptionsEnvelopeSchema = z
  .object({
    data: z.array(proposedOptionContentSchema).min(1).max(5),
    producedBy: producedBySchema,
    model: z.string().min(1).optional(),
    promptVersion: z.string().min(1),
    createdAt: z.iso.datetime({ offset: true }),
    status: z.literal('draft'),
  })
  .strict();

export const textRevisionContentSchema = z
  .object({
    field: z.enum(['displayText', 'voiceoverText']),
    text: sourcedTextSchema,
  })
  .strict();
export type TextRevisionContent = z.infer<typeof textRevisionContentSchema>;

export const textRevisionEnvelopeSchema = z
  .object({
    data: textRevisionContentSchema,
    producedBy: producedBySchema,
    model: z.string().min(1).optional(),
    promptVersion: z.string().min(1),
    createdAt: z.iso.datetime({ offset: true }),
    status: z.literal('draft'),
  })
  .strict();

/**
 * ProposedOption → EditorialOption — one schema covers the whole lifecycle; `reviewState`
 * distinguishes a freshly-proposed record (`draft`) from a reviewed/approved one. `producedBy` is
 * present only when AI-assisted (research.md R9); used by the Principle VII publish invariant.
 */
export const editorialOptionSchema = z
  .object({
    projectId: slugSchema,
    position: z
      .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
      .nullable(),
    title: sourcedTextSchema,
    rationale: sourcedTextSchema,
    sourceLinks: z.array(passageRefSchema).min(1),
    draftDisplayText: sourcedTextSchema,
    draftVoiceoverText: sourcedTextSchema,
    displayTextVersion: z.number().int().positive(),
    voiceoverTextVersion: z.number().int().positive(),
    formatRecommendation: z.enum(KNOWN_FORMAT_IDS).optional(),
    mediaRecommendations: z.array(sourcedTextSchema),
    missingAssets: z.array(assetRequestSchema),
    reviewState: z.enum(REVIEW_STATES),
    producedBy: producedBySchema.optional(),
    promptVersion: z.string().min(1).optional(),
    audit: z.array(changeRecordSchema),
  })
  .strict();
export type EditorialOption = z.infer<typeof editorialOptionSchema>;

/** Producer obligation: "every included item is approved". */
export function isApprovedForPublish(record: Pick<EditorialOption, 'reviewState'>): boolean {
  return record.reviewState === 'approved';
}

/**
 * Principle VII invariant (data-model.md §2): "no record with producedBy != null and reviewState
 * != approved can ever be referenced by a Release".
 */
export function violatesAiApprovalInvariant(
  record: Pick<EditorialOption, 'reviewState' | 'producedBy'>,
): boolean {
  return record.producedBy !== undefined && record.reviewState !== 'approved';
}
