import type { SequenceTimebase } from '@yii/content-schema';

/** Minimal GSAP timeline surface needed for deterministic synchronization. Times are seconds. */
export interface TimelineClock {
  readonly time: number;
  seek(timeSeconds: number, suppressEvents: boolean): void;
}

/** Minimal audio/video clock surface; adapters own media playback and expose only time + seek. */
export interface MediaClock {
  readonly currentTime: number;
  seek(timeSeconds: number): void;
}

export interface TimebaseSynchronizerOptions {
  timebase: SequenceTimebase;
  syncToleranceMs: number;
  timeline: TimelineClock;
  voiceover?: MediaClock;
  video?: MediaClock;
}

export interface TimebaseSynchronizationResult {
  authority: 'timeline' | 'voiceover';
  authoritativeTime: number;
  timelineCorrected: boolean;
  videoCorrected: boolean;
}

function normalizedTime(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Keeps every sequence clock aligned without competing writers. Narrated sequences use the
 * pre-generated voiceover as their authority; silent sequences use the GSAP timeline. A seek is
 * emitted only when the configured tolerance is exceeded, preventing correction thrash.
 */
export class TimebaseSynchronizer {
  private readonly timebase: SequenceTimebase;
  private readonly toleranceSeconds: number;
  private readonly timeline: TimelineClock;
  private readonly voiceover: MediaClock | undefined;
  private readonly video: MediaClock | undefined;

  constructor(options: TimebaseSynchronizerOptions) {
    this.timebase = options.timebase;
    this.toleranceSeconds = Math.max(0, options.syncToleranceMs) / 1_000;
    this.timeline = options.timeline;
    this.voiceover = options.voiceover;
    this.video = options.video;
  }

  synchronize(): TimebaseSynchronizationResult {
    const voiceoverIsAuthoritative = this.timebase === 'voiceover' && this.voiceover !== undefined;
    const authority = voiceoverIsAuthoritative ? 'voiceover' : 'timeline';
    const authoritativeTime = normalizedTime(
      voiceoverIsAuthoritative ? this.voiceover.currentTime : this.timeline.time,
    );

    let timelineCorrected = false;
    if (
      voiceoverIsAuthoritative &&
      this.isOutsideTolerance(this.timeline.time, authoritativeTime)
    ) {
      // `false` retains progress/completion callbacks when correction reaches the final frame.
      this.timeline.seek(authoritativeTime, false);
      timelineCorrected = true;
    }

    let videoCorrected = false;
    if (this.video && this.isOutsideTolerance(this.video.currentTime, authoritativeTime)) {
      this.video.seek(authoritativeTime);
      videoCorrected = true;
    }

    return { authority, authoritativeTime, timelineCorrected, videoCorrected };
  }

  /** Re-establishes the known opening time after replay, interruption recovery, or reset. */
  reset(): void {
    this.timeline.seek(0, false);
    this.video?.seek(0);
  }

  private isOutsideTolerance(actual: number, expected: number): boolean {
    return Math.abs(normalizedTime(actual) - expected) > this.toleranceSeconds;
  }
}
