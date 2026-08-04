import { z } from 'zod';
import { semverSchema } from './shared.js';

// channels.json — contracts/content-package.md: `{ staging, production, frozen, history }`.
// Rollback = repoint a channel at a previously retained release version (research.md R8).

export const RELEASE_CHANNEL_NAMES = ['staging', 'production'] as const;
export type ReleaseChannelName = (typeof RELEASE_CHANNEL_NAMES)[number];

export const CHANNEL_EVENT_TYPES = ['publish', 'promote', 'rollback', 'freeze', 'unfreeze'] as const;
export type ChannelEventType = (typeof CHANNEL_EVENT_TYPES)[number];

export const channelEventSchema = z
  .object({
    type: z.enum(CHANNEL_EVENT_TYPES),
    channel: z.enum(RELEASE_CHANNEL_NAMES),
    version: semverSchema.optional(),
    at: z.iso.datetime({ offset: true }),
    actor: z.string().min(1).optional(),
    notes: z.string().optional(),
  })
  .strict();

export type ChannelEvent = z.infer<typeof channelEventSchema>;

export const channelsFileSchema = z
  .object({
    staging: semverSchema.nullable(),
    production: semverSchema.nullable(),
    frozen: z.boolean(),
    history: z.array(channelEventSchema),
  })
  .strict();

export type ChannelsFile = z.infer<typeof channelsFileSchema>;

/** Producer obligation: "if channels.json.frozen is true, publishing to production MUST fail". */
export function canPublishToProduction(channels: Pick<ChannelsFile, 'frozen'>): boolean {
  return !channels.frozen;
}
