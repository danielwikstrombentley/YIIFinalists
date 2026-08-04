import { z } from 'zod';

// ContentSequence / Beat — data-model.md §1. `timebase` is the authoritative clock (research.md
// R1): voiceover audio when narration is present, otherwise the GSAP timeline clock.

/** A single named visual composition — the replay/final-frame target (QR-002, FR-012). */
export const compositionElementSchema = z
  .object({
    target: z.string().min(1),
    properties: z.record(z.string(), z.unknown()),
  })
  .strict();

export const compositionSpecSchema = z
  .object({
    id: z.string().min(1),
    elements: z.array(compositionElementSchema).min(1),
  })
  .strict();

export type CompositionSpec = z.infer<typeof compositionSpecSchema>;

/**
 * Beat `type` is intentionally an open string (data-model.md lists "text, media, camera, metric,
 * reveal…" — the "…" marks a non-exhaustive, format-library-owned set). `KNOWN_BEAT_KINDS` is
 * documentation of the current baseline, not an enforced enum.
 */
export const KNOWN_BEAT_KINDS = ['text', 'media', 'camera', 'metric', 'reveal'] as const;

export const beatSchema = z
  .object({
    type: z.string().min(1),
    startTime: z.number().nonnegative(),
    duration: z.number().positive(),
    target: z.string().min(1).optional(),
    params: z.record(z.string(), z.unknown()).optional(),
    easing: z.string().min(1).optional(),
  })
  .strict();

export type Beat = z.infer<typeof beatSchema>;

export const SEQUENCE_TIMEBASES = ['voiceover', 'timeline'] as const;
export type SequenceTimebase = (typeof SEQUENCE_TIMEBASES)[number];

export const contentSequenceSchema = z
  .object({
    openingState: compositionSpecSchema,
    timebase: z.enum(SEQUENCE_TIMEBASES),
    syncToleranceMs: z.number().nonnegative(),
    beats: z.array(beatSchema),
    finalFrame: compositionSpecSchema,
    /**
     * Cleanup profile applied on cancel. Intentionally an open string — the concrete profile
     * catalog is owned by the SequenceOrchestrator (T016), not the content schema.
     */
    interruptionExit: z.string().min(1),
  })
  .strict()
  .superRefine((sequence, ctx) => {
    sequence.beats.forEach((beat, index) => {
      if (index > 0) {
        const previous = sequence.beats[index - 1]!;
        if (beat.startTime < previous.startTime) {
          ctx.addIssue({
            code: 'custom',
            path: ['beats', index, 'startTime'],
            message: 'beats must be ordered by non-decreasing startTime (data-model.md ContentSequence)',
          });
        }
      }
    });
  });

export type ContentSequence = z.infer<typeof contentSequenceSchema>;
