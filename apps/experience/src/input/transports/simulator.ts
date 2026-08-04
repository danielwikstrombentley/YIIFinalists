import {
  Transport,
  TransportEventHub,
  type TransportStatus,
  type Unsubscribe,
} from './transport.js';

// In-process simulator transport (T014, research.md R7): the hidden operator simulator's headless
// core. Used directly by tests now and by the operator UI in T052. Every injection method builds
// a v1 wire envelope and delivers it exactly as a real transport would — zero navigation logic;
// the input boundary decides accept/reject.

export interface SimulatorEnvelopeOverrides {
  source?: 'console' | 'simulator' | 'operator';
  sentAt?: string;
  msgId?: string;
}

export class SimulatorTransport implements Transport {
  readonly id: string;
  private readonly hub = new TransportEventHub();
  private readonly now: () => number;
  private connected = false;

  constructor(options: { id?: string; now?: () => number } = {}) {
    this.id = options.id ?? 'simulator';
    this.now = options.now ?? Date.now;
  }

  connect(): void {
    this.connected = true;
    this.hub.emitStatus('connected');
  }

  disconnect(): void {
    this.connected = false;
    this.hub.emitStatus('disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  onMessage(handler: (raw: unknown) => void): Unsubscribe {
    return this.hub.onMessage(handler);
  }

  onStatusChange(handler: (status: TransportStatus) => void): Unsubscribe {
    return this.hub.onStatusChange(handler);
  }

  /** Delivers a raw wire-format message as if it had arrived over the wire. */
  emit(raw: unknown): void {
    this.hub.emitMessage(raw);
  }

  private buildEnvelope(
    type: string,
    payload: unknown,
    overrides: SimulatorEnvelopeOverrides = {},
  ): Record<string, unknown> {
    return {
      v: 1,
      type,
      payload,
      source: overrides.source ?? 'simulator',
      sentAt: overrides.sentAt ?? new Date(this.now()).toISOString(),
      ...(overrides.msgId ? { msgId: overrides.msgId } : {}),
    };
  }

  /** Injects a single, well-formed semantic action. */
  injectAction(type: string, payload: unknown, overrides: SimulatorEnvelopeOverrides = {}): void {
    this.emit(this.buildEnvelope(type, payload, overrides));
  }

  /** Duplicate burst: the same action repeated well within the 1000ms dedup window. */
  injectDuplicateBurst(type: string, payload: unknown, count = 3, intervalMs = 100): void {
    for (let i = 0; i < count; i += 1) {
      this.injectAction(type, payload, {
        sentAt: new Date(this.now() + i * intervalMs).toISOString(),
      });
    }
  }

  /** Deliberate repeat: the same action, spaced past the 1000ms dedup window (must be honoured). */
  injectDeliberateRepeat(type: string, payload: unknown, delayMs = 1100): void {
    this.injectAction(type, payload, { sentAt: new Date(this.now()).toISOString() });
    this.injectAction(type, payload, { sentAt: new Date(this.now() + delayMs).toISOString() });
  }

  /** Invalid id: a category.select whose categoryId fails basic shape validation (empty string). */
  injectInvalidId(): void {
    this.injectAction('category.select', { categoryId: '' });
  }

  /** Unknown type: an action type outside the contract's action set. */
  injectUnknownType(): void {
    this.injectAction('nav.teleport', {});
  }

  /** Rapid hover stream: alternating next/prev hovers, exercising ordering + dedup together. */
  injectRapidHoverStream(count = 10, intervalMs = 20): void {
    for (let i = 0; i < count; i += 1) {
      this.injectAction(
        'preview.hover',
        { direction: i % 2 === 0 ? 'next' : 'prev' },
        { sentAt: new Date(this.now() + i * intervalMs).toISOString() },
      );
    }
  }

  /**
   * Disconnect then reconnect. Interruption timing targeted at transition midpoints (SC-006) is
   * exercised at the E2E layer (Playwright driving this same transport against the running app,
   * T049) where real sequence/handover durations exist — this core only provides the primitive.
   */
  simulateDisconnectReconnect(): void {
    this.disconnect();
    this.connect();
  }
}
