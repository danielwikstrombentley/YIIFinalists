import { z } from 'zod';
import { contentOptionSchema } from './content-option.js';
import { geographicFramingSchema } from './framing.js';
import { slugSchema } from './shared.js';

// Project — data-model.md §1. Position 1 must always be the approved Project Overview (FR-005);
// "approved" is an editorial-workflow fact this schema cannot see in isolation (validator-level,
// T062) — the structural fact this schema DOES enforce is that position 1 is present at all.

export const markerSpecSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    emphasis: z.string().min(1).optional(),
  })
  .strict();

export type MarkerSpec = z.infer<typeof markerSpecSchema>;

export const projectSchema = z
  .object({
    id: slugSchema,
    name: z.string().min(1),
    organisation: z.string().min(1),
    country: z.string().min(1),
    location: z.string().min(1),
    categoryId: slugSchema,
    marker: markerSpecSchema,
    geographicFraming: geographicFramingSchema,
    contentOptions: z.array(contentOptionSchema).min(1).max(5),
    inactivePositions: z.array(z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])),
  })
  .strict()
  .superRefine((project, ctx) => {
    const positions = project.contentOptions.map((option) => option.position);
    if (!positions.includes(1)) {
      ctx.addIssue({
        code: 'custom',
        path: ['contentOptions'],
        message: 'position 1 (Project Overview) is required (FR-002/FR-036)',
      });
    }
    const seen = new Set<number>();
    positions.forEach((position, index) => {
      if (seen.has(position)) {
        ctx.addIssue({
          code: 'custom',
          path: ['contentOptions', index, 'position'],
          message: `duplicate content-option position ${position} within project "${project.id}"`,
        });
      }
      seen.add(position);
    });
  });

export type Project = z.infer<typeof projectSchema>;
