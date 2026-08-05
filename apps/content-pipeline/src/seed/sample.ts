import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Category, ChannelsFile, Manifest, Project } from '@yii/content-schema';
import {
  categoriesFileSchema,
  channelsFileSchema,
  manifestSchema,
  projectSchema,
} from '@yii/content-schema';

// Sample release seed generator (T018): produces a schema-valid release (12 categories x 3
// projects — the exact shape `categoriesFileSchema`/`releaseSchema` require, matching FR-001)
// for local dev servers and every runtime test suite. Output is generated on demand
// (`pnpm --filter content-pipeline seed:sample`), not committed — see .gitignore.

export const SAMPLE_CATEGORY_COUNT = 12;
export const SAMPLE_PROJECTS_PER_CATEGORY = 3;
export const SAMPLE_RELEASE_VERSION = '0.1.0-sample';

const SAMPLE_CATEGORY_NAMES = [
  'Climate Resilience',
  'Digital Inclusion',
  'Health Equity',
  'Education Access',
  'Water Security',
  'Renewable Energy',
  'Circular Economy',
  'Urban Mobility',
  'Biodiversity Conservation',
  'Food Security',
  'Disaster Resilience',
  'Gender Equality',
];

/** Deterministic placeholder coordinates, kept within lat ∈ [-90,90] / lon ∈ [-180,180] for all
 * 12 categories × 3 projects (the naive `-10 + categoryIndex * 20` formula this replaced went
 * out of range past 6 categories). */
function sampleLat(categoryIndex: number): number {
  return -55 + categoryIndex * 10;
}

function sampleLon(categoryIndex: number, projectIndex: number): number {
  return -170 + categoryIndex * 25 + projectIndex * 8;
}

function buildSampleProject(categoryIndex: number, projectIndex: number): Project {
  const categoryId = `cat-${categoryIndex + 1}`;
  const id = `${categoryId}-proj-${projectIndex + 1}`;
  return {
    id,
    name: `Sample Project ${categoryIndex + 1}.${projectIndex + 1}`,
    organisation: 'Sample Organisation',
    country: 'Sampleland',
    location: 'Sample City',
    categoryId,
    marker: { lat: sampleLat(categoryIndex), lon: sampleLon(categoryIndex, projectIndex) },
    geographicFraming: {
      scopeType: 'city',
      landingCamera: {
        destination: {
          lat: sampleLat(categoryIndex),
          lon: sampleLon(categoryIndex, projectIndex),
          height: 400,
        },
        orientation: { heading: 0, pitch: -30, roll: 0 },
        range: 800,
      },
      previewEmphasis: { markerScale: 1.2 },
      tileTier: 'safe-composition',
      canvasTreatment: { darken: 0.15 },
    },
    contentOptions: [
      {
        position: 1,
        title: 'Overview',
        formats: ['overview-hero'],
        sequence: {
          openingState: { id: 'opening', elements: [{ target: 'hero', properties: { level: 0 } }] },
          timebase: 'timeline',
          syncToleranceMs: 200,
          beats: [{ type: 'text', startTime: 0, duration: 4000, target: 'hero' }],
          finalFrame: { id: 'final', elements: [{ target: 'hero', properties: { level: 1 } }] },
          interruptionExit: 'fade-out',
        },
        displayText: [{ type: 'paragraph', text: `Overview of ${id} (sample placeholder text).` }],
        voiceover: {
          file: `projects/${id}/voiceover/overview.opus`,
          scriptVersion: 'sample-v1',
          voiceId: 'sample-voice',
          durationMs: 4000,
          captionText: [{ type: 'paragraph', text: 'Sample caption text.' }],
        },
        mediaRefs: [
          {
            id: 'hero-image',
            kind: 'image',
            file: `projects/${id}/media/hero.jpg`,
            rights: { holder: 'Sample Organisation', status: 'approved' },
            aiGenerated: false,
          },
        ],
        available: true,
      },
    ],
    inactivePositions: [2, 3, 4, 5],
  };
}

