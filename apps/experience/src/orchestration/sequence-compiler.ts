import type { Beat, ContentOption, CompositionSpec, VoiceoverAsset } from '@yii/content-schema';
import {
  contentFormatRegistry,
  type ContentFormatDefinition,
  type ContentFormatRegistry,
} from '../formats/registry.js';
import type { NativeCameraFlight } from '../formats/types.js';
import type { CleanupRegistry } from '../state/cleanup-registry.js';
import { SequenceOrchestrator, type PlayableSequence } from './orchestrator.js';
import {
  TimebaseSynchronizer,
  type MediaClock,
  type TimebaseSynchronizationResult,
  type TimelineClock,
} from './timebase.js';
import type { TargetResolver } from './timeline-factory.js';

export type SequencePlaybackPhase = 'idle' | 'playing' | 'final-hold' | 'cancelled' | 'failed';

/** Narrow media contracts keep the compiler independent of DOM media implementations. */
export interface SequenceVoiceover extends MediaClock {
  start(asset: VoiceoverAsset): void;
  stop(): void;
}

export interface SequenceVideo extends MediaClock {
  stop(): void;
}

export interface SequenceCompilerOptions {
  orchestrator: SequenceOrchestrator;
  resolveTarget: TargetResolver;
  voiceover: SequenceVoiceover;
  video?: SequenceVideo;
  nativeCameraFlight?: NativeCameraFlight;
  cleanupRegistry?: CleanupRegistry;
  cleanupKey?: string;
  formatRegistry?: ContentFormatRegistry;
  onInterruptionExit?: (profile: string) => void;
  onComplete?: () => void;
  onFailure?: (error: Error) => void;
  safeComposition: CompositionSpec;
}

export interface CompiledSequencePlayback {
  readonly option: ContentOption;
  readonly formatDefinitions: readonly ContentFormatDefinition[];
  readonly phase: SequencePlaybackPhase;
  play(): void;
  replay(): void;
  cancel(): void;
  synchronizeTimebase(): TimebaseSynchronizationResult | null;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function applyComposition(composition: CompositionSpec, resolveTarget: TargetResolver): void {
  for (const element of composition.elements) {
    Object.assign(resolveTarget(element.target), element.properties);
  }
}

function collectTargetIds(sequence: ContentOption['sequence']): readonly string[] {
  const targetIds = new Set<string>();
  for (const composition of [sequence.openingState, sequence.finalFrame]) {
    for (const element of composition.elements) targetIds.add(element.target);
  }
  for (const beat of sequence.beats) targetIds.add(beat.target ?? beat.type);
  return [...targetIds];
}

/**
 * Turns validated package content into one owned playback lifecycle. The compiler owns no React
 * state and starts no free timers: all visual callbacks live on the existing GSAP timeline.
 */
export class SequenceCompiler {
  private readonly options: SequenceCompilerOptions;

  constructor(options: SequenceCompilerOptions) {
    this.options = options;
  }

  compile(option: ContentOption): CompiledSequencePlayback {
    const formatRegistry = this.options.formatRegistry ?? contentFormatRegistry;
    const formatDefinitions = option.formats.map((formatId) => formatRegistry.require(formatId));
    return new CompiledSequence(option, formatDefinitions, this.options);
  }
}

class CompiledSequence implements CompiledSequencePlayback {
  readonly option: ContentOption;
  readonly formatDefinitions: readonly ContentFormatDefinition[];

  private readonly options: SequenceCompilerOptions;
  private readonly sequence: PlayableSequence;
  private readonly synchronizer: TimebaseSynchronizer;
  private readonly targetIds: readonly string[];
  private readonly nativeFlights = new Set<{ cancel(): void }>();
  private phaseValue: SequencePlaybackPhase = 'idle';

  constructor(
    option: ContentOption,
    formatDefinitions: readonly ContentFormatDefinition[],
    options: SequenceCompilerOptions,
  ) {
    this.option = option;
    this.formatDefinitions = formatDefinitions;
    this.options = options;
    this.targetIds = collectTargetIds(option.sequence);

    const needsNativeCameraFlight = formatDefinitions.some(
      (definition) => definition.cameraMotion === 'native-flight',
    );
    const nativeCameraBeats = needsNativeCameraFlight
      ? option.sequence.beats.filter((beat) => beat.type === 'camera')
      : [];
    const gsapBeats = needsNativeCameraFlight
      ? option.sequence.beats.filter((beat) => beat.type !== 'camera')
      : option.sequence.beats;

    this.sequence = {
      id: `${option.position}:${option.sequence.openingState.id}`,
      openingState: option.sequence.openingState,
      beats: gsapBeats,
      finalFrame: option.sequence.finalFrame,
      callbacks: nativeCameraBeats.map((beat) => ({
        atMs: beat.startTime,
        run: () => this.startNativeCameraFlight(beat),
      })),
    };

    const timeline: TimelineClock = {
      get time() {
        return options.orchestrator.time;
      },
      seek: (timeSeconds, suppressEvents) => {
        // The orchestrator intentionally exposes millisecond input while GSAP/media clocks use
        // seconds. Keeping this conversion here gives the timebase one authoritative unit.
        void suppressEvents;
        options.orchestrator.seek(timeSeconds * 1_000);
      },
    };
    this.synchronizer = new TimebaseSynchronizer({
      timebase: option.sequence.timebase,
      syncToleranceMs: option.sequence.syncToleranceMs,
      timeline,
      voiceover: options.voiceover,
      video: options.video,
    });
  }

