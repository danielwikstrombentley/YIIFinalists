import type { MediaAsset } from '@yii/content-schema';
import type { ObjectUrlApi } from './VoiceoverPlayer.js';

export interface VideoSurfaceFallback {
  from: MediaAsset;
  to: MediaAsset;
  error: Error;
}

export interface VideoStartOptions {
  fallback?: MediaAsset;
  posterUrl?: string;
  waitForCanPlay?: boolean;
}

export interface VideoSurfaceOptions {
  createVideo?: () => HTMLVideoElement;
  resolveAssetUrl?: (packageRelativePath: string) => string;
  objectUrlApi?: ObjectUrlApi;
  onFallback?: (fallback: VideoSurfaceFallback) => void;
}

interface VideoSlot {
  asset: MediaAsset;
  element: HTMLVideoElement;
  fallback: MediaAsset | undefined;
  onCanPlay: (() => void) | null;
  onError: () => void;
  posterUrl: string | undefined;
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
 * Owns at most one decoding video and one pending preload (R14). It never removes an active
 * element during a declared fallback swap, preserving its poster instead of exposing a blank.
 */
export class VideoSurface {
  private readonly createVideo: () => HTMLVideoElement;
  private readonly resolveAssetUrl: (packageRelativePath: string) => string;
  private readonly objectUrlApi: ObjectUrlApi | undefined;
  private readonly onFallback: ((fallback: VideoSurfaceFallback) => void) | undefined;
  private readonly objectUrls = new Set<string>();
  private active: VideoSlot | null = null;
  private preloading: VideoSlot | null = null;
  private disposed = false;

  constructor(options: VideoSurfaceOptions = {}) {
    this.createVideo = options.createVideo ?? (() => document.createElement('video'));
    this.resolveAssetUrl = options.resolveAssetUrl ?? resolveDefaultAssetUrl;
    this.objectUrlApi = options.objectUrlApi ?? defaultObjectUrlApi();
    this.onFallback = options.onFallback;
  }

  get activeAssetId(): string | null {
    return this.active?.asset.id ?? null;
  }

  get preloadedAssetId(): string | null {
    return this.preloading?.asset.id ?? null;
  }

  get activeElement(): HTMLVideoElement | null {
    return this.active?.element ?? null;
  }

  get currentTime(): number {
    return this.active?.element.currentTime ?? 0;
  }

  get decodingCount(): number {
    return this.active ? 1 : 0;
  }

  get preloadingCount(): number {
    return this.preloading ? 1 : 0;
  }

  /** Stages one latest likely-next source without decoding it yet. */
  preload(asset: MediaAsset, options: Pick<VideoStartOptions, 'posterUrl'> = {}): void {
    if (
      this.disposed ||
      this.preloading?.asset.id === asset.id ||
      this.active?.asset.id === asset.id
    ) {
      return;
    }
    this.releasePreloading();
    const slot = this.createSlot(asset, undefined, options.posterUrl);
    slot.element.preload = 'auto';
    slot.element.muted = true;
    this.preloading = slot;
  }

  /** Activates a source immediately or after `canplay`, reusing a matching staged preload. */
  start(asset: MediaAsset, options: VideoStartOptions = {}): { cancel(): void } {
    if (this.disposed) return { cancel() {} };

    let slot: VideoSlot;
    if (this.preloading?.asset.id === asset.id) {
      slot = this.preloading;
      this.preloading = null;
      slot.fallback = options.fallback;
      if (options.posterUrl) {
        slot.posterUrl = options.posterUrl;
        slot.element.poster = options.posterUrl;
      }
    } else if (this.active?.asset.id === asset.id) {
      slot = this.active;
      slot.fallback = options.fallback;
    } else {
      this.releaseActive();
      slot = this.createSlot(asset, options.fallback, options.posterUrl);
    }

    this.active = slot;
    slot.element.preload = 'auto';
    if (options.waitForCanPlay) {
      this.waitForCanPlay(slot);
    } else {
      this.play(slot);
    }

    return {
      cancel: () => {
        if (this.active === slot) this.releaseActive();
      },
    };
  }