function buildSampleCategories(): Category[] {
  const categories: Category[] = [];
  for (let c = 0; c < SAMPLE_CATEGORY_COUNT; c += 1) {
    const projectIds = Array.from(
      { length: SAMPLE_PROJECTS_PER_CATEGORY },
      (_, p) => `cat-${c + 1}-proj-${p + 1}`,
    );
    categories.push({
      id: `cat-${c + 1}`,
      name: SAMPLE_CATEGORY_NAMES[c] ?? `Sample Category ${c + 1}`,
      order: c + 1,
      projectIds,
    });
  }
  return categories;
}

function buildSampleManifest(): Manifest {
  return {
    schemaVersion: 1,
    version: SAMPLE_RELEASE_VERSION,
    contentHash: 'sha256-sample-placeholder',
    createdAt: new Date().toISOString(),
    approvedBy: 'seed:sample (dev fixture, not a real approval)',
    frozen: false,
  };
}

function buildSampleChannels(): ChannelsFile {
  return {
    staging: SAMPLE_RELEASE_VERSION,
    production: null,
    frozen: false,
    history: [
      {
        type: 'publish',
        channel: 'staging',
        version: SAMPLE_RELEASE_VERSION,
        at: new Date().toISOString(),
        actor: 'seed:sample',
        notes: 'Generated dev/test fixture release.',
      },
    ],
  };
}

export interface GenerateSampleReleaseOptions {
  outputDir?: string;
}

export interface GenerateSampleReleaseResult {
  outputDir: string;
  version: string;
  categories: Category[];
  projects: Project[];
}

function defaultOutputDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'assets', 'sample');
}

export async function generateSampleRelease(
  options: GenerateSampleReleaseOptions = {},
): Promise<GenerateSampleReleaseResult> {
  const outputDir = options.outputDir ?? defaultOutputDir();
  const releaseDir = join(outputDir, 'releases', SAMPLE_RELEASE_VERSION);

  const manifest = manifestSchema.parse(buildSampleManifest());
  // Validated against the real production `categoriesFileSchema` (exact-12 invariant, QR-005) —
  // this is the identical schema apps/experience's ContentLoader.revalidateCategories() checks,
  // so passing here guarantees the generated sample actually loads at runtime.
  const categories = categoriesFileSchema.parse(buildSampleCategories());
  const channels = channelsFileSchema.parse(buildSampleChannels());

  const projects: Project[] = [];
  for (let c = 0; c < SAMPLE_CATEGORY_COUNT; c += 1) {
    for (let p = 0; p < SAMPLE_PROJECTS_PER_CATEGORY; p += 1) {
      projects.push(projectSchema.parse(buildSampleProject(c, p)));
    }
  }

  await mkdir(releaseDir, { recursive: true });
  await writeJson(join(outputDir, 'channels.json'), channels);
  await writeJson(join(releaseDir, 'manifest.json'), manifest);
  await writeJson(join(releaseDir, 'categories.json'), categories);
  await writeJson(join(releaseDir, 'validation-report.json'), {
    generatedBy: 'seed:sample',
    generatedAt: new Date().toISOString(),
    valid: true,
    checks: projects.length,
  });

  for (const project of projects) {
    const projectDir = join(releaseDir, 'projects', project.id);
    await mkdir(join(projectDir, 'media'), { recursive: true });
    await mkdir(join(projectDir, 'voiceover'), { recursive: true });
    await writeJson(join(projectDir, 'project.json'), project);
    await writeFile(join(projectDir, 'media', 'hero.jpg'), PLACEHOLDER_IMAGE_BYTES);
    await writeFile(join(projectDir, 'voiceover', 'overview.opus'), PLACEHOLDER_AUDIO_BYTES);
  }

  return { outputDir, version: SAMPLE_RELEASE_VERSION, categories, projects };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

// Minimal placeholder bytes — not real media. No renderer/media adapter decodes these in PH2;
// they exist only so package-relative file references resolve to something on disk.
const PLACEHOLDER_IMAGE_BYTES = Buffer.from('placeholder-image');
const PLACEHOLDER_AUDIO_BYTES = Buffer.from('placeholder-audio');
