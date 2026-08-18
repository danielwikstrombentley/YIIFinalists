import { describe, expect, it, vi } from 'vitest';
import { InputBoundary } from '../../src/input/boundary.js';
import {
  TelemetryLogger,
  validateTelemetryEvent,
  type TelemetryFetch,
} from '../../src/telemetry/TelemetryLogger.js';

function envelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    type: 'nav.idle',
    payload: {},
    source: 'console',
    sentAt: '2026-08-18T12:00:00.000Z',
    ...overrides,
  };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

function createFetch(
  implementation: (input: string, init?: RequestInit) => PromiseLike<{ ok: boolean }>,
): TelemetryFetch {
  return implementation;
}

describe('validateTelemetryEvent()', () => {
  const validEvent = {
    v: 1,
    ts: '2026-08-18T12:00:00.000Z',
    sessionId: 'boot-uuid',
    seq: 0,
    kind: 'content' as const,
    stateBefore: 'projectLanding',
    stateAfter: 'contentPlaying',
    refs: { categoryId: 'roads', projectId: 'p-017', position: 2 },
    latencyMs: 87,
    detail: {},
  };

  it('accepts the complete FR-038 envelope and supported event kinds', () => {
    for (const kind of [
      'start',
      'reset',
      'connect',
      'disconnect',
      'category',
      'preview',
      'select',
      'content',
      'replay',
      'interrupt',
      'return',
      'mediaFailure',
      'assetFailure',
      'rendererFailure',
      'recovery',
    ]) {
      const result = validateTelemetryEvent({ ...validEvent, kind });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid versions, timestamps, sequence values, kinds, and extra fields', () => {
    expect(validateTelemetryEvent({ ...validEvent, v: 2 }).success).toBe(false);
    expect(validateTelemetryEvent({ ...validEvent, ts: 'not-a-date' }).success).toBe(false);
    expect(validateTelemetryEvent({ ...validEvent, seq: -1 }).success).toBe(false);
    expect(validateTelemetryEvent({ ...validEvent, kind: 'unknown' }).success).toBe(false);
    expect(validateTelemetryEvent({ ...validEvent, unexpected: true }).success).toBe(false);
    expect(validateTelemetryEvent({ ...validEvent, latencyMs: -1 }).success).toBe(false);
  });
});

describe('TelemetryLogger ring and delivery', () => {
  it('drops the oldest events silently and exposes only the counter to diagnostics', () => {
    const onDropped = vi.fn();
    const logger = new TelemetryLogger({
      capacity: 2,
      autoFlush: false,
      sessionId: 'session',
      onDropped,
    });

    logger.record({ kind: 'start' });
    logger.record({ kind: 'category', detail: { value: 2 } });
    logger.record({ kind: 'select', detail: { value: 3 } });

    expect(logger.pendingCount).toBe(2);
    expect(logger.telemetryDropped).toBe(1);
    expect(onDropped).toHaveBeenCalledWith(1);
    expect(logger.getPendingEvents().map((event) => event.seq)).toEqual([1, 2]);
  });

  it('batches events and retries a failed sink with backoff', async () => {
    vi.useFakeTimers();
    try {
      const requests: RequestInit[] = [];
      let attempts = 0;
      const fetchImpl = createFetch((_input, init) => {
        attempts += 1;
        requests.push(init ?? {});
        return Promise.resolve({ ok: attempts > 1 });
      });
      const logger = new TelemetryLogger({
        sessionId: 'session',
        autoFlush: false,
        batchSize: 2,
        retryBaseDelayMs: 20,
        retryMaxDelayMs: 40,
        fetchImpl,
      });

      logger.record({ kind: 'category' });
      logger.record({ kind: 'preview' });
      logger.record({ kind: 'select' });
      logger.flush();
      await flushMicrotasks();

      expect(attempts).toBe(1);
      expect(JSON.parse(String(requests[0]?.body))).toHaveLength(2);
      // The failed first batch is re-queued ahead of the unsent third event until retry.
      expect(logger.pendingCount).toBe(3);

      vi.advanceTimersByTime(19);
      expect(attempts).toBe(1);
      vi.advanceTimersByTime(1);
      await flushMicrotasks();
      expect(attempts).toBe(2);
      expect(logger.pendingCount).toBe(1);

      logger.flush();
      await flushMicrotasks();
      expect(attempts).toBe(3);
      expect(logger.pendingCount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('TelemetryLogger failure injection', () => {
  it('does not wait for a slow sink before returning from record or input dispatch', async () => {
    let resolveRequest: ((value: { ok: boolean }) => void) | undefined;
    const fetchImpl = createFetch(
      () =>
        new Promise<{ ok: boolean }>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const logger = new TelemetryLogger({ sessionId: 'session', fetchImpl });
    const accepted = vi.fn();
    const boundary = new InputBoundary({
      onAccepted: (action) => accepted(action),
      onObservation: (observation) => logger.observeInputObservation(observation),
      now: () => 1_000,
    });

    const startedAt = performance.now();
    boundary.handle(envelope());
    const elapsedMs = performance.now() - startedAt;

    expect(accepted).toHaveBeenCalledTimes(1);
    expect(elapsedMs).toBeLessThan(50);
    expect(logger.pendingCount).toBe(1);

    resolveRequest?.({ ok: true });
    await flushMicrotasks();
  });

  it('keeps input handling immediate when the sink throws synchronously', () => {
    const logger = new TelemetryLogger({
      sessionId: 'session',
      autoFlush: false,
      fetchImpl: () => {
        throw new Error('sink unavailable');
      },
    });
    const accepted = vi.fn();
    const boundary = new InputBoundary({
      onAccepted: (action) => accepted(action),
      onObservation: (observation) => logger.observeInputObservation(observation),
    });

    expect(() => boundary.handle(envelope())).not.toThrow();
    expect(accepted).toHaveBeenCalledTimes(1);
    expect(() => logger.flush()).not.toThrow();
    expect(logger.pendingCount).toBe(1);
    logger.dispose();
  });
});

describe('InputBoundary telemetry observation', () => {
  it('preserves accepted dispatch and emits a passive response receipt after it', () => {
    const observations: string[] = [];
    const accepted = vi.fn();
    const boundary = new InputBoundary({
      onAccepted: (action) => {
        accepted(action);
        observations.push('dispatch');
      },
      onObservation: (observation) => {
        if (observation.kind === 'accepted') observations.push('accepted');
        if (observation.kind === 'response') observations.push('response');
      },
    });

    boundary.handle(envelope());

    expect(accepted).toHaveBeenCalledTimes(1);
    expect(observations).toEqual(['accepted', 'dispatch', 'response']);
  });
});
