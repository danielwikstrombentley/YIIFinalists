// Preload manager skeleton (T017, FR-030): "on preview — warm the previewed project's Cesium
// target and landing assets; on landing — preload all active option media/voiceover". Real asset
// warming needs the renderer/media adapters (PH3+); this skeleton tracks *what* should be
// preloaded so those adapters have a ready-made request list to act on without redesigning this
// module.

export type PreloadKind = 'project-landing' | 'option-media' | 'option-voiceover';

export interface PreloadTarget {
  kind: PreloadKind;
  ref: string;
}

export type PreloadWork<T> = (signal: AbortSignal) => Promise<T>;

interface PreloadEntry {
  controller: AbortController;
  promise: Promise<unknown>;
}

export class PreloadManager {
  private readonly requested = new Set<string>();
  private readonly entries = new Map<string, PreloadEntry>();

  private key(target: PreloadTarget): string {
    return `${target.kind}:${target.ref}`;
  }

  request(target: PreloadTarget): void {
    this.requested.add(this.key(target));
  }

  /**
   * Decodes a target at most once while retained. Repeated callers receive the same in-flight or
   * resolved promise, preserving R14's decode-once reuse policy without a second asset fetch.
   */
  preload<T>(target: PreloadTarget, work: PreloadWork<T>): Promise<T> {
    const key = this.key(target);
    this.requested.add(key);
    const existing = this.entries.get(key);
    if (existing) return existing.promise as Promise<T>;

    const controller = new AbortController();
    const promise = Promise.resolve().then(() => work(controller.signal));
    const entry: PreloadEntry = { controller, promise };
    this.entries.set(key, entry);
    void promise.catch(() => {
      // Failed/cancelled entries must not poison later deliberate retry attempts.
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
    return promise;
  }

  /** Cancels one no-longer-relevant preload, for example after a hover retarget. */
  cancel(target: PreloadTarget): void {
    const key = this.key(target);
    const entry = this.entries.get(key);
    this.entries.delete(key);
    this.requested.delete(key);
    entry?.controller.abort();
  }

  isRequested(target: PreloadTarget): boolean {
    return this.requested.has(this.key(target));
  }

  clear(): void {
    for (const entry of this.entries.values()) entry.controller.abort();
    this.entries.clear();
    this.requested.clear();
  }

  get size(): number {
    return this.requested.size;
  }
}
