import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  categoriesFileSchema,
  channelsFileSchema,
  manifestSchema,
  projectSchema,
} from '@yii/content-schema';
import {
  SAMPLE_CATEGORY_COUNT,
  SAMPLE_PROJECTS_PER_CATEGORY,
  SAMPLE_RELEASE_VERSION,
  generateSampleRelease,
  parseSampleTileTier,
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

  it('produces 12 categories x 3 projects (the production categoriesFileSchema shape, FR-001)', async () => {
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

  it('writes a categories.json that satisfies the real production categoriesFileSchema', async () => {
    await generateSampleRelease({ outputDir });
    const raw = JSON.parse(
      await readFile(
        join(outputDir, 'releases', SAMPLE_RELEASE_VERSION, 'categories.json'),
        'utf8',
      ),
    );
    // This is the identical shared-package schema apps/experience's ContentLoader validates
    // incoming categories.json against — passing here is the guarantee that the seed is actually
    // loadable by the real runtime (PH2 review round 1 finding #1: a 2-category sample failed
    // this schema, which requires exactly 12, and the quickstart never reached idle).
    expect(categoriesFileSchema.safeParse(raw).success).toBe(true);
    expect(raw).toHaveLength(SAMPLE_CATEGORY_COUNT);
    for (const category of raw as unknown[]) {
      expect((category as { projectIds: unknown[] }).projectIds).toHaveLength(
        SAMPLE_PROJECTS_PER_CATEGORY,
      );
    }
  });

  it('writes a schema-valid project.json for every generated project, with placeholder media/voiceover files present', async () => {
    const result = await generateSampleRelease({ outputDir });
    for (const project of result.projects) {
      const raw = JSON.parse(
        await readFile(
          join(
            outputDir,
            'releases',
            SAMPLE_RELEASE_VERSION,
            'projects',
            project.id,
            'project.json',
          ),
          'utf8',
        ),
      );
      const parsed = projectSchema.safeParse(raw);
      expect(parsed.success, `project "${project.id}" should be schema-valid`).toBe(true);
      expect((raw as { contentOptions: unknown[] }).contentOptions).toHaveLength(2);
      expect((raw as { inactivePositions: unknown[] }).inactivePositions).toEqual([3, 4, 5]);

      await expect(
        readFile(
          join(
            outputDir,
            'releases',
            SAMPLE_RELEASE_VERSION,
            'projects',
            project.id,
            'media',
            'hero.jpg',
          ),
        ),
      ).resolves.toBeInstanceOf(Buffer);
      await expect(
        readFile(
          join(
            outputDir,
            'releases',
            SAMPLE_RELEASE_VERSION,
            'projects',
            project.id,
            'media',
            'impact.jpg',
          ),
        ),
      ).resolves.toBeInstanceOf(Buffer);
      await expect(
        readFile(
          join(
            outputDir,
            'releases',
            SAMPLE_RELEASE_VERSION,
            'projects',
            project.id,
            'voiceover',
            'overview.opus',
          ),
        ),
      ).resolves.toBeInstanceOf(Buffer);
      await expect(
        readFile(
          join(
            outputDir,
            'releases',
            SAMPLE_RELEASE_VERSION,
            'projects',
            project.id,
            'voiceover',
            'impact.opus',
          ),
        ),
      ).resolves.toBeInstanceOf(Buffer);
    }
  });

  it('has no duplicate project ids across categories (FR-036)', async () => {
    const result = await generateSampleRelease({ outputDir });
    const ids = result.projects.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses photorealistic tiles for every sample project only when the caller explicitly opts in', async () => {
    const result = await generateSampleRelease({
      outputDir,
      tileTier: parseSampleTileTier('photorealistic'),
    });

    expect(result.projects).toHaveLength(SAMPLE_CATEGORY_COUNT * SAMPLE_PROJECTS_PER_CATEGORY);
    expect(
      result.projects.every((project) => project.geographicFraming.tileTier === 'photorealistic'),
    ).toBe(true);
  });

  it('defaults to the offline-safe profile and rejects unsupported tile-tier configuration', () => {
    expect(parseSampleTileTier(undefined)).toBe('safe-composition');
    expect(() => parseSampleTileTier('not-a-tier')).toThrow(/tile tier/i);
  });
});
