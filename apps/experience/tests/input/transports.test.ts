import { describe, expect, it, vi } from 'vitest';
import { InputBoundary } from '../../src/input/boundary.js';
import { SimulatorTransport } from '../../src/input/transports/simulator.js';
import type { WebSocketLike } from '../../src/input/transports/websocket.js';
import { WebSocketTransport } from '../../src/input/transports/websocket.js';

// T014 Tests: liveness reporting, wire-format mapping, simulator failure injections reach the
// boundary unaltered.

describe('WebSocketTransport', () => {
  function createFakeSocket(): WebSocketLike & { sent: string[] } {
    return {
      readyState: 1,
      sent: [] as string[],
      send(data: string) {
        this.sent.push(data);
      },
      close() {
        this.onclose?.();
      },
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
    };
  }

  it('reports liveness through connect/disconnect', () => {
    let fakeSocket: ReturnType<typeof createFakeSocket>;
    const transport = new WebSocketTransport('ws://localhost:9999', {
      createSocket: () => {
        fakeSocket = createFakeSocket();
        return fakeSocket;
      },
    });
    const statuses: string[] = [];
    transport.onStatusChange((status) => statuses.push(status));

    transport.connect();
    expect(transport.isConnected()).toBe(false); // connecting, not yet open
    fakeSocket!.onopen?.();
    expect(transport.isConnected()).toBe(true);

    transport.disconnect();
    expect(transport.isConnected()).toBe(false);
    expect(statuses).toEqual(['connecting', 'connected', 'disconnected']);
  });

  it('maps incoming wire-format JSON text to a raw object for onMessage', () => {
    let fakeSocket: ReturnType<typeof createFakeSocket>;
    const transport = new WebSocketTransport('ws://localhost:9999', {
      createSocket: () => {
        fakeSocket = createFakeSocket();
        return fakeSocket;
      },
    });
    const onMessage = vi.fn();
    transport.onMessage(onMessage);
    transport.connect();
    fakeSocket!.onopen?.();

    const wireMessage = {
      v: 1,
      type: 'nav.idle',
      payload: {},
      source: 'console',
      sentAt: '2026-08-03T12:00:00.000Z',
    };
    fakeSocket!.onmessage?.({ data: JSON.stringify(wireMessage) });

    expect(onMessage).toHaveBeenCalledWith(wireMessage);
  });

  it('drops non-JSON incoming messages without throwing', () => {
    let fakeSocket: ReturnType<typeof createFakeSocket>;
    const transport = new WebSocketTransport('ws://localhost:9999', {
      createSocket: () => {
        fakeSocket = createFakeSocket();
        return fakeSocket;
      },
    });
    const onMessage = vi.fn();
    transport.onMessage(onMessage);
    transport.connect();

    expect(() => fakeSocket!.onmessage?.({ data: 'not json' })).not.toThrow();
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('emits outgoing messages as JSON only while connected', () => {
    let fakeSocket: ReturnType<typeof createFakeSocket> | undefined;
    const transport = new WebSocketTransport('ws://localhost:9999', {
      createSocket: () => {
        fakeSocket = createFakeSocket();
        return fakeSocket;
      },
    });
    transport.emit({ hello: 'too-early' });
    expect(fakeSocket).toBeUndefined();

    transport.connect();
    fakeSocket!.onopen?.();
    transport.emit({ hello: 'world' });
    expect(fakeSocket!.sent).toEqual([JSON.stringify({ hello: 'world' })]);
  });
});

describe('SimulatorTransport failure injections reach the boundary unaltered', () => {
  it('injectDuplicateBurst: only the first of a burst is accepted', () => {
    const onAccepted = vi.fn();
    const boundary = new InputBoundary({ onAccepted });
    const simulator = new SimulatorTransport();
    simulator.onMessage((raw) => boundary.handle(raw));

    simulator.injectDuplicateBurst('content.select', { position: 1 }, 4, 100);

    expect(onAccepted).toHaveBeenCalledTimes(1);
  });

  it('injectDeliberateRepeat: both the original and the delayed repeat are accepted', () => {
    // The boundary's dedup window is measured against real processing time (its own injectable
    // clock, defaulting to Date.now()) rather than the envelope's self-reported `sentAt` — fake
    // timers let this synchronous test still exercise a genuine >1000ms gap between deliveries.
    vi.useFakeTimers();
    try {
      const onAccepted = vi.fn();
      const boundary = new InputBoundary({ onAccepted });
      const simulator = new SimulatorTransport();
      simulator.onMessage((raw) => boundary.handle(raw));

      simulator.injectAction('content.select', { position: 1 });
      vi.advanceTimersByTime(1100);
      simulator.injectAction('content.select', { position: 1 });

      expect(onAccepted).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('injectInvalidId: rejected by the boundary, never accepted', () => {
    const onAccepted = vi.fn();
    const onRejected = vi.fn();
    const boundary = new InputBoundary({ onAccepted, onRejected });
    const simulator = new SimulatorTransport();
    simulator.onMessage((raw) => boundary.handle(raw));

    simulator.injectInvalidId();

    expect(onAccepted).not.toHaveBeenCalled();
    expect(onRejected).toHaveBeenCalledWith('invalid-envelope', expect.anything());
  });

  it('injectUnknownType: rejected by the boundary, never accepted', () => {
    const onAccepted = vi.fn();
    const onRejected = vi.fn();
    const boundary = new InputBoundary({ onAccepted, onRejected });
    const simulator = new SimulatorTransport();
    simulator.onMessage((raw) => boundary.handle(raw));

    simulator.injectUnknownType();

    expect(onAccepted).not.toHaveBeenCalled();
    expect(onRejected).toHaveBeenCalledWith('invalid-envelope', expect.anything());
  });

  it('injectRapidHoverStream: every hover reaches the boundary unaltered (raw fidelity)', () => {
    const rawReceived: unknown[] = [];
    const simulator = new SimulatorTransport({ now: () => 0 });
    simulator.onMessage((raw) => rawReceived.push(raw));

    simulator.injectRapidHoverStream(6, 20);

    expect(rawReceived).toHaveLength(6);
    expect(
      rawReceived.map((raw) => (raw as { payload: { direction: string } }).payload.direction),
    ).toEqual(['next', 'prev', 'next', 'prev', 'next', 'prev']);
    // sentAt strictly increases by the requested interval — nothing reordered or dropped in transit.
    const sentAts = rawReceived.map((raw) => Date.parse((raw as { sentAt: string }).sentAt));
    expect(sentAts).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it('injectRapidHoverStream: dedup legitimately collapses same-value repeats faster than 1000ms apart', () => {
    // A rapid alternating stream still has each *value* (next/prev) recurring well inside the
    // 1000ms window — FR-020 correctly dedupes those recurrences; this is expected behaviour, not
    // a defect. Only the first occurrence of each alternating value is accepted here.
    vi.useFakeTimers();
    try {
      const onAccepted = vi.fn();
      const boundary = new InputBoundary({ onAccepted });
      const simulator = new SimulatorTransport();
      simulator.onMessage((raw) => boundary.handle(raw));

      for (let i = 0; i < 6; i += 1) {
        simulator.injectAction('preview.hover', { direction: i % 2 === 0 ? 'next' : 'prev' });
        vi.advanceTimersByTime(20);
      }

      expect(onAccepted).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('simulateDisconnectReconnect: liveness observed by connection-status subscribers', () => {
    const statuses: string[] = [];
    const simulator = new SimulatorTransport();
    simulator.onStatusChange((status) => statuses.push(status));

    simulator.connect();
    simulator.simulateDisconnectReconnect();

    expect(statuses).toEqual(['connected', 'disconnected', 'connected']);
  });
});
