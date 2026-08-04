import type { PreviewHoverPayload } from '@yii/semantic-actions';

// Ordering (contract boundary rule 4): "actions are processed in arrival order per source; a
// newer preview.hover supersedes an unprocessed older one (retarget, never queue)". Processing
// here is synchronous (no queue), so "supersession" is realised as: a `preview.hover` whose
// `sentAt` is older than the last-processed `preview.hover` FROM THE SAME SOURCE is a late
// arrival that has already been superseded, and is dropped.

export class HoverOrdering {
  private lastSentAtBySource = new Map<string, number>();

  /** True if this hover should be processed; false if a newer one from the same source already won. */
  shouldProcess(source: string, sentAtMs: number): boolean {
    const lastSentAt = this.lastSentAtBySource.get(source);
    if (lastSentAt !== undefined && sentAtMs < lastSentAt) {
      return false;
    }
    this.lastSentAtBySource.set(source, sentAtMs);
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
