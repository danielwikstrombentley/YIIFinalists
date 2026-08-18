import type { VoiceoverAsset } from '@yii/content-schema';

export type VoiceoverStatus = 'idle' | 'playing' | 'stopped' | 'fallback' | 'disposed';

export interface ObjectUrlApi {
  createObjectURL(value: Blob): string;
  revokeObjectURL(url: string): void;
}

export interface VoiceoverFailure {
  asset: VoiceoverAsset;
  error: Error;
}

export interface VoiceoverPlayerOptions {
  createAudio?: () => HTMLAudioElement;
  resolveAssetUrl?: (packageRelativePath: string) => string;
  objectUrlApi?: ObjectUrlApi;
  onFailure?: (failure: VoiceoverFailure) => void;
  onStatusChange?: (status: VoiceoverStatus) => void;
}

function resolveDefaultAssetUrl(packageRelativePath: string): string {
  return packageRelativePath;
}

function defaultObjectUrlApi(): ObjectUrlApi | undefined {
  if (
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function' ||
    typeof URL.revokeObjectURL !== 'function'
  ) {
    return undefined;
  }
  return {
    createObjectURL: (value) => URL.createObjectURL(value),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
  };
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Owns one local pre-generated narration element. The player reports failure instead of throwing
 * through a public navigation path, and its clock is the voiceover timebase consumed by T040.
 */
export class VoiceoverPlayer {
  private readonly createAudio: () => HTMLAudioElement;
  private readonly resolveAssetUrl: (packageRelativePath: string) => string;
  private readonly objectUrlApi: ObjectUrlApi | undefined;
  private readonly onFailure: ((failure: VoiceoverFailure) => void) | undefined;
  private readonly onStatusChange: ((status: VoiceoverStatus) => void) | undefined;
  private readonly objectUrls = new Set<string>();
  private audio: HTMLAudioElement | null = null;
  private activeAsset: VoiceoverAsset | null = null;
  private operationGeneration = 0;
  private disposed = false;
  private _status: VoiceoverStatus = 'idle';

  constructor(options: VoiceoverPlayerOptions = {}) {
    this.createAudio = options.createAudio ?? (() => new Audio());
    this.resolveAssetUrl = options.resolveAssetUrl ?? resolveDefaultAssetUrl;
    this.objectUrlApi = options.objectUrlApi ?? defaultObjectUrlApi();
    this.onFailure = options.onFailure;
    this.onStatusChange = options.onStatusChange;
  }

  get currentTime(): number {
    return this.audio?.currentTime ?? 0;
  }

  get status(): VoiceoverStatus {
    return this._status;
  }

  get asset(): VoiceoverAsset | null {
    return this.activeAsset;
  }

  /** Starts the supplied local asset from zero; a deliberate replay calls this method again. */
  start(asset: VoiceoverAsset): void {
    if (this.disposed) return;

    const audio = this.ensureAudio();
    const url = this.resolveAssetUrl(asset.file);
    const generation = ++this.operationGeneration;
    const hadActiveAsset = this.activeAsset !== null;
    this.activeAsset = asset;

    if (audio.src !== url) {
      if (hadActiveAsset) this.pauseAndReset(audio);
      audio.src = url;
      this.load(audio);
    }

    this.setCurrentTime(audio, 0);
    audio.volume = 1;
    this.setStatus('playing');

    try {
      const playResult = audio.play();
      void Promise.resolve(playResult).catch((error: unknown) => {
        if (
          this.disposed ||
          generation !== this.operationGeneration ||
          this.activeAsset !== asset
        ) {
          return;
        }
        this.pauseAndReset(audio);
        this.setStatus('fallback');
        this.onFailure?.({ asset, error: asError(error) });
      });
    } catch (error) {
      if (generation !== this.operationGeneration || this.disposed) return;
      this.pauseAndReset(audio);
      this.setStatus('fallback');
      this.onFailure?.({ asset, error: asError(error) });
    }
  }

  /** Stops immediately by default; repeated calls are intentionally no-ops. */
  stop(): void {
    if (this.disposed || this._status === 'idle' || this._status === 'stopped') return;
    this.operationGeneration += 1;
    if (this.audio) this.pauseAndReset(this.audio);
    this.setStatus('stopped');
  }

  seek(seconds: number): void {
    if (!this.audio || this.disposed) return;
    this.setCurrentTime(this.audio, Math.max(0, Number.isFinite(seconds) ? seconds : 0));
  }

  /** Creates an owned object URL for a future blob-backed source and releases it on dispose. */
  createObjectUrl(value: Blob): string {
    if (this.disposed) throw new Error('VoiceoverPlayer has been disposed.');
    if (!this.objectUrlApi) throw new Error('Object URLs are unavailable in this environment.');
    const url = this.objectUrlApi.createObjectURL(value);
    this.objectUrls.add(url);
    return url;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.operationGeneration += 1;

    if (this.audio) {
      this.audio.removeEventListener('ended', this.onEnded);
      this.pauseAndReset(this.audio);
      this.audio.removeAttribute('src');
      this.load(this.audio);
      this.audio = null;
    }

    for (const url of this.objectUrls) this.objectUrlApi?.revokeObjectURL(url);
    this.objectUrls.clear();
    this.activeAsset = null;
    this.setStatus('disposed');
  }

  private ensureAudio(): HTMLAudioElement {
    if (this.audio) return this.audio;
    const audio = this.createAudio();
    audio.preload = 'auto';
    audio.addEventListener('ended', this.onEnded);
    this.audio = audio;
    return audio;
  }

  private readonly onEnded = (): void => {
    if (!this.disposed) this.setStatus('stopped');
  };

  private pauseAndReset(audio: HTMLAudioElement): void {
    try {
      audio.pause();
    } catch {
      // Browser media implementations can reject pause during teardown; the owning state still
      // completes its cleanup and never exposes an error publicly.
    }
    this.setCurrentTime(audio, 0);
  }

  private setCurrentTime(audio: HTMLAudioElement, seconds: number): void {
    try {
      audio.currentTime = seconds;
    } catch {
      // Seeking before metadata is ready is harmless: a later start/replay resets it again.
    }
  }

  private load(audio: HTMLAudioElement): void {
    try {
      audio.load();
    } catch {
      // jsdom and a few constrained kiosk codecs throw here; `play()` failure is handled safely.
    }
  }

  private setStatus(status: VoiceoverStatus): void {
    if (this._status === status) return;
    this._status = status;
    this.onStatusChange?.(status);
  }
}
