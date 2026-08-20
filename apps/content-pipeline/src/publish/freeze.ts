import type { ChannelsFile } from '@yii/content-schema';

export function withProductionFreeze(channels: ChannelsFile, frozen: boolean): ChannelsFile {
  return {
    ...channels,
    frozen,
    history: [
      ...channels.history,
      {
        type: frozen ? 'freeze' : 'unfreeze',
        channel: 'production',
        at: new Date().toISOString(),
        actor: 'content-pipeline',
      },
    ],
  };
}
