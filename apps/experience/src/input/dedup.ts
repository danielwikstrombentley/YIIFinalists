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

  /** Returns true when `key` is not a duplicate within the window, without mutating acceptance state. */
  isAccepted(key: string): boolean {
    const now = this.now();
    const lastAt = this.lastAcceptedAt.get(key);
    return lastAt === undefined || now - lastAt >= this.windowMs;
  }

  /** Records an action only after every boundary gate has accepted it. */
  recordAccepted(key: string): void {
    this.lastAcceptedAt.set(key, this.now());
  }

  /** Backward-compatible check-and-record helper for callers that have no later rejection gates. */
  accept(key: string): boolean {
    if (!this.isAccepted(key)) return false;
    this.recordAccepted(key);
    return true;
  }

  /** Boundary rule 6: "reconnect resumes input handling with dedup state reset". */
  reset(): void {
    this.lastAcceptedAt.clear();
  }
}
