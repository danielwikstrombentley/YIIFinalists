import { describe, expect, it, vi } from 'vitest';
import { InputBoundary } from '../../src/input/boundary.js';

// Contract: contracts/semantic-input.md boundary rules 1-6 + FR-020 (1000ms dedup) + SC-005 input
// classes. MUST be red until T013 lands.

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    v: 1,
    type: 'nav.idle',
    payload: {},
    source: 'console',
    sentAt: '2026-08-03T12:00:00.000Z',
    ...overrides,
  };
}

describe('Deduplication (boundary rule 2, FR-020)', () => {
  it('drops an identical action arriving within 1000ms of the previously accepted one', () => {
    let now = 0;
    const onAccepted = vi.fn();
    const boundary = new InputBoundary({ now: () => now, onAccepted });

    boundary.handle(envelope({ type: 'content.select', payload: { position: 2 } }));
    now = 500;
    boundary.handle(envelope({ type: 'content.select', payload: { position: 2 } }));

    expect(onAccepted).toHaveBeenCalledTimes(1);
  });

  it('honours an identical action arriving after 1000ms (replay/re-entry semantics)', () => {
    let now = 0;
    const onAccepted = vi.fn();
    const boundary = new InputBoundary({ now: () => now, onAccepted });

    boundary.handle(envelope({ type: 'content.select', payload: { position: 2 } }));
    now = 1001;
    boundary.handle(envelope({ type: 'content.select', payload: { position: 2 } }));

    expect(onAccepted).toHaveBeenCalledTimes(2);
  });

  it('does not dedupe two different actions of the same type', () => {
    let now = 0;
    const onAccepted = vi.fn();
    const boundary = new InputBoundary({ now: () => now, onAccepted });

    boundary.handle(envelope({ type: 'content.select', payload: { position: 1 } }));
    now = 100;
    boundary.handle(envelope({ type: 'content.select', payload: { position: 2 } }));

    expect(onAccepted).toHaveBeenCalledTimes(2);
  });
});

describe('Validation (boundary rule 1)', () => {
  it('rejects a malformed envelope safely (no throw, no accept)', () => {
    const onAccepted = vi.fn();
    const onRejected = vi.fn();
    const boundary = new InputBoundary({ onAccepted, onRejected });

    expect(() => boundary.handle({ not: 'an envelope' })).not.toThrow();
    expect(onAccepted).not.toHaveBeenCalled();
    expect(onRejected).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown category id against the active release', () => {
    const onAccepted = vi.fn();
    const onRejected = vi.fn();
    const boundary = new InputBoundary({
      onAccepted,
      onRejected,
      releaseValidator: {
        hasCategory: () => false,
        hasProject: () => true,
        hasContentPosition: () => true,
      },
    });

    boundary.handle(
      envelope({ type: 'category.select', payload: { categoryId: 'does-not-exist' } }),
    );
    expect(onAccepted).not.toHaveBeenCalled();
    expect(onRejected).toHaveBeenCalledTimes(1);
  });

  it('accepts a known category id against the active release', () => {
    const onAccepted = vi.fn();
    const boundary = new InputBoundary({
      onAccepted,
      releaseValidator: {
        hasCategory: () => true,
        hasProject: () => true,
        hasContentPosition: () => true,
      },
    });

    boundary.handle(envelope({ type: 'category.select', payload: { categoryId: 'cat-1' } }));
    expect(onAccepted).toHaveBeenCalledTimes(1);
  });
});

