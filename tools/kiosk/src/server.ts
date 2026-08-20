import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import {
  getKioskCesiumConfigurationWarning,
  loadKioskConfig,
  loadKioskLocalEnv,
  type KioskConfig,
} from './config.js';
import { TelemetrySink } from './telemetry-sink.js';
import { WsInputBridge } from './ws-input.js';
import {
  isLoopbackAddress,
  isValidWatchdogReloadPayload,
  type WatchdogReloadRequester,
} from '../watchdog.js';

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
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath.split('?')[0] ?? '');
  } catch {
    // Malformed percent-encoding (e.g. `/%ZZ`) — treat exactly like any other invalid path.
    return null;
  }
  const resolved = normalize(join(root, decoded));
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    return null;
  }
  return resolved;
}

async function serveStatic(
  root: string,
  requestPath: string,
  res: ServerResponse,
  fallbackToIndex: boolean,
): Promise<void> {
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
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 64 * 1024) throw new Error('Request body too large');
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw.length > 0 ? JSON.parse(raw) : undefined;
}

export interface KioskServerOptions {
  /** In-process test/embedding hook; production uses the loopback watchdog control port. */
  watchdog?: WatchdogReloadRequester;
}

export function createKioskServer(
  config: KioskConfig = loadKioskConfig(),
  options: KioskServerOptions = {},
) {
  const telemetrySink = new TelemetrySink(config.logDir);
  const wsInputBridge = new WsInputBridge();

  const server = createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      // Defense-in-depth backstop: every known failure path inside handleRequest() already
      // resolves safely (safeJoin/serveStatic/telemetry all catch their own errors) but an
      // unhandled rejection here would otherwise risk crashing the sidecar (Principle IV).
      console.error('[kiosk] unhandled request error', error);
      if (!res.headersSent) {
        res.writeHead(500).end('Internal error');
      }
    });
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';

    if (req.method === 'GET' && url === '/runtime-config.json') {
      // Cesium's browser client needs its local ion credentials at runtime, but the values remain
      // environment-only kiosk configuration rather than source-controlled or bundled assets.
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(
        JSON.stringify({
          ionAccessToken: config.ionAccessToken,
          ionGoogleTilesAssetId: config.ionGoogleTilesAssetId,
          contentChannel: config.contentChannel,
          operatorActivationSequence: config.operatorActivationSequence,
          operatorActivationRateLimitMs: config.operatorActivationRateLimitMs,
          operatorActivationSources: config.operatorActivationSources,
        }),
      );
      return;
    }

    if (url.split('?')[0] === '/watchdog/reload') {
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST' }).end('Method not allowed');
        return;
      }
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.writeHead(403).end('Loopback only');
        return;
      }

      let body: unknown;
      try {
        body = await readJsonBody(req);
      } catch {
        res
          .writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
          .end(JSON.stringify({ requested: false, error: 'Invalid reload request' }));
        return;
      }
      if (!isValidWatchdogReloadPayload(body)) {
        res
          .writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
          .end(JSON.stringify({ requested: false, error: 'Invalid reload request' }));
        return;
      }

      const requested = await signalWatchdog(config, options.watchdog);
      res
        .writeHead(202, { 'Content-Type': 'application/json; charset=utf-8' })
        .end(JSON.stringify({ requested }));
      return;
    }

    if (req.method === 'POST' && url === '/telemetry') {
      try {
        const body = await readJsonBody(req);
        const events = body === undefined ? [] : Array.isArray(body) ? body : [body];
        const result = await telemetrySink.appendBatch(events);
        res.writeHead(202, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
      } catch (error) {
        // Malformed request body: never a 5xx (Principle IV — telemetry failures are invisible
        // to the runtime); report a 200 with zero accepted instead.
        res
          .writeHead(200, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ accepted: 0, rejected: 0, errors: [describeError(error)] }));
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

async function signalWatchdog(
  config: KioskConfig,
  watchdog: WatchdogReloadRequester | undefined,
): Promise<boolean> {
  if (watchdog) {
    try {
      return await watchdog.requestReload();
    } catch {
      return false;
    }
  }
  const port = config.watchdogControlPort;
  if (!port) return false;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/reload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'kiosk-sidecar' }),
      signal: AbortSignal.timeout(500),
    });
    return response.ok;
  } catch {
    // A stopped/unconfigured watchdog must not turn an operator request into a sidecar 5xx.
    return false;
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  loadKioskLocalEnv();
  const config = loadKioskConfig();
  const cesiumConfigWarning = getKioskCesiumConfigurationWarning(config);
  if (cesiumConfigWarning) console.warn(`[kiosk] ${cesiumConfigWarning}`);
  const kiosk = createKioskServer(config);
  void kiosk.listen().then(() => {
    console.log(`[kiosk] serving app from ${config.staticRoot}`);
    console.log(`[kiosk] serving content from ${config.contentRoot} at /content`);
    console.log(`[kiosk] listening on http://localhost:${config.port} (ws input at /ws)`);
  });
}
