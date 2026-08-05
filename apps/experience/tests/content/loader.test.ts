import { describe, expect, it, vi } from 'vitest';
import type { Category, Project } from '@yii/content-schema';
import { ContentLoader, ContentLoadError } from '../../src/content/loader.js';

// T017 Tests: valid load, each refusal path, fallback chain, limit enforcement.

function validManifest() {
  return {
    schemaVersion: 1,
    version: '1.0.0',
    contentHash: 'sha256-test',
    createdAt: '2026-08-03T12:00:00.000Z',
    approvedBy: 'editor@example.com',
    frozen: false,
  };
}

function validCategories(): Category[] {
  const categories: Category[] = [];
  for (let i = 1; i <= 12; i += 1) {
    categories.push({
      id: `cat-${i}`,
      name: `Category ${i}`,
      order: i,
      projectIds: [`cat${i}-a`, `cat${i}-b`, `cat${i}-c`],
    });
  }
  return categories;
}

function validProject(id: string, categoryId: string, overrides: Partial<Project> = {}): Project {
  return {
    id,
    name: `Project ${id}`,
    organisation: 'Org',
    country: 'Country',
    location: 'Location',
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
      tileTier: 'photorealistic',
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
          file: 'voiceover/overview.opus',
          scriptVersion: 'v1',
          voiceId: 'voice-1',
          durationMs: 1000,
          captionText: [],
        },
        mediaRefs: [],
        available: true,
      },
    ],
    inactivePositions: [2, 3, 4, 5],
    ...overrides,
  };
}

function createFakeFetch(files: Record<string, unknown>) {
  return vi.fn(async (path: string) => {
    if (!(path in files)) {
      throw new Error(`404: ${path}`);
    }
    return files[path];
  });
}

describe('ContentLoader: valid load', () => {
  it('loads and revalidates the manifest + categories for the resolved channel', async () => {
    const fetchJson = createFakeFetch({
      '/channels.json': { staging: '1.0.0', production: null, frozen: false, history: [] },
      '/releases/1.0.0/manifest.json': validManifest(),
      '/releases/1.0.0/categories.json': validCategories(),
    });
    const loader = new ContentLoader({ fetchJson, channel: 'staging' });

    const release = await loader.load();
    expect(release.version).toBe('1.0.0');
    expect(release.categories).toHaveLength(12);
    expect(loader.activeRelease?.version).toBe('1.0.0');
  });

  it('loads and caches a project, resolving asset URLs package-relative to the release', async () => {
    const fetchJson = createFakeFetch({
      '/channels.json': { staging: '1.0.0', production: null, frozen: false, history: [] },
      '/releases/1.0.0/manifest.json': validManifest(),
      '/releases/1.0.0/categories.json': validCategories(),
      '/releases/1.0.0/projects/cat1-a/project.json': validProject('cat1-a', 'cat-1'),
    });
    const loader = new ContentLoader({ fetchJson, channel: 'staging' });
    await loader.load();

    const project = await loader.loadProject('cat1-a');
    expect(project.id).toBe('cat1-a');
    expect(loader.resolveAssetUrl('projects/cat1-a/voiceover/overview.opus')).toBe(
      '/releases/1.0.0/projects/cat1-a/voiceover/overview.opus',
    );

    // Second call is served from cache — fetchJson is not called again for the same project.
    const callsBefore = fetchJson.mock.calls.length;
    await loader.loadProject('cat1-a');
    expect(fetchJson.mock.calls.length).toBe(callsBefore);
  });
});

describe('ContentLoader: refusal paths', () => {
  it('refuses a channel with no published release and throws (no cache to fall back to)', async () => {
    const fetchJson = createFakeFetch({
      '/channels.json': { staging: null, production: null, frozen: false, history: [] },
    });
    const loader = new ContentLoader({ fetchJson, channel: 'staging' });
    await expect(loader.load()).rejects.toThrow(ContentLoadError);
  });

  it('refuses an invalid manifest and throws (no cache to fall back to)', async () => {
    const fetchJson = createFakeFetch({
      '/channels.json': { staging: '1.0.0', production: null, frozen: false, history: [] },
      '/releases/1.0.0/manifest.json': { not: 'a manifest' },
    });
    const loader = new ContentLoader({ fetchJson, channel: 'staging' });
    await expect(loader.load()).rejects.toThrow(ContentLoadError);
  });

  it('refuses invalid categories.json (wrong count) and throws', async () => {
    const fetchJson = createFakeFetch({
      '/channels.json': { staging: '1.0.0', production: null, frozen: false, history: [] },
      '/releases/1.0.0/manifest.json': validManifest(),
      '/releases/1.0.0/categories.json': validCategories().slice(0, 5), // only 5, not 12
    });
    const loader = new ContentLoader({ fetchJson, channel: 'staging' });
    await expect(loader.load()).rejects.toThrow(ContentLoadError);
  });

  it('refuses an invalid project and throws', async () => {
    const fetchJson = createFakeFetch({
      '/channels.json': { staging: '1.0.0', production: null, frozen: false, history: [] },
      '/releases/1.0.0/manifest.json': validManifest(),
      '/releases/1.0.0/categories.json': validCategories(),
      '/releases/1.0.0/projects/cat1-a/project.json': { not: 'a project' },
    });
    const loader = new ContentLoader({ fetchJson, channel: 'staging' });
    await loader.load();
    await expect(loader.loadProject('cat1-a')).rejects.toThrow(ContentLoadError);
  });
});

