// Common Transport interface (T014). Zero navigation logic lives here or in any transport
// implementation — transports only move raw wire-format messages in and out; validation, dedup,
// priority, and dispatch all happen at the input boundary (T013). A future physical console
// transport (research.md R7 preserved open decision) is adding one file implementing this
// interface, nothing else.

export type TransportStatus = 'disconnected' | 'connecting' | 'connected';

export type Unsubscribe = () => void;

export interface Transport {
  readonly id: string;
  connect(): void;
  disconnect(): void;
  isConnected(): boolean;
  /** Raw wire-format messages as received — untouched, unvalidated (the boundary validates). */
  onMessage(handler: (raw: unknown) => void): Unsubscribe;
  onStatusChange(handler: (status: TransportStatus) => void): Unsubscribe;
  /** Sends a raw wire-format message out through this transport, if the transport supports it. */
  emit(raw: unknown): void;
}

/** Shared pub/sub helper so every transport implements onMessage/onStatusChange identically. */
export class TransportEventHub {
  private readonly messageHandlers = new Set<(raw: unknown) => void>();
  private readonly statusHandlers = new Set<(status: TransportStatus) => void>();

  onMessage(handler: (raw: unknown) => void): Unsubscribe {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStatusChange(handler: (status: TransportStatus) => void): Unsubscribe {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  emitMessage(raw: unknown): void {
    for (const handler of this.messageHandlers) handler(raw);
  }

  emitStatus(status: TransportStatus): void {
    for (const handler of this.statusHandlers) handler(status);
  }
}
