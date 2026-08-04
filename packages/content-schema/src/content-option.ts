import { z } from 'zod';
import { mediaAssetSchema } from './media.js';
import { richTextBlockSchema } from './shared.js';
import { contentSequenceSchema } from './sequence.js';
import { voiceoverAssetSchema } from './voiceover.js';

// ContentOption — data-model.md §1. Position is a fixed physical console mapping (FR-007); title
// is console-display only and MUST NOT appear on the LED as a menu (QR-006).

/**
 * Reusable content-format library ids (FR-014). The real library lands with T027 (PH3); this is
 * a deliberately small placeholder registry so PH2's schema can reject unsupported ids now
 * without hard-coding a format catalog that belongs to a later phase.
 */
export const KNOWN_FORMAT_IDS = [
  'overview-hero',
  'metric-reveal',
  'media-gallery',
  'map-context',
  'quote-panel',
] as const;
export type FormatId = (typeof KNOWN_FORMAT_IDS)[number];

export const CONTENT_OPTION_POSITIONS = [1, 2, 3, 4, 5] as const;
export type ContentOptionPosition = (typeof CONTENT_OPTION_POSITIONS)[number];

export const contentOptionSchema = z
  .object({
    position: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    title: z.string().min(1),
    formats: z.array(z.enum(KNOWN_FORMAT_IDS)).min(1),
    sequence: contentSequenceSchema,
    displayText: z.array(richTextBlockSchema).min(1),
    voiceover: voiceoverAssetSchema,
    mediaRefs: z.array(mediaAssetSchema),
    available: z.boolean(),
  })
  .strict()
  .superRefine((option, ctx) => {
    const ids = new Set(option.mediaRefs.map((asset) => asset.id));
    option.mediaRefs.forEach((asset, index) => {
      if (asset.fallback && asset.fallback !== asset.id && !ids.has(asset.fallback)) {
        ctx.addIssue({
          code: 'custom',
          path: ['mediaRefs', index, 'fallback'],
          message: `fallback "${asset.fallback}" does not resolve to another media asset in this option's mediaRefs (broken ref)`,
        });
      }
    });
  });

export type ContentOption = z.infer<typeof contentOptionSchema>;
