import type { PreviewHoverPayload } from '@yii/semantic-actions';

// Ordering (contract boundary rule 4): "actions are processed in arrival order per source; a
// newer preview.hover supersedes an unprocessed older one (retarget, never queue)". Processing
// here is synchronous (no queue), so "supersession" is realised as: a `preview.hover` whose
// `sentAt` is older than the last-processed `preview.hover` FROM THE SAME SOURCE is a late
// arrival that has already been superseded, and is dropped.

export class HoverOrdering {
  private lastSentAtBySource = new Map<string, number>();

  /** True if a hover has not been superseded by a previously accepted newer hover. */
  canProcess(source: string, sentAtMs: number): boolean {
    const lastSentAt = this.lastSentAtBySource.get(source);
    return lastSentAt === undefined || sentAtMs >= lastSentAt;
  }

  /** Records a hover only after every boundary gate accepts it. */
  recordAccepted(source: string, sentAtMs: number): void {
    this.lastSentAtBySource.set(source, sentAtMs);
  }

  /** Backward-compatible check-and-record helper for callers that have no later rejection gates. */
  shouldProcess(source: string, sentAtMs: number): boolean {
    if (!this.canProcess(source, sentAtMs)) return false;
    this.recordAccepted(source, sentAtMs);
    return true;
  }

  reset(): void {
    this.lastSentAtBySource.clear();
  }
}

export function isDirectionHover(
  payload: PreviewHoverPayload,
): payload is { direction: 'next' | 'prev' } {
  return 'direction' in payload;
}
