import { describe, expect, it, vi } from 'vitest';
import { ContentLoader, ContentLoadError } from '../../src/content/loader.js';

function validManifest(version: string) {
  return {
    schemaVersion: 1,
    version,
    contentHash: `sha256-${version}`,
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
    projectIds: [`cat-${index + 1}-project-1`, `cat-${index + 1}-project-2`, `cat-${index + 1}-project-3`],
  }));
}

describe('ContentLoader publication-integrity refusal (T065)', () => {
  it('refuses a tampered release hash before accepting it as the active runtime release', async () => {
    const fetchJson = vi.fn(async (path: string) => {
      if (path === '/channels.json') return { staging: '1.0.0', production: null, frozen: false, history: [] };
      if (path === '/releases/1.0.0/manifest.json') return validManifest('1.0.0');
      if (path === '/releases/1.0.0/categories.json') return validCategories();
      throw new Error(`missing ${path}`);
    });

    const loader = new ContentLoader({ fetchJson, channel: 'staging' });
    await expect(loader.load()).rejects.toThrow(ContentLoadError);
  });

  it('falls back to the previously accepted release and alerts the operator when a replacement is tampered', async () => {
    const files: Record<string, unknown> = {
      '/channels.json': { staging: '1.0.0', production: null, frozen: false, history: [] },
      '/releases/1.0.0/manifest.json': validManifest('1.0.0'),
      '/releases/1.0.0/categories.json': validCategories(),
    };
    const fetchJson = vi.fn(async (path: string) => files[path]);
    const onOperatorAlert = vi.fn();
    const loader = new ContentLoader({ fetchJson, channel: 'staging', onOperatorAlert });
    await loader.load();

    files['/channels.json'] = { staging: '1.0.1', production: null, frozen: false, history: [] };
    files['/releases/1.0.1/manifest.json'] = { ...validManifest('1.0.1'), contentHash: 'sha256-tampered' };
    files['/releases/1.0.1/categories.json'] = validCategories();

    await expect(loader.load()).resolves.toMatchObject({ version: '1.0.0' });
    expect(onOperatorAlert).toHaveBeenCalledWith(expect.stringMatching(/content load failed/i));
  });
});
