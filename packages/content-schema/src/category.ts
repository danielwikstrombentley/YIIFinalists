import { z } from 'zod';
import { slugSchema } from './shared.js';

// Category — data-model.md §1. `projectIds[0]` is the first-preview project for the category
// (FR-005).

export const categorySchema = z
  .object({
    id: slugSchema,
    name: z.string().min(1),
    order: z.number().int().min(1).max(12),
    projectIds: z.array(slugSchema).length(3),
  })
  .strict();

export type Category = z.infer<typeof categorySchema>;
