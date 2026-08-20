import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runPublishCommand } from '../src/commands/index.ts';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('publish CLI boundary', () => {
  it('refuses to use the immutable release root as its own candidate source', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yii-publish-root-'));
    roots.push(root);

    await expect(
      runPublishCommand([
        '--root',
        root,
        '--candidate-root',
        root,
        '--version',
        '1.0.0',
        '--channel',
        'staging',
      ]),
    ).rejects.toThrow(/separate candidate root/i);
  });

  it('requires both a publish root and validated candidate root', async () => {
    await expect(
      runPublishCommand(['--root', '/tmp/releases', '--version', '1.0.0', '--channel', 'staging']),
    ).rejects.toThrow(/candidate-root/i);
  });
});