describe('Priority gate (boundary rule 3)', () => {
  it('lets a higher-priority action pass during an exclusive window', () => {
    const onAccepted = vi.fn();
    const boundary = new InputBoundary({
      onAccepted,
      // project.select (3) holds the window; operator.reset (7) outranks it.
      getExclusivePriority: () => 3,
    });

    boundary.handle(envelope({ type: 'operator.reset', payload: {}, source: 'operator' }));
    expect(onAccepted).toHaveBeenCalledTimes(1);
  });

  it('rejects an equal-or-lower priority action during an exclusive window', () => {
    const onAccepted = vi.fn();
    const onRejected = vi.fn();
    const boundary = new InputBoundary({
      onAccepted,
      onRejected,
      getExclusivePriority: () => 3,
    });

    boundary.handle(envelope({ type: 'preview.hover', payload: { direction: 'next' } }));
    expect(onAccepted).not.toHaveBeenCalled();
    expect(onRejected).toHaveBeenCalledTimes(1);
  });

  it('has no gating effect when no exclusive window is active', () => {
    const onAccepted = vi.fn();
    const boundary = new InputBoundary({ onAccepted });

    boundary.handle(envelope({ type: 'preview.hover', payload: { direction: 'next' } }));
    expect(onAccepted).toHaveBeenCalledTimes(1);
  });
});

describe('Ordering (boundary rule 4): newer preview.hover supersedes an unprocessed older one', () => {
  it('drops a late-arriving (older sentAt) preview.hover from the same source after a newer one', () => {
    const onAccepted = vi.fn();
    const boundary = new InputBoundary({ onAccepted });

    boundary.handle(
      envelope({
        type: 'preview.hover',
        payload: { direction: 'next' },
        sentAt: '2026-08-03T12:00:01.000Z',
      }),
    );
    boundary.handle(
      envelope({
        type: 'preview.hover',
        payload: { direction: 'prev' },
        sentAt: '2026-08-03T12:00:00.000Z',
      }),
    );

    expect(onAccepted).toHaveBeenCalledTimes(1);
    expect(onAccepted).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { direction: 'next' } }),
    );
  });

  it('does not apply hover-supersession ordering across different sources', () => {
    const onAccepted = vi.fn();
    const boundary = new InputBoundary({ onAccepted });

    boundary.handle(
      envelope({
        type: 'preview.hover',
        payload: { direction: 'next' },
        source: 'console',
        sentAt: '2026-08-03T12:00:01.000Z',
      }),
    );
    boundary.handle(
      envelope({
        type: 'preview.hover',
        payload: { direction: 'prev' },
        source: 'simulator',
        sentAt: '2026-08-03T12:00:00.000Z',
      }),
    );

    expect(onAccepted).toHaveBeenCalledTimes(2);
  });
});

describe('Operator gating (boundary rule 5)', () => {
  it('rejects operator.reset from the console source', () => {
    const onAccepted = vi.fn();
    const onRejected = vi.fn();
    const boundary = new InputBoundary({ onAccepted, onRejected });

    boundary.handle(envelope({ type: 'operator.reset', payload: {}, source: 'console' }));
    expect(onAccepted).not.toHaveBeenCalled();
    expect(onRejected).toHaveBeenCalledTimes(1);
  });

  it('accepts operator.reset from the simulator source', () => {
    const onAccepted = vi.fn();
    const boundary = new InputBoundary({ onAccepted });

    boundary.handle(envelope({ type: 'operator.reset', payload: {}, source: 'simulator' }));
    expect(onAccepted).toHaveBeenCalledTimes(1);
  });
});

describe('Connection monitoring (boundary rule 6)', () => {
  it('never forwards connection.status to onAccepted (machine-bound)', () => {
    const onAccepted = vi.fn();
    const onConnectionStatus = vi.fn();
    const boundary = new InputBoundary({ onAccepted, onConnectionStatus });

    boundary.handle(
      envelope({
        type: 'connection.status',
        payload: { connected: true, transportId: 'ws-1' },
        source: 'simulator',
      }),
    );

    expect(onAccepted).not.toHaveBeenCalled();
    expect(onConnectionStatus).toHaveBeenCalledWith({ connected: true, transportId: 'ws-1' });
  });

  it('resets dedup state on reconnect (an identical action within 1000ms of before reconnect is honoured)', () => {
    let now = 0;
    const onAccepted = vi.fn();
    const boundary = new InputBoundary({ now: () => now, onAccepted });

    boundary.handle(envelope({ type: 'content.select', payload: { position: 2 } }));
    now = 200;
    boundary.notifyReconnect();
    boundary.handle(envelope({ type: 'content.select', payload: { position: 2 } }));

    expect(onAccepted).toHaveBeenCalledTimes(2);
  });
});