describe('ContentLoader: fallback chain', () => {
  it('falls back to the previous cached release when a subsequent load fails, and alerts the operator', async () => {
    const files: Record<string, unknown> = {
      '/channels.json': { staging: '1.0.0', production: null, frozen: false, history: [] },
      '/releases/1.0.0/manifest.json': validManifest(),
      '/releases/1.0.0/categories.json': validCategories(),
    };
    const fetchJson = createFakeFetch(files);
    const onOperatorAlert = vi.fn();
    const loader = new ContentLoader({ fetchJson, channel: 'staging', onOperatorAlert });

    const first = await loader.load();
    expect(first.version).toBe('1.0.0');

    // Now the channel points at a version whose manifest is missing (simulated corruption).
    files['/channels.json'] = { staging: '2.0.0', production: null, frozen: false, history: [] };
    const second = await loader.load();

    expect(second.version).toBe('1.0.0'); // fell back to the previous cache
    expect(onOperatorAlert).toHaveBeenCalledTimes(1);
  });
});

describe('ContentLoader: runtime limit enforcement', () => {
  it('requires an active Overview at position 1', async () => {
    const fetchJson = createFakeFetch({
      '/channels.json': { staging: '1.0.0', production: null, frozen: false, history: [] },
      '/releases/1.0.0/manifest.json': validManifest(),
      '/releases/1.0.0/categories.json': validCategories(),
      '/releases/1.0.0/projects/cat1-a/project.json': validProject('cat1-a', 'cat-1', {
        contentOptions: [
          { ...validProject('x', 'cat-1').contentOptions[0]!, position: 1, available: false },
        ],
        inactivePositions: [2, 3, 4, 5],
      }),
    });
    const loader = new ContentLoader({ fetchJson, channel: 'staging' });
    await loader.load();
    await expect(loader.loadProject('cat1-a')).rejects.toThrow(/Overview/);
  });

  it('ignores inactive positions and caps active options at 5', async () => {
    const project = validProject('cat1-a', 'cat-1', {
      contentOptions: [1, 2, 3, 4, 5].map((position) => ({
        ...validProject('x', 'cat-1').contentOptions[0]!,
        position: position as 1 | 2 | 3 | 4 | 5,
        title: `Option ${position}`,
      })),
      inactivePositions: [3],
    });
    const fetchJson = createFakeFetch({
      '/channels.json': { staging: '1.0.0', production: null, frozen: false, history: [] },
      '/releases/1.0.0/manifest.json': validManifest(),
      '/releases/1.0.0/categories.json': validCategories(),
      '/releases/1.0.0/projects/cat1-a/project.json': project,
    });
    const loader = new ContentLoader({ fetchJson, channel: 'staging' });
    await loader.load();

    const loaded = await loader.loadProject('cat1-a');
    expect(loaded.contentOptions.map((o) => o.position)).toEqual([1, 2, 4, 5]);
  });
});

describe('ContentLoader: category-change eviction', () => {
  it('evicts cached projects outside the newly active category', async () => {
    const fetchJson = createFakeFetch({
      '/channels.json': { staging: '1.0.0', production: null, frozen: false, history: [] },
      '/releases/1.0.0/manifest.json': validManifest(),
      '/releases/1.0.0/categories.json': validCategories(),
      '/releases/1.0.0/projects/cat1-a/project.json': validProject('cat1-a', 'cat-1'),
      '/releases/1.0.0/projects/cat2-a/project.json': validProject('cat2-a', 'cat-2'),
    });
    const loader = new ContentLoader({ fetchJson, channel: 'staging' });
    await loader.load();
    await loader.loadProject('cat1-a');
    await loader.loadProject('cat2-a');

    loader.onCategoryChange('cat-2');

    const callsBefore = fetchJson.mock.calls.length;
    await loader.loadProject('cat2-a'); // still cached
    expect(fetchJson.mock.calls.length).toBe(callsBefore);

    await loader.loadProject('cat1-a'); // evicted, re-fetched
    expect(fetchJson.mock.calls.length).toBe(callsBefore + 1);
  });
});
