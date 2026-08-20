import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import type { Category, Manifest, Project } from '@yii/content-schema';
import { validateReleaseCandidate } from '../src/validate/run.ts';

const FIXED_NOW = '2026-08-19T10:00:00.000Z';
const RELEASE_VERSION = '1.2.3';

let candidateRoot: string;

beforeEach(async () => {
  candidateRoot = await mkdtemp(join(tmpdir(), 'yii-validation-candidate-'));
  await writeValidCandidate(candidateRoot);
});

afterEach(async () => {
  await rm(candidateRoot, { recursive: true, force: true });
});

function categories(): Category[] {
  return Array.from({ length: 12 }, (_, index) => ({
    id: `cat-${index + 1}`,
    name: `Category ${index + 1}`,
    order: index + 1,
    projectIds: [
      `cat-${index + 1}-project-1`,
      `cat-${index + 1}-project-2`,
      `cat-${index + 1}-project-3`,
    ],
  }));
}

function project(id: string, categoryId: string): Project {
  return {
    id,
    name: `Project ${id}`,
    organisation: 'Example Organisation',
    country: 'Example Country',
    location: 'Example Location',
    categoryId,
    marker: { lat: 1, lon: 2 },
    geographicFraming: {
      scopeType: 'city',
      landingCamera: {
        destination: { lat: 1, lon: 2, height: 100 },
        orientation: { heading: 0, pitch: -30, roll: 0 },
        range: 500,
      },
      previewEmphasis: {},
      tileTier: 'safe-composition',
      canvasTreatment: {},
    },
    contentOptions: [
      {
        position: 1,
        title: 'Overview',
        formats: ['overview-hero'],
        sequence: {
          openingState: { id: 'opening', elements: [{ target: 'hero', properties: {} }] },
          timebase: 'timeline',
          syncToleranceMs: 100,
          beats: [{ type: 'text', startTime: 0, duration: 1_000, target: 'hero' }],
          finalFrame: { id: 'final', elements: [{ target: 'hero', properties: {} }] },
          interruptionExit: 'fade-out',
        },
        displayText: [{ type: 'paragraph', text: 'Approved display copy.' }],
        voiceover: {
          file: `projects/${id}/voiceover/overview.opus`,
          scriptVersion: 'voiceover-v1',
          voiceId: 'voice-1',
          durationMs: 1_000,
          captionText: [{ type: 'paragraph', text: 'Approved caption.' }],
        },
        mediaRefs: [
          {
            id: 'hero-image',
            kind: 'image',
            file: `projects/${id}/media/hero.jpg`,
            resolution: '1920x1080',
            rights: {
              holder: 'Example Organisation',
              status: 'approved',
              approvedBy: 'editor@example.test',
              approvedAt: FIXED_NOW,
            },
            aiGenerated: false,
          },
        ],
        available: true,
      },
    ],
    inactivePositions: [2, 3, 4, 5],
  };
}

