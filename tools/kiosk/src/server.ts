import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { loadKioskConfig, type KioskConfig } from './config.js';
import { TelemetrySink } from './telemetry-sink.js';
import { WsInputBridge } from './ws-input.js';

// Kiosk sidecar dev server (T019): local static server for the built app + active content
// release, a WS input relay, and the telemetry sink endpoint. No dependency beyond `ws` — plain
// Node `http`/`fs` for static serving keeps this sidecar minimal (research.md R12).

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.wasm': 'application/wasm',
  '.opus': 'audio/opus',
  '.mp4': 'video/mp4',
};

function contentTypeFor(path: string): string {
  return MIME_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

/** Prevents `..`-style traversal outside `root` regardless of the request path. */
function safeJoin(root: string, requestPath: string): string | null {
  const decoded = decodeURIComponent(requestPath.split('?')[0] ?? '');
  const resolved = normalize(join(root, decoded));
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    return null;
  }
  return resolved;
}

async function serveStatic(root: string, requestPath: string, res: ServerResponse, fallbackToIndex: boolean): Promise<void> {
  const filePath = safeJoin(root, requestPath === '/' ? '/index.html' : requestPath);
  if (!filePath) {
    res.writeHead(400).end('Bad request');
    return;
  }
  try {
    const stats = await stat(filePath);
    if (stats.isDirectory()) {
      await serveStatic(root, join(requestPath, 'index.html'), res, false);
      return;
    }
    res.writeHead(200, { 'Content-Type': contentTypeFor(filePath), 'Content-Length': stats.size });
    createReadStream(filePath).pipe(res);
  } catch {
    if (fallbackToIndex) {
      await serveStatic(root, '/index.html', res, false);
      return;
    }
    res.writeHead(404).end('Not found');
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw.length > 0 ? JSON.parse(raw) : [];
}

export function createKioskServer(config: KioskConfig = loadKioskConfig()) {
  const telemetrySink = new TelemetrySink(config.logDir);
  const wsInputBridge = new WsInputBridge();

  const server = createServer((req, res) => {
    void handleRequest(req, res);
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';

    if (req.method === 'POST' && url === '/telemetry') {
      try {
        const body = await readJsonBody(req);
        const events = Array.isArray(body) ? body : [body];
        const result = await telemetrySink.appendBatch(events);
        res.writeHead(202, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
      } catch (error) {
        // Malformed request body: never a 5xx (Principle IV — telemetry failures are invisible
        // to the runtime); report a 200 with zero accepted instead.
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({ accepted: 0, rejected: 0, errors: [describeError(error)] }),
        );
      }
      return;
    }

    if (url.startsWith('/content/')) {
      await serveStatic(config.contentRoot, url.slice('/content'.length), res, false);
      return;
    }

    await serveStatic(config.staticRoot, url, res, true);
  }

  server.on('upgrade', (req, socket, head) => {
    if (!wsInputBridge.handleUpgrade('/ws', req, socket, head)) {
      socket.destroy();
    }
  });

  return {
    server,
    telemetrySink,
    wsInputBridge,
    listen(): Promise<void> {
      return new Promise((resolve) => {
        server.listen(config.port, () => resolve());
      });
    },
    close(): Promise<void> {
      wsInputBridge.close();
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const config = loadKioskConfig();
  const kiosk = createKioskServer(config);
  void kiosk.listen().then(() => {
    console.log(`[kiosk] serving app from ${config.staticRoot}`);
    console.log(`[kiosk] serving content from ${config.contentRoot} at /content`);
    console.log(`[kiosk] listening on http://localhost:${config.port} (ws input at /ws)`);
  });
}
