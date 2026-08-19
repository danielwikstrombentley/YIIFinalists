#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { categoriesFileSchema, releaseSchema } from '../src/release.js';
import { categorySchema } from '../src/category.js';
import { manifestSchema } from '../src/manifest.js';
import { projectSchema } from '../src/project.js';
import { channelsFileSchema } from '../src/channels.js';
import {
  editorialOptionSchema,
  draftAnalysisSchema,
  proposedOptionsSchema,
  submissionSchema,
} from '../src/editorial.js';

// Exports JSON Schema for every top-level content-package + editorial schema so the copilot-agent
// drafting driver (research.md R9) and other non-TypeScript consumers can validate against the
// same contract without depending on this package's Zod internals.

const SCHEMAS: Record<string, z.core.$ZodType> = {
  manifest: manifestSchema,
  category: categorySchema,
  'categories-file': categoriesFileSchema,
  project: projectSchema,
  release: releaseSchema,
  'channels-file': channelsFileSchema,
  submission: submissionSchema,
  'draft-analysis': draftAnalysisSchema,
  'proposed-options': proposedOptionsSchema,
  'editorial-option': editorialOptionSchema,
};

async function main(): Promise<void> {
  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'json-schema');
  await mkdir(outDir, { recursive: true });

  for (const [name, schema] of Object.entries(SCHEMAS)) {
    const jsonSchema = z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' });
    await writeFile(
      join(outDir, `${name}.schema.json`),
      `${JSON.stringify(jsonSchema, null, 2)}\n`,
      'utf8',
    );
  }

  console.log(`Exported ${Object.keys(SCHEMAS).length} JSON Schema files to ${outDir}`);
}

void main();
