import { z } from 'zod';

// Small primitives shared across the published-content and editorial domains
// (data-model.md §1-2). Kept in one place so every schema uses the same rules.

/** Lowercase kebab-case identifier used for category/project/asset ids. */
export const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be a lowercase kebab-case slug');

/** Semantic version string, e.g. `1.2.3` or `1.2.3-rc.1`. */
export const semverSchema = z
  .string()
  .regex(
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
    'must be a semantic version',
  );

/**
 * Package-relative asset path. Consumer obligation (contracts/content-package.md): "resolve all
 * assets package-relative (no arbitrary URLs)" — rejected here at the schema layer, independent
 * of the on-disk existence check the runtime loader performs (T017).
 */
export const packageRelativePathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !value.startsWith('\\') &&
      !value.includes('..') &&
      !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value),
    'must be a package-relative path (no absolute paths, protocol URLs, or parent traversal)',
  );

/** Generic rich-text block used by both display text (FR-025) and voiceover caption text. */
export const richTextBlockSchema = z
  .object({
    type: z.string().min(1),
    text: z.string(),
  })
  .catchall(z.unknown());

export type RichTextBlock = z.infer<typeof richTextBlockSchema>;

/** A stable anchor into a submission's source text — the unit of claim traceability (FR-032/034). */
export const passageRefSchema = z
  .object({
    submissionId: slugSchema,
    passageId: z.string().min(1),
  })
  .strict();

export type PassageRef = z.infer<typeof passageRefSchema>;

/** Rights review record required on every media asset (FR-034/FR-036). */
export const rightsRecordSchema = z
  .object({
    holder: z.string().min(1),
    status: z.enum(['pending', 'approved', 'rejected']),
    approvedBy: z.string().min(1).optional(),
    approvedAt: z.iso.datetime({ offset: true }).optional(),
    notes: z.string().optional(),
  })
  .strict();

export type RightsRecord = z.infer<typeof rightsRecordSchema>;

/** Producer obligation "rights approved" — a business-state check layered on the base schema. */
export function isRightsApproved(rights: RightsRecord): boolean {
  return rights.status === 'approved';
}

/** A quantitative claim that must be source-linked and verified before publish (SC-012). */
export const metricClaimSchema = z
  .object({
    label: z.string().min(1),
    value: z.string().min(1),
    verified: z.boolean(),
    sourceLinks: z.array(passageRefSchema).min(1),
  })
  .strict();

export type MetricClaim = z.infer<typeof metricClaimSchema>;

/** Producer obligation "metrics verified (unverified ⇒ block)". */
export function hasUnverifiedMetrics(claims: readonly MetricClaim[]): boolean {
  return claims.some((claim) => !claim.verified);
}
