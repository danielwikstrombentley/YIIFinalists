import { z } from 'zod';
import { categorySchema } from './category.js';
import { manifestSchema } from './manifest.js';

// Release — data-model.md §1 + §4 Cross-Domain Invariants. Combines manifest.json fields with
// the full categories.json content (categories.json is the on-disk file; this is the assembled
// in-memory view the runtime loader produces after reading both).

export const releaseSchema = manifestSchema
  .extend({
    categories: z.array(categorySchema).length(12),
  })
  .superRefine((release, ctx) => {
    // Invariant 1 (data-model.md §4): 12 categories × 3 projects = 36, no duplicate project refs.
    const seenProjectIds = new Set<string>();
    release.categories.forEach((category, categoryIndex) => {
      category.projectIds.forEach((projectId, projectIndex) => {
        if (seenProjectIds.has(projectId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['categories', categoryIndex, 'projectIds', projectIndex],
            message: `duplicate project reference "${projectId}" across categories (FR-036)`,
          });
        } else {
          seenProjectIds.add(projectId);
        }
      });
    });
  });

export type Release = z.infer<typeof releaseSchema>;

/** Just the categories.json file content (the array of 12 categories, without manifest fields). */
export const categoriesFileSchema = z.array(categorySchema).length(12);