  stop(): void {
    if (!this.active) return;
    this.pauseAndReset(this.active.element);
  }

  /** Timebase-owned seek; inactive/preload-only surfaces stay safely unchanged. */
  seek(seconds: number): void {
    const element = this.active?.element;
    if (!element) return;
    try {
      element.currentTime = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    } catch {
      // Some browser codecs reject a seek before metadata; the next clock tick retries safely.
    }
  }

  createObjectUrl(value: Blob): string {
    if (this.disposed) throw new Error('VideoSurface has been disposed.');
    if (!this.objectUrlApi) throw new Error('Object URLs are unavailable in this environment.');
    const url = this.objectUrlApi.createObjectURL(value);
    this.objectUrls.add(url);
    return url;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseActive();
    this.releasePreloading();
    for (const url of this.objectUrls) this.objectUrlApi?.revokeObjectURL(url);
    this.objectUrls.clear();
  }

  private createSlot(
    asset: MediaAsset,
    fallback: MediaAsset | undefined,
    posterUrl: string | undefined,
  ): VideoSlot {
    const element = this.createVideo();
    const slot: VideoSlot = {
      asset,
      element,
      fallback,
      onCanPlay: null,
      onError: () => this.handleFailure(slot, new Error(`Video asset "${slot.asset.id}" failed.`)),
      posterUrl,
    };
    this.configure(slot, asset);
    element.addEventListener('error', slot.onError);
    return slot;
  }

  private configure(slot: VideoSlot, asset: MediaAsset): void {
    slot.asset = asset;
    slot.element.src = this.resolveAssetUrl(asset.file);
    if (slot.posterUrl) slot.element.poster = slot.posterUrl;
    this.load(slot.element);
  }

  private waitForCanPlay(slot: VideoSlot): void {
    slot.onCanPlay?.();
    const onCanPlay = (): void => {
      slot.element.removeEventListener('canplay', onCanPlay);
      slot.onCanPlay = null;
      if (this.active === slot) this.play(slot);
    };
    slot.onCanPlay = onCanPlay;
    slot.element.addEventListener('canplay', onCanPlay);
  }

  private play(slot: VideoSlot): void {
    if (this.active !== slot || this.disposed) return;
    try {
      const result = slot.element.play();
      void Promise.resolve(result).catch((error: unknown) => {
        if (this.active === slot && !this.disposed) this.handleFailure(slot, asError(error));
      });
    } catch (error) {
      this.handleFailure(slot, asError(error));
    }
  }

  private handleFailure(slot: VideoSlot, error: Error): void {
    if (this.active !== slot || this.disposed) return;
    const fallback = slot.fallback;
    if (!fallback || fallback.id === slot.asset.id) return;

    const failedAsset = slot.asset;
    slot.fallback = undefined;
    // Preserve the owned DOM surface (and its poster) while loading the replacement source.
    this.configure(slot, fallback);
    this.onFallback?.({ from: failedAsset, to: fallback, error });
    this.play(slot);
  }

  private releaseActive(): void {
    if (!this.active) return;
    this.releaseSlot(this.active);
    this.active = null;
  }

  private releasePreloading(): void {
    if (!this.preloading) return;
    this.releaseSlot(this.preloading);
    this.preloading = null;
  }

  private releaseSlot(slot: VideoSlot): void {
    if (slot.onCanPlay) slot.element.removeEventListener('canplay', slot.onCanPlay);
    slot.element.removeEventListener('error', slot.onError);
    this.pauseAndReset(slot.element);
    slot.element.removeAttribute('src');
    this.load(slot.element);
  }

  private pauseAndReset(element: HTMLVideoElement): void {
    try {
      element.pause();
    } catch {
      // Media teardown must stay idempotent even if the browser has already detached the source.
    }
    try {
      element.currentTime = 0;
    } catch {
      // Seeking before metadata has loaded is harmless during cancellation and disposal.
    }
  }

  private load(element: HTMLVideoElement): void {
    try {
      element.load();
    } catch {
      // Playback rejection is contained by `play()` and routes to the declared fallback.
    }
  }
}