function manifest(): Manifest {
  return {
    schemaVersion: 1,
    version: RELEASE_VERSION,
    contentHash: 'sha256-pending-validation',
    createdAt: FIXED_NOW,
    approvedBy: 'editor@example.test',
    frozen: false,
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeValidCandidate(root: string): Promise<void> {
  const releaseRoot = join(root, 'releases', RELEASE_VERSION);
  const releaseCategories = categories();
  await writeJson(join(root, 'channels.json'), {
    staging: null,
    production: null,
    frozen: false,
    history: [],
  });
  await writeJson(join(releaseRoot, 'manifest.json'), manifest());
  await writeJson(join(releaseRoot, 'categories.json'), releaseCategories);

  for (const category of releaseCategories) {
    for (const projectId of category.projectIds) {
      const current = project(projectId, category.id);
      const projectRoot = join(releaseRoot, 'projects', projectId);
      await writeJson(join(projectRoot, 'project.json'), current);
      await mkdir(join(projectRoot, 'media'), { recursive: true });
      await mkdir(join(projectRoot, 'voiceover'), { recursive: true });
      await writeFile(join(projectRoot, 'media', 'hero.jpg'), 'image', 'utf8');
      await writeFile(join(projectRoot, 'voiceover', 'overview.opus'), 'audio', 'utf8');
      await writeJson(join(projectRoot, 'editorial.json'), {
        options: [{ position: 1, reviewState: 'approved', producedBy: 'copilot-agent' }],
        metrics: [{ label: 'People reached', value: '100', verified: true }],
      });
    }
  }
}

async function readProject(projectId = 'cat-1-project-1'): Promise<Project> {
  return JSON.parse(
    await readFile(
      join(candidateRoot, 'releases', RELEASE_VERSION, 'projects', projectId, 'project.json'),
      'utf8',
    ),
  ) as Project;
}

async function writeProject(value: unknown, projectId = 'cat-1-project-1'): Promise<void> {
  await writeJson(
    join(candidateRoot, 'releases', RELEASE_VERSION, 'projects', projectId, 'project.json'),
    value,
  );
}

async function expectRule(rule: string): Promise<void> {
  const report = await validateReleaseCandidate({ root: candidateRoot, version: RELEASE_VERSION });
  expect(report.valid).toBe(false);
  expect(report.issues.some((issue) => issue.rule === rule)).toBe(true);
}

describe('validateReleaseCandidate (T061 red-first contract)', () => {
  it('passes a valid approved candidate and emits validation-report.json', async () => {
    const report = await validateReleaseCandidate({ root: candidateRoot, version: RELEASE_VERSION });

    expect(report.valid).toBe(true);
    await expect(
      access(join(candidateRoot, 'releases', RELEASE_VERSION, 'validation-report.json')),
    ).resolves.toBeUndefined();
  });

  it.each([
    ['structure.category-count', async () => {
      await writeJson(join(candidateRoot, 'releases', RELEASE_VERSION, 'categories.json'), categories().slice(0, 11));
    }],
    ['overview.position-one', async () => {
      const value = await readProject();
      value.contentOptions[0]!.position = 2;
      await writeProject(value);
    }],
    ['option.maximum-count', async () => {
      const value = await readProject();
      value.contentOptions = Array.from({ length: 6 }, (_, index) => ({
        ...value.contentOptions[0]!,
        position: (index % 5) + 1 as 1 | 2 | 3 | 4 | 5,
      }));
      await writeProject(value);
    }],
    ['project.required-metadata', async () => {
      const value = await readProject() as unknown as Record<string, unknown>;
      delete value.organisation;
      await writeProject(value);
    }],
    ['project.geographic-framing', async () => {
      const value = await readProject() as unknown as Record<string, unknown>;
      delete value.geographicFraming;
      await writeProject(value);
    }],
    ['media.asset-reference', async () => {
      const value = await readProject();
      value.contentOptions[0]!.mediaRefs[0]!.file = 'projects/cat-1-project-1/media/missing.jpg';
      await writeProject(value);
    }],
    ['voiceover.asset-reference', async () => {
      const value = await readProject();
      value.contentOptions[0]!.voiceover.file = 'projects/cat-1-project-1/voiceover/missing.opus';
      await writeProject(value);
    }],
    ['option.display-text', async () => {
      const value = await readProject();
      value.contentOptions[0]!.displayText = [];
      await writeProject(value);
    }],
    ['option.unsupported-format', async () => {
      const value = await readProject() as unknown as {
        contentOptions: Array<{ formats: string[] }>;
      };
      value.contentOptions[0]!.formats = ['unsupported-format'];
      await writeProject(value);
    }],
    ['sequence.required-fields', async () => {
      const value = await readProject() as unknown as {
        contentOptions: Array<{ sequence: Record<string, unknown> }>;
      };
      delete value.contentOptions[0]!.sequence.finalFrame;
      await writeProject(value);
    }],
    ['positions.unique-and-complete', async () => {
      const value = await readProject();
      value.inactivePositions = [2, 2, 3, 4, 5];
      await writeProject(value);
    }],
    ['editorial.approval', async () => {
      await writeJson(
        join(candidateRoot, 'releases', RELEASE_VERSION, 'projects', 'cat-1-project-1', 'editorial.json'),
        { options: [{ position: 1, reviewState: 'draft', producedBy: 'copilot-agent' }], metrics: [] },
      );
    }],
    ['metrics.verified', async () => {
      await writeJson(
        join(candidateRoot, 'releases', RELEASE_VERSION, 'projects', 'cat-1-project-1', 'editorial.json'),
        { options: [{ position: 1, reviewState: 'approved' }], metrics: [{ label: 'People reached', value: '100', verified: false }] },
      );
    }],
    ['media.rights-approved', async () => {
      const value = await readProject();
      value.contentOptions[0]!.mediaRefs[0]!.rights.status = 'pending';
      await writeProject(value);
    }],
  ] as const)('reports %s for its FR-036 defect class', async (rule, mutate) => {
    await mutate();
    await expectRule(rule);
  });

  it('reports duplicate project references across categories distinctly', async () => {
    const releaseCategories = categories();
    releaseCategories[1]!.projectIds[0] = releaseCategories[0]!.projectIds[0]!;
    await writeJson(join(candidateRoot, 'releases', RELEASE_VERSION, 'categories.json'), releaseCategories);

    await expectRule('structure.duplicate-project-reference');
  });
});
