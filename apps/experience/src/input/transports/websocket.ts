import { Transport, TransportEventHub, type TransportStatus, type Unsubscribe } from './transport.js';

// Dev WebSocket transport (T014): JSON-over-WebSocket, served by the kiosk sidecar (tools/kiosk).
// The socket implementation is injectable so this adapter is unit-testable without a real network
// stack; `emit`/`onMessage` carry only raw wire-format objects — no navigation logic.

export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

function defaultWebSocketFactory(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike;
}

export class WebSocketTransport implements Transport {
  readonly id: string;
  private readonly hub = new TransportEventHub();
  private readonly url: string;
  private readonly createSocket: WebSocketFactory;
  private socket: WebSocketLike | null = null;
  private status: TransportStatus = 'disconnected';

  constructor(url: string, options: { createSocket?: WebSocketFactory; id?: string } = {}) {
    this.url = url;
    this.createSocket = options.createSocket ?? defaultWebSocketFactory;
    this.id = options.id ?? 'websocket';
  }

  connect(): void {
    this.setStatus('connecting');
    const socket = this.createSocket(this.url);
    socket.onopen = () => this.setStatus('connected');
    socket.onclose = () => this.setStatus('disconnected');
    socket.onerror = () => this.setStatus('disconnected');
    socket.onmessage = (event) => {
      const raw = parseWireMessage(event.data);
      if (raw !== undefined) this.hub.emitMessage(raw);
    };
    this.socket = socket;
  }

  disconnect(): void {
    // `close()` triggers the socket's own `onclose` handler (above), which is the single source
    // of truth for the 'disconnected' status — avoid emitting it a second time here.
    this.socket?.close();
    this.socket = null;
  }

  isConnected(): boolean {
    return this.status === 'connected';
  }

  onMessage(handler: (raw: unknown) => void): Unsubscribe {
    return this.hub.onMessage(handler);
  }

  onStatusChange(handler: (status: TransportStatus) => void): Unsubscribe {
    return this.hub.onStatusChange(handler);
  }

  /** Sends a raw wire-format envelope out (e.g. an operator command echoed to a console). */
  emit(raw: unknown): void {
    if (!this.socket || this.status !== 'connected') return;
    this.socket.send(JSON.stringify(raw));
  }

  private setStatus(status: TransportStatus): void {
    this.status = status;
    this.hub.emitStatus(status);
  }
}

function parseWireMessage(data: unknown): unknown {
  if (typeof data !== 'string') return undefined;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }
}
