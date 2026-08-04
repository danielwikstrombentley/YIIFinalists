// Connection monitor (contract boundary rule 6): each transport reports liveness; loss is
// diagnostics-only and never mutates experience state; reconnect resumes input handling with
// dedup state reset. This module is the diagnostics-facing read model; resetting the boundary's
// dedup/ordering state on reconnect is orchestrated by InputBoundary.notifyReconnect().

export interface ConnectionSnapshot {
  connected: boolean;
  transportId: string;
  lastMessageAt: number | null;
}

export class ConnectionMonitor {
  private readonly connections = new Map<string, ConnectionSnapshot>();

  setStatus(transportId: string, connected: boolean): ConnectionSnapshot {
    const snapshot: ConnectionSnapshot = {
      transportId,
      connected,
      lastMessageAt: this.connections.get(transportId)?.lastMessageAt ?? null,
    };
    this.connections.set(transportId, snapshot);
    return snapshot;
  }

  recordMessage(transportId: string, atMs: number): void {
    const existing = this.connections.get(transportId);
    this.connections.set(transportId, {
      transportId,
      connected: existing?.connected ?? true,
      lastMessageAt: atMs,
    });
  }

  get(transportId: string): ConnectionSnapshot | undefined {
    return this.connections.get(transportId);
  }

  all(): ConnectionSnapshot[] {
    return [...this.connections.values()];
  }
}
