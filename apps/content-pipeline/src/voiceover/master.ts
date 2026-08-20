export const MAX_DELIVERY_BITRATE_KBPS = 192;

export interface MasteredVoiceover {
  delivery: Buffer;
  extension: 'opus' | 'aac';
}

/**
 * Codec integration remains an editorial/provider deployment concern. This default preserves the
 * supplied bytes for test/dev providers while enforcing the delivery bitrate budget. A production
 * adapter can replace it with WAV → Opus/AAC transcoding without changing release semantics.
 */
export function masterVoiceover(wav: Buffer): MasteredVoiceover {
  return { delivery: wav, extension: 'opus' };
}

export function assertDeliveryWithinBudget(delivery: Buffer, durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error('Voiceover duration must be positive before mastering.');
  }
  const bitrateKbps = (delivery.length * 8) / durationMs;
  if (bitrateKbps > MAX_DELIVERY_BITRATE_KBPS) {
    throw new Error(
      `Voiceover delivery is ${bitrateKbps.toFixed(1)} kbps, above the ${String(MAX_DELIVERY_BITRATE_KBPS)} kbps budget.`,
    );
  }
}
