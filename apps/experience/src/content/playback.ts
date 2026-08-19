import type { ContentOption, Project } from '@yii/content-schema';
import { VideoSurface } from '../media/VideoSurface.js';
import { VoiceoverPlayer, type VoiceoverStatus } from '../media/VoiceoverPlayer.js';
import { sharedTicker } from '../orchestration/ticker.js';
import {
  SequenceCompiler,
  type CompiledSequencePlayback,
  type SequencePlaybackPhase,
} from '../orchestration/sequence-compiler.js';
import { SequenceOrchestrator } from '../orchestration/orchestrator.js';
import type { ExperienceEvent } from '../state/types.js';

export interface ContentPlaybackSnapshot {
  projectId: string;
  option: ContentOption;
  phase: 'playing' | 'final-hold';
  run: number;
  openingStateRestored: boolean;
  mediaFallback: boolean;
}

export interface ContentPlaybackPresentation {
  readonly snapshot: ContentPlaybackSnapshot | null;
  readonly videoSurface: VideoSurface;
  readonly voiceoverStatus: VoiceoverStatus;
  getSnapshot(): ContentPlaybackSnapshot | null;
  subscribe(listener: () => void): () => void;
  resolveAssetUrl(packageRelativePath: string): string;
  start(projectId: string, position: number, generation: number): boolean;
  /** Operator-only test/recovery hook: holds the current safe composition and records fallback. */
  forceMediaFailure(): boolean;
  cancel(): void;
  dispose(): void;
}

export interface ContentPlaybackPresentationOptions {
  getProject(projectId: string): Project | undefined;
  resolveAssetUrl(packageRelativePath: string): string;
  send(event: ExperienceEvent): void;
  onMediaFailure?: (failure: { assetId: string; error: string }) => void;
}

type SequenceTarget = Record<string, unknown>;

/**
 * State-owned runtime for one project option. It owns media, compiler, timebase callback, and
 * stale-completion checks; React reads its snapshot but never starts or stops playback itself.
 */
class ContentPlaybackController implements ContentPlaybackPresentation {
  private readonly getProject: ContentPlaybackPresentationOptions['getProject'];
  private readonly resolveAsset: ContentPlaybackPresentationOptions['resolveAssetUrl'];
  private readonly send: ContentPlaybackPresentationOptions['send'];
  private readonly onMediaFailure: ContentPlaybackPresentationOptions['onMediaFailure'];
  private readonly voiceover: VoiceoverPlayer;
  readonly videoSurface: VideoSurface;
  private readonly targets = new Map<string, SequenceTarget>();
  private readonly listeners = new Set<() => void>();
  private playback: CompiledSequencePlayback | null = null;
  private snapshotValue: ContentPlaybackSnapshot | null = null;
  private activeRun: number | null = null;
  private runCount = 0;
  private unregisterTimebase: (() => void) | null = null;
  private disposed = false;

  constructor(options: ContentPlaybackPresentationOptions) {
    this.getProject = options.getProject;
    this.resolveAsset = options.resolveAssetUrl;
    this.send = options.send;
    this.onMediaFailure = options.onMediaFailure;
    this.voiceover = new VoiceoverPlayer({ resolveAssetUrl: this.resolveAsset });
    this.videoSurface = new VideoSurface({ resolveAssetUrl: this.resolveAsset });
  }

  get snapshot(): ContentPlaybackSnapshot | null {
    return this.snapshotValue;
  }

  getSnapshot = (): ContentPlaybackSnapshot | null => this.snapshotValue;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get voiceoverStatus(): VoiceoverStatus {
    return this.voiceover.status;
  }

  resolveAssetUrl(packageRelativePath: string): string {
    return this.resolveAsset(packageRelativePath);
  }

  start(projectId: string, position: number, generation: number): boolean {
    if (this.disposed) return false;
    const project = this.getProject(projectId);
    const option = project?.contentOptions.find((candidate) => candidate.position === position);
    if (!project || !option) return false;

    this.cancel();
    this.targets.clear();
    const run = ++this.runCount;
    this.activeRun = run;
    this.snapshotValue = {
      projectId: project.id,
      option,
      phase: 'playing',
      run,
      openingStateRestored: true,
      mediaFallback: false,
    };
    this.notify();

    const resolveTarget = (targetId: string): SequenceTarget => {
      let target = this.targets.get(targetId);
      if (!target) {
        target = {};
        this.targets.set(targetId, target);
      }
      return target;
    };
    const orchestrator = new SequenceOrchestrator({ resolveTarget });
    const compiler = new SequenceCompiler({
      orchestrator,
      resolveTarget,
      voiceover: this.voiceover,
      video: this.videoSurface,
      safeComposition: option.sequence.finalFrame,
      onComplete: () => this.completeRun(run, generation),
      onFailure: () => this.completeRun(run, generation),
    });
    const playback = compiler.compile(option);
    this.playback = playback;
    playback.play();

    // Timebase correction stays on the app's existing single GSAP ticker and is released with
    // the playback. It never starts a separate RAF loop or renderer writer.
    this.unregisterTimebase = sharedTicker.registerRenderer(() => {
      if (this.activeRun === run) playback.synchronizeTimebase();
    });
    sharedTicker.start();
    this.syncSnapshotPhase(playback.phase);
    return true;
  }

  cancel(): void {
    this.unregisterTimebase?.();
    this.unregisterTimebase = null;
    this.playback?.cancel();
    this.playback = null;
    this.snapshotValue = null;
    this.activeRun = null;
    this.targets.clear();
    this.notify();
  }

  forceMediaFailure(): boolean {
    const snapshot = this.snapshotValue;
    if (this.disposed || !snapshot) return false;
    const assetId = snapshot.option.mediaRefs[0]?.id ?? snapshot.option.voiceover.file;
    this.snapshotValue = { ...snapshot, mediaFallback: true };
    this.onMediaFailure?.({
      assetId,
      error: 'Operator-injected media failure; safe composition retained.',
    });
    this.notify();
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancel();
    this.voiceover.dispose();
    this.videoSurface.dispose();
    this.disposed = true;
  }

  private completeRun(run: number, generation: number): void {
    if (this.activeRun !== run) return;
    this.syncSnapshotPhase('final-hold');
    this.send({ type: 'internal.sequenceComplete', generation });
  }

  private syncSnapshotPhase(phase: SequencePlaybackPhase): void {
    if (!this.snapshotValue) return;
    this.snapshotValue = {
      ...this.snapshotValue,
      phase: phase === 'final-hold' || phase === 'failed' ? 'final-hold' : 'playing',
    };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // A passive visual subscriber must never disrupt sequence playback or recovery.
      }
    }
  }
}

export function createContentPlaybackPresentation(
  options: ContentPlaybackPresentationOptions,
): ContentPlaybackPresentation {
  return new ContentPlaybackController(options);
}
