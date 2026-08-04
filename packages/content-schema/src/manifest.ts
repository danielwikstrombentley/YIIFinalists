import { z } from 'zod';
import { semverSchema } from './shared.js';

// manifest.json — contracts/content-package.md package layout. `schemaVersion` governs breaking
// changes (Compatibility section): the runtime supports exactly one schemaVersion per app build.

export const CONTENT_PACKAGE_SCHEMA_VERSION = 1;

export const manifestSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    version: semverSchema,
    contentHash: z.string().min(1),
    createdAt: z.iso.datetime({ offset: true }),
    approvedBy: z.string().min(1),
    frozen: z.boolean(),
  })
  .strict();

export type Manifest = z.infer<typeof manifestSchema>;
