import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  channelsFileSchema,
  type ChannelsFile,
  type ReleaseChannelName,
} from '@yii/content-schema';

export function channelsPath(root: string): string {
  return join(root, 'channels.json');
}

export async function readChannels(root: string): Promise<ChannelsFile> {
  try {
    return channelsFileSchema.parse(
      JSON.parse(await readFile(channelsPath(root), 'utf8')) as unknown,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { staging: null, production: null, frozen: false, history: [] };
    }
    throw error;
  }
}

export async function writeChannels(root: string, channels: ChannelsFile): Promise<void> {
  const path = channelsPath(root);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(
    temporary,
    `${JSON.stringify(channelsFileSchema.parse(channels), null, 2)}\n`,
    'utf8',
  );
  await rename(temporary, path);
}

export function setChannelVersion(
  channels: ChannelsFile,
  channel: ReleaseChannelName,
  version: string,
  type: 'publish' | 'promote' | 'rollback',
  actor = 'content-pipeline',
): ChannelsFile {
  return {
    ...channels,
    [channel]: version,
    history: [...channels.history, { type, channel, version, at: new Date().toISOString(), actor }],
  };
}
