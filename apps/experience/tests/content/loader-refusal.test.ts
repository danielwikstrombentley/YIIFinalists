import {
  binaryContentHash,
  canonicalManifestForHash,
  canonicalValidationReportForHash,
  contentHash,
  type ReleaseIntegrity,
} from '@yii/content-schema';
import { describe, expect, it, vi } from 'vitest';
import { ContentLoader, ContentLoadError } from '../../src/content/loader.js';

function baseManifest(version: string) {
  return {
    schemaVersion: 1,
    version,
    contentHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    createdAt: '2026-08-19T10:00:00.000Z',
    approvedBy: 'editor@example.test',
    frozen: false,
  };
}

function validCategories() {
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

function validProject(projectId: string) {
  const categoryNumber = Number(/cat-(\d+)-/.exec(projectId)?.[1]);
  return {
    id: projectId,
    name: `Project ${projectId}`,
    organisation: 'Organisation',
    country: 'Country',
    location: 'Location',
    categoryId: `cat-${categoryNumber}`,
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
          openingState: { id: 'open', elements: [{ target: 'hero', properties: {} }] },
          timebase: 'timeline',
          syncToleranceMs: 100,
          beats: [],
          finalFrame: { id: 'final', elements: [{ target: 'hero', properties: {} }] },
          interruptionExit: 'fade-out',
        },
        displayText: [{ type: 'paragraph', text: 'Text' }],
        voiceover: {
          file: `projects/${projectId}/voiceover/overview.opus`,
          scriptVersion: 'v1',
          voiceId: 'voice',
          durationMs: 1000,
          captionText: [],
        },
        mediaRefs: [],
        available: true,
      },
    ],
    inactivePositions: [2, 3, 4, 5],
  };
}

async function validReleaseFiles(version: string): Promise<Record<string, unknown>> {
  const categories = validCategories();
  const projects = categories
    .flatMap((category) => category.projectIds)
    .map((projectId) => validProject(projectId));
  const projectHashes = Object.fromEntries(
    await Promise.all(
      projects.map(async (project) => [project.id, await contentHash(project)] as const),
    ),
  );
  const validationReport = {
    schemaVersion: 1 as const,
    generatedAt: '2026-08-19T10:00:00.000Z',
    candidateVersion: version,
    valid: true,
    issues: [],
  };
  const manifest = baseManifest(version);
  manifest.contentHash = await contentHash({
    manifest: canonicalManifestForHash(manifest),
    categories,
    projectHashes,
    fileHashes: {},
    validationReport: canonicalValidationReportForHash(validationReport),
  });
  const integrity: ReleaseIntegrity = {
    version,
    contentHash: manifest.contentHash,
    projectHashes,
    fileHashes: {},
  };
  const files: Record<string, unknown> = {};
  files[`/releases/${version}/manifest.json`] = manifest;
  files[`/releases/${version}/categories.json`] = categories;
  files[`/releases/${version}/publication.json`] = integrity;
  files[`/releases/${version}/validation-report.json`] = validationReport;
  for (const project of projects) {
    files[`/releases/${version}/projects/${project.id}/project.json`] = project;
  }
  return files;
}

async function validHashedReleaseFiles(version: string): Promise<{
  files: Record<string, unknown>;
  bytes: Record<string, Uint8Array>;
}> {
  const files = await validReleaseFiles(version);
  const relativePath = 'projects/cat-1-project-1/voiceover/overview.opus';
  const asset = new TextEncoder().encode('approved local voiceover');
  const manifest = files[`/releases/${version}/manifest.json`] as ReturnType<typeof baseManifest>;
  const integrity = files[`/releases/${version}/publication.json`] as ReleaseIntegrity;
  integrity.fileHashes[relativePath] = await binaryContentHash(asset);
  const validationReport = files[`/releases/${version}/validation-report.json`] as {
    schemaVersion: 1;
    generatedAt: string;
    candidateVersion: string;
    valid: boolean;
    issues: [];
  };
  manifest.contentHash = await contentHash({
    manifest: canonicalManifestForHash(manifest),
    categories: files[`/releases/${version}/categories.json`],
    projectHashes: integrity.projectHashes,
    fileHashes: integrity.fileHashes,
    validationReport: canonicalValidationReportForHash(validationReport),
  });
  integrity.contentHash = manifest.contentHash;
  return { files, bytes: { [`/releases/${version}/${relativePath}`]: asset } };
}

describe('ContentLoader publication-integrity refusal (T065)', () => {
  it('refuses a tampered release hash before accepting it as the active runtime release', async () => {
    const files = await validReleaseFiles('1.0.0');
    files['/releases/1.0.0/manifest.json'] = {
      ...baseManifest('1.0.0'),
      contentHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    };
    const fetchJson = vi.fn(async (path: string) => {
      if (path === '/channels.json')
        return { staging: '1.0.0', production: null, frozen: false, history: [] };
      return files[path];
    });

    const loader = new ContentLoader({ fetchJson, channel: 'staging' });
    await expect(loader.load()).rejects.toThrow(ContentLoadError);
  });

  it('falls back to the previously accepted release and alerts the operator when a replacement is tampered', async () => {
    const files: Record<string, unknown> = {
      '/channels.json': { staging: '1.0.0', production: null, frozen: false, history: [] },
      ...(await validReleaseFiles('1.0.0')),
    };
    const fetchJson = vi.fn(async (path: string) => files[path]);
    const onOperatorAlert = vi.fn();
    const loader = new ContentLoader({ fetchJson, channel: 'staging', onOperatorAlert });
    await loader.load();

    files['/channels.json'] = { staging: '1.0.1', production: null, frozen: false, history: [] };
    Object.assign(files, await validReleaseFiles('1.0.1'));
    files['/releases/1.0.1/manifest.json'] = {
      ...baseManifest('1.0.1'),
      contentHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    };

    await expect(loader.load()).resolves.toMatchObject({ version: '1.0.0' });
    expect(onOperatorAlert).toHaveBeenCalledWith(expect.stringMatching(/content load failed/i));
  });

  it('refuses a release whose immutable local asset bytes no longer match publication.json', async () => {
    const { files, bytes } = await validHashedReleaseFiles('1.0.0');
    const fetchJson = vi.fn(async (path: string) => {
      if (path === '/channels.json') {
        return { staging: '1.0.0', production: null, frozen: false, history: [] };
      }
      return files[path];
    });
    const fetchBytes = vi.fn(async (path: string) => bytes[path] ?? new Uint8Array([0]));
    const loader = new ContentLoader({ fetchJson, fetchBytes, channel: 'staging' });

    bytes['/releases/1.0.0/projects/cat-1-project-1/voiceover/overview.opus'] =
      new TextEncoder().encode('tampered audio');

    await expect(loader.load()).rejects.toThrow(/asset .*contentHash/i);
  });
});
