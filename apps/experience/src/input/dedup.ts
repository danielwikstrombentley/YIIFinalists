// Deduplication (contract boundary rule 2, FR-020): identical `(type, payload)` within 1000ms of
// the previously *accepted* identical action is dropped. After 1000ms an identical action is
// deliberate (replay/re-entry) and must be honoured — enforced by the machine's `reenter: true`
// self-transitions (T011), not by this module (this module only decides accept/drop).

export const DEDUP_WINDOW_MS = 1000;

export class DedupWindow {
  private readonly windowMs: number;
  private readonly now: () => number;
  private lastAcceptedAt = new Map<string, number>();

  constructor(options: { windowMs?: number; now?: () => number } = {}) {
    this.windowMs = options.windowMs ?? DEDUP_WINDOW_MS;
    this.now = options.now ?? Date.now;
  }

  /** Returns true (and records `key` as accepted now) if `key` is NOT a duplicate within the window. */
  accept(key: string): boolean {
    const now = this.now();
    const lastAt = this.lastAcceptedAt.get(key);
    if (lastAt !== undefined && now - lastAt < this.windowMs) {
      return false;
    }
    this.lastAcceptedAt.set(key, now);
    return true;
  }

  /** Boundary rule 6: "reconnect resumes input handling with dedup state reset". */
  reset(): void {
    this.lastAcceptedAt.clear();
  }
}
