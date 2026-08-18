import { gsap } from 'gsap';
import type { Beat, CompositionSpec } from '@yii/content-schema';
import {
  buildSequenceTimeline,
  type TargetResolver,
  type TimelineCallback,
} from './timeline-factory.js';
import { sharedTicker, Ticker } from './ticker.js';

// SequenceOrchestrator (T016): the single motion boundary (plan.md Architecture #2). Builds
// timelines from data-driven sequence definitions; exposes play/pause/cancel/replay/reset/seek;
// reports progress/completion to a listener — it NEVER initiates state transitions itself (the
// state machine, T011, is the sole navigation authority; it merely listens).

export interface PlayableSequence {
  id: string;
  openingState: CompositionSpec;
  beats: readonly Beat[];
  finalFrame: CompositionSpec;
  callbacks?: readonly TimelineCallback[];
}

export interface SequencePlaybackCallbacks {
  onProgress?: (progress: number) => void;
  onComplete?: () => void;
}

export interface SequenceOrchestratorOptions {
  onProgress?: (progress: number) => void;
  onComplete?: () => void;
  resolveTarget?: TargetResolver;
}

export class SequenceOrchestrator {
  private readonly options: SequenceOrchestratorOptions;
  private readonly ticker: Ticker;
  private gsapContext: ReturnType<typeof gsap.context> | null = null;
  private timeline: gsap.core.Timeline | null = null;
  private currentSequence: PlayableSequence | null = null;
  private playbackCallbacks: SequencePlaybackCallbacks = {};

  constructor(options: SequenceOrchestratorOptions = {}, ticker: Ticker = sharedTicker) {
    this.options = options;
    this.ticker = ticker;
  }

  play(sequence: PlayableSequence): void {
    this.cancel();
    this.currentSequence = sequence;
    this.gsapContext = gsap.context(() => {
      this.timeline = buildSequenceTimeline({
        openingState: sequence.openingState,
        beats: sequence.beats,
        finalFrame: sequence.finalFrame,
        callbacks: sequence.callbacks,
        resolveTarget: this.options.resolveTarget,
        onProgress: (progress) => {
          this.options.onProgress?.(progress);
          this.playbackCallbacks.onProgress?.(progress);
        },
        onComplete: () => {
          this.options.onComplete?.();
          this.playbackCallbacks.onComplete?.();
        },
      });
      this.timeline.play(0);
    });
    this.ticker.start();
  }

  pause(): void {
    this.timeline?.pause();
  }

  resume(): void {
    this.timeline?.play();
  }

  /** Idempotent: repeated calls are safe no-ops (Principle II). */
  cancel(): void {
    if (this.gsapContext) {
      this.gsapContext.revert(); // kills every tween created in scope; reverts DOM targets in place
      this.gsapContext = null;
    }
    this.timeline = null;
    this.currentSequence = null;
  }

  /** Restores the complete opening state (the replay target, QR-002) and plays from the top. */
  replay(): void {
    const sequence = this.currentSequence;
    if (!sequence) return;
    this.play(sequence);
  }

  reset(): void {
    this.cancel();
  }

  seek(timeMs: number): void {
    // `suppressEvents` defaults to true in GSAP's `.seek()` — explicitly false so onProgress/
    // onComplete still report to the listener when the app (or a test) drives the timeline via
    // seek rather than waiting on real ticker-driven playback.
    this.timeline?.seek(timeMs / 1000, false);
  }

  /** Allows the compiler to observe one active sequence without owning machine transitions. */
  setPlaybackCallbacks(callbacks: SequencePlaybackCallbacks): void {
    this.playbackCallbacks = callbacks;
  }

  /** Current GSAP time in seconds for the TimebaseSynchronizer boundary. */
  get time(): number {
    return this.timeline?.time() ?? 0;
  }

  get progress(): number {
    return this.timeline?.progress() ?? 0;
  }

  isPlaying(): boolean {
    return this.timeline?.isActive() ?? false;
  }
}
