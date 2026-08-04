import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';

// Dev WebSocket input bridge (T019, research.md R7): a plain broadcast relay. Any connected
// client's message is relayed to every other connected client — an external console/dev-tool
// script sends v1 semantic-action envelopes; the running app's WebSocketTransport receives them.
// Zero navigation logic here (Principle III) — this is pure message plumbing.

export class WsInputBridge {
  private readonly wss: WebSocketServer;

  constructor() {
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on('connection', (socket: WebSocket) => {
      socket.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
        for (const client of this.wss.clients) {
          if (client !== socket && client.readyState === client.OPEN) {
            client.send(data, { binary: isBinary });
          }
        }
      });
    });
  }

  /** Wires this bridge into an existing `http.Server`'s `upgrade` event for the given path. */
  handleUpgrade(path: string, request: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    const requestUrl = request.url ?? '';
    if (!requestUrl.startsWith(path)) {
      return false;
    }
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit('connection', ws, request);
    });
    return true;
  }

  get clientCount(): number {
    return this.wss.clients.size;
  }

  close(): void {
    this.wss.close();
  }
}
