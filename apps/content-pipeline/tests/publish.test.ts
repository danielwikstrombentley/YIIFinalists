import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ValidationReport } from '../src/validate/report.ts';
import type { PublishCandidate } from '../src/publish/release.ts';
import {
  publishRelease,
  promoteRelease,
  rollbackChannel,
  setProductionFreeze,
} from '../src/publish/release.ts';

const FIXED_NOW = '2026-08-19T10:00:00.000Z';
let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'yii-publish-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function validCandidate(version: string, projectText = 'Initial release text'): PublishCandidate {
  return {
    version,
    manifest: {
      schemaVersion: 1,
      version,
      createdAt: FIXED_NOW,
      approvedBy: 'editor@example.test',
      frozen: false,
    },
    categories: Array.from({ length: 12 }, (_, index) => ({
      id: `cat-${index + 1}`,
      name: `Category ${index + 1}`,
      order: index + 1,
      projectIds: [
        `cat-${index + 1}-project-1`,
        `cat-${index + 1}-project-2`,
        `cat-${index + 1}-project-3`,
      ],
    })),
    projects: Array.from({ length: 36 }, (_, index) => ({
      id: `cat-${Math.floor(index / 3) + 1}-project-${(index % 3) + 1}`,
      content: `${projectText} ${String(index + 1)}`,
    })),
    validationReport: {
      schemaVersion: 1 as const,
      generatedAt: FIXED_NOW,
      candidateVersion: version,
      valid: true,
      issues: [],
    },
  };
}

describe('release publishing lifecycle (T065 red-first contract)', () => {
  it('publishes an immutable validated candidate to staging with a deterministic content hash', async () => {
    const first = await publishRelease({
      root,
      candidate: validCandidate('1.0.0'),
      channel: 'staging',
    });
    const second = await publishRelease({
      root,
      candidate: validCandidate('1.0.0'),
      channel: 'staging',
    });

    expect(first.contentHash).toMatch(/^sha256:/);
    expect(second.contentHash).toBe(first.contentHash);
    const channels = JSON.parse(await readFile(join(root, 'channels.json'), 'utf8'));
    expect(channels.staging).toBe('1.0.0');
  });

  it('promotes a retained staging release to production without rewriting it', async () => {
    await publishRelease({ root, candidate: validCandidate('1.0.0'), channel: 'staging' });
    await promoteRelease({ root, version: '1.0.0' });

    const channels = JSON.parse(await readFile(join(root, 'channels.json'), 'utf8'));
    expect(channels.production).toBe('1.0.0');
    expect(channels.history.at(-1)).toMatchObject({
      type: 'promote',
      channel: 'production',
      version: '1.0.0',
    });
  });

  it('keeps prior releases and rolls a channel back to its retained previous version', async () => {
    await publishRelease({ root, candidate: validCandidate('1.0.0'), channel: 'staging' });
    await publishRelease({
      root,
      candidate: validCandidate('1.0.1', 'Corrected copy'),
      channel: 'staging',
    });
    await rollbackChannel({ root, channel: 'staging' });

    const channels = JSON.parse(await readFile(join(root, 'channels.json'), 'utf8'));
    expect(channels.staging).toBe('1.0.0');
    expect(channels.history.at(-1)).toMatchObject({
      type: 'rollback',
      channel: 'staging',
      version: '1.0.0',
    });
  });

  it('blocks production publishing when the channel is frozen', async () => {
    await setProductionFreeze({ root, frozen: true });

    await expect(
      publishRelease({ root, candidate: validCandidate('1.0.0'), channel: 'production' }),
    ).rejects.toThrow(/frozen/i);
  });

  it('publishes a project-level update as a new release while reusing untouched project hashes', async () => {
    const base = await publishRelease({
      root,
      candidate: validCandidate('1.0.0'),
      channel: 'staging',
    });
    const update = validCandidate('1.0.1');
    update.projects[0]!.content = 'Only this project changed';
    const changed = await publishRelease({
      root,
      candidate: update,
      channel: 'staging',
      baseVersion: '1.0.0',
    });

    expect(changed.projectHashes['cat-1-project-1']).not.toBe(
      base.projectHashes['cat-1-project-1'],
    );
    expect(changed.projectHashes['cat-1-project-2']).toBe(base.projectHashes['cat-1-project-2']);
    expect(
      await stat(join(root, 'releases', '1.0.1', 'projects', 'cat-1-project-2', 'project.json')),
    ).toBeDefined();
  });

  it('refuses a candidate that merely has 36 entries but mismatches the category project references', async () => {
    const candidate = validCandidate('1.0.0');
    candidate.projects[0]!.id = 'unreferenced-project';

    await expect(publishRelease({ root, candidate, channel: 'staging' })).rejects.toThrow(
      /identities/i,
    );
  });

  it('refuses a candidate with an unresolved T062 validation report error', async () => {
    const candidate = validCandidate('1.0.0');
    candidate.validationReport = {
      ...candidate.validationReport,
      valid: false,
      issues: [
        {
          rule: 'editorial.approval',
          severity: 'error',
          path: 'projects/cat-1-project-1/editorial.json',
          message: 'Editorial option is not approved.',
        },
      ],
    } satisfies ValidationReport;

    await expect(publishRelease({ root, candidate, channel: 'staging' })).rejects.toThrow(
      /validation-passing/i,
    );
  });

  it('hashes and writes package-relative local assets into the immutable release', async () => {
    const candidate = validCandidate('1.0.0');
    candidate.assets = {
      'projects/cat-1-project-1/voiceover/overview.opus': Buffer.from('local-voiceover'),
    };

    const published = await publishRelease({ root, candidate, channel: 'staging' });

    expect(published.fileHashes['projects/cat-1-project-1/voiceover/overview.opus']).toMatch(
      /^sha256:/,
    );
    await expect(
      readFile(
        join(
          root,
          'releases',
          '1.0.0',
          'projects',
          'cat-1-project-1',
          'voiceover',
          'overview.opus',
        ),
      ),
    ).resolves.toEqual(Buffer.from('local-voiceover'));
    await expect(
      readFile(join(root, 'releases', '1.0.0', 'validation-report.json'), 'utf8'),
    ).resolves.toContain('"valid": true');
  });
});