  get phase(): SequencePlaybackPhase {
    return this.phaseValue;
  }

  play(): void {
    this.prepareForNewRun();
    this.phaseValue = 'playing';
    this.options.orchestrator.setPlaybackCallbacks({
      onComplete: () => {
        if (this.phaseValue !== 'playing') return;
        this.phaseValue = 'final-hold';
        this.options.onComplete?.();
      },
    });

    try {
      this.options.orchestrator.play(this.sequence);
      this.synchronizer.reset();
      this.options.voiceover.seek(0);
      this.options.voiceover.start(this.option.voiceover);
      this.options.cleanupRegistry?.register(this.cleanupKey, () => this.cancel());
    } catch (error) {
      this.fail(asError(error));
    }
  }

  /** Rebuilds the timeline and resets every owned visual/media clock to the declared opening state. */
  replay(): void {
    this.play();
  }

  /** Idempotent state-exit cleanup for sequence, media, native camera work, and overlays. */
  cancel(): void {
    if (this.phaseValue === 'idle' || this.phaseValue === 'cancelled') return;
    this.options.cleanupRegistry?.unregister(this.cleanupKey);
    this.options.orchestrator.cancel();
    this.cancelNativeCameraFlights();
    this.options.voiceover.stop();
    this.options.video?.stop();
    this.clearVisualTargets();
    this.phaseValue = 'cancelled';
    try {
      this.options.onInterruptionExit?.(this.option.sequence.interruptionExit);
    } catch {
      // Cleanup profiles are an adapter boundary: their own failure cannot strand public playback.
    }
  }

  synchronizeTimebase(): TimebaseSynchronizationResult | null {
    if (this.phaseValue !== 'playing' && this.phaseValue !== 'final-hold') return null;
    return this.synchronizer.synchronize();
  }

  private get cleanupKey(): string {
    return this.options.cleanupKey ?? 'content-sequence';
  }

  private prepareForNewRun(): void {
    const hadActivePlayback = this.phaseValue === 'playing' || this.phaseValue === 'final-hold';
    this.options.cleanupRegistry?.unregister(this.cleanupKey);
    this.options.orchestrator.cancel();
    this.cancelNativeCameraFlights();
    if (hadActivePlayback) {
      this.options.voiceover.stop();
      this.options.video?.stop();
    }
    this.options.voiceover.seek(0);
    this.options.video?.seek(0);
  }

  private startNativeCameraFlight(beat: Beat): void {
    const nativeCameraFlight = this.options.nativeCameraFlight;
    if (!nativeCameraFlight) {
      this.fail(
        new Error('A geographic camera sequence requires the native camera-flight adapter.'),
      );
      return;
    }

    try {
      const flight = nativeCameraFlight.start({
        targetId: beat.target ?? beat.type,
        durationMs: beat.duration,
        params: beat.params ?? {},
      });
      this.nativeFlights.add(flight);
    } catch (error) {
      this.fail(asError(error));
    }
  }

  private cancelNativeCameraFlights(): void {
    const flights = [...this.nativeFlights];
    this.nativeFlights.clear();
    for (const flight of flights) {
      try {
        flight.cancel();
      } catch {
        // Native adapter cancellation is best-effort here; remaining cleanup must still happen.
      }
    }
  }

  private clearVisualTargets(): void {
    for (const targetId of this.targetIds) {
      try {
        Reflect.set(this.options.resolveTarget(targetId), 'visible', false);
      } catch {
        // A renderer target may already be disposed; its adapter cleanup owns that case.
      }
    }
  }

  private fail(error: Error): void {
    this.options.cleanupRegistry?.unregister(this.cleanupKey);
    this.options.orchestrator.cancel();
    this.cancelNativeCameraFlights();
    this.options.voiceover.stop();
    this.options.video?.stop();
    applyComposition(this.options.safeComposition, this.options.resolveTarget);
    this.phaseValue = 'failed';
    try {
      this.options.onFailure?.(error);
    } catch {
      // The machine/diagnostics owner is notified best-effort; the safe composition is already live.
    }
  }
}
