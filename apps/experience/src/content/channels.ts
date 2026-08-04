import { channelsFileSchema, type ReleaseChannelName } from '@yii/content-schema';

// Channel resolution (T017): reads channels.json and picks the release version for the
// configured deployment channel (contracts/content-package.md).

export class ChannelResolutionError extends Error {}

export interface ResolveActiveReleaseOptions {
  channel: ReleaseChannelName;
  fetchJson: (path: string) => Promise<unknown>;
  basePath: string;
}

export interface ChannelResolution {
  channel: ReleaseChannelName;
  version: string;
}

export async function resolveActiveRelease(options: ResolveActiveReleaseOptions): Promise<ChannelResolution> {
  const raw = await options.fetchJson(`${options.basePath}/channels.json`);
  const result = channelsFileSchema.safeParse(raw);
  if (!result.success) {
    throw new ChannelResolutionError('channels.json failed schema validation');
  }
  const version = result.data[options.channel];
  if (!version) {
    throw new ChannelResolutionError(`no release published to channel "${options.channel}"`);
  }
  return { channel: options.channel, version };
}
