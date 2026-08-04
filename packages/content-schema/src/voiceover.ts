import { z } from 'zod';
import { packageRelativePathSchema, richTextBlockSchema } from './shared.js';

// VoiceoverAsset — data-model.md §1. Pre-generated at prep time only (research.md R11); the
// runtime only ever plays these local files.

export const voiceoverAssetSchema = z
  .object({
    file: packageRelativePathSchema,
    scriptVersion: z.string().min(1),
    voiceId: z.string().min(1),
    params: z.record(z.string(), z.unknown()).optional(),
    durationMs: z.number().positive(),
    captionText: z.array(richTextBlockSchema),
  })
  .strict();

export type VoiceoverAsset = z.infer<typeof voiceoverAssetSchema>;
