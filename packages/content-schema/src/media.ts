import { z } from 'zod';
import { packageRelativePathSchema, rightsRecordSchema } from './shared.js';

// MediaAsset — data-model.md §1. Budgets (resolution/duration/codec ceilings) are enforced against
// research.md R14 by the pipeline validator (T062/T070); this schema enforces shape and the
// structural fallback requirement only.

export const MEDIA_KINDS = [
  'image',
  'video',
  'image-sequence',
  'diagram',
  'model3d',
  'motion',
] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Kinds whose fallback asset is mandatory (data-model.md: "required for video and model3d kinds"). */
const KINDS_REQUIRING_FALLBACK = new Set<MediaKind>(['video', 'model3d']);

export const mediaAssetSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(MEDIA_KINDS),
    file: packageRelativePathSchema,
    resolution: z.string().min(1).optional(),
    durationMs: z.number().nonnegative().optional(),
    codec: z.string().min(1).optional(),
    /** id of another MediaAsset in the same option's mediaRefs — resolved by contentOptionSchema. */
    fallback: z.string().min(1).optional(),
    rights: rightsRecordSchema,
    aiGenerated: z.boolean(),
  })
  .strict()
  .superRefine((asset, ctx) => {
    if (KINDS_REQUIRING_FALLBACK.has(asset.kind) && !asset.fallback) {
      ctx.addIssue({
        code: 'custom',
        path: ['fallback'],
        message: `media kind "${asset.kind}" requires a fallback asset ref (data-model.md MediaAsset)`,
      });
    }
  });

export type MediaAsset = z.infer<typeof mediaAssetSchema>;
