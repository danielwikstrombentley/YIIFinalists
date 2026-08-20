/**
 * Prep-time-only TTS boundary. The public experience never imports this module and receives only
 * approved local audio referenced by the published content package.
 */
export interface TtsSynthesisRequest {
  text: string;
  voiceId: string;
  params?: Record<string, unknown>;
}

export interface TtsSynthesisResult {
  /** Uncompressed archival master returned by the configured provider. */
  wav: Buffer;
  durationMs: number;
}

export interface TtsProvider {
  id: string;
  synthesize(request: TtsSynthesisRequest): Promise<TtsSynthesisResult>;
}
