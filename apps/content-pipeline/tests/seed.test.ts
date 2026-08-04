import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  categorySchema,
  channelsFileSchema,
  manifestSchema,
  projectSchema,
} from '@yii/content-schema';
import {
  SAMPLE_CATEGORY_COUNT,
  SAMPLE_PROJECTS_PER_CATEGORY,
  SAMPLE_RELEASE_VERSION,
  generateSampleRelease,
} from '../src/seed/sample.ts';

// T018 Tests: seeded release passes T007's valid-fixture schema checks; loader (T017) loads it
// (exercised via schema re-validation of every generated file, matching exactly what
// apps/experience's ContentLoader does at runtime).

describe('generateSampleRelease', () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'yii-sample-release-'));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it('produces 2 categories x 3 projects per quickstart.md Setup', async () => {
    const result = await generateSampleRelease({ outputDir });
    expect(result.categories).toHaveLength(SAMPLE_CATEGORY_COUNT);
    expect(result.projects).toHaveLength(SAMPLE_CATEGORY_COUNT * SAMPLE_PROJECTS_PER_CATEGORY);
    expect(result.version).toBe(SAMPLE_RELEASE_VERSION);
  });

  it('writes a channels.json pointing staging at the generated release', async () => {
    await generateSampleRelease({ outputDir });
    const raw = JSON.parse(await readFile(join(outputDir, 'channels.json'), 'utf8'));
    const result = channelsFileSchema.safeParse(raw);
    expect(result.success).toBe(true);
    expect(result.success && result.data.staging).toBe(SAMPLE_RELEASE_VERSION);
  });

  it('writes a schema-valid manifest.json', async () => {
    await generateSampleRelease({ outputDir });
    const raw = JSON.parse(
      await readFile(join(outputDir, 'releases', SAMPLE_RELEASE_VERSION, 'manifest.json'), 'utf8'),
    );
    expect(manifestSchema.safeParse(raw).success).toBe(true);
  });

  it('writes a schema-valid categories.json with exactly 2 categories x 3 project refs', async () => {
    await generateSampleRelease({ outputDir });
    const raw = JSON.parse(
      await readFile(join(outputDir, 'releases', SAMPLE_RELEASE_VERSION, 'categories.json'), 'utf8'),
    );
    // categoriesFileSchema requires exactly 12 (production shape, QR-005) — the sample
    // intentionally has only 2 (quickstart.md), so re-validate each category individually.
    expect(Array.isArray(raw)).toBe(true);
    expect(raw).toHaveLength(SAMPLE_CATEGORY_COUNT);
    for (const category of raw as unknown[]) {
      expect(categorySchema.safeParse(category).success).toBe(true);
    }
    for (const category of raw as unknown[]) {
      expect((category as { projectIds: unknown[] }).projectIds).toHaveLength(SAMPLE_PROJECTS_PER_CATEGORY);
    }
  });

  it('writes a schema-valid project.json for every generated project, with placeholder media/voiceover files present', async () => {
    const result = await generateSampleRelease({ outputDir });
    for (const project of result.projects) {
      const raw = JSON.parse(
        await readFile(
          join(outputDir, 'releases', SAMPLE_RELEASE_VERSION, 'projects', project.id, 'project.json'),
          'utf8',
        ),
      );
      const parsed = projectSchema.safeParse(raw);
      expect(parsed.success, `project "${project.id}" should be schema-valid`).toBe(true);

      await expect(
        readFile(join(outputDir, 'releases', SAMPLE_RELEASE_VERSION, 'projects', project.id, 'media', 'hero.jpg')),
      ).resolves.toBeInstanceOf(Buffer);
      await expect(
        readFile(
          join(outputDir, 'releases', SAMPLE_RELEASE_VERSION, 'projects', project.id, 'voiceover', 'overview.opus'),
        ),
      ).resolves.toBeInstanceOf(Buffer);
    }
  });

  it('has no duplicate project ids across categories (FR-036)', async () => {
    const result = await generateSampleRelease({ outputDir });
    const ids = result.projects.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
