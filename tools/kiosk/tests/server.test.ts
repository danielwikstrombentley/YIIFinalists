import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createKioskServer } from '../src/server.js';
import type { KioskConfig } from '../src/config.js';

// T019 Tests (part 2/3 + 3/3): malformed telemetry rejected without a 5xx; WS round-trip test.

describe('kiosk server', () => {
  let staticRoot: string;
  let contentRoot: string;
  let logDir: string;
  let kiosk: ReturnType<typeof createKioskServer>;
  let baseUrl: string;

  beforeEach(async () => {
    staticRoot = await mkdtemp(join(tmpdir(), 'yii-kiosk-static-'));
    contentRoot = await mkdtemp(join(tmpdir(), 'yii-kiosk-content-'));
    logDir = await mkdtemp(join(tmpdir(), 'yii-kiosk-logs-'));

    await writeFile(join(staticRoot, 'index.html'), '<!doctype html><title>stage</title>');
    await mkdir(join(contentRoot), { recursive: true });
    await writeFile(join(contentRoot, 'channels.json'), JSON.stringify({ staging: '1.0.0' }));

    const config: KioskConfig = {
      port: 0,
      staticRoot,
      contentRoot,
      logDir,
      contentChannel: 'staging',
      ionAccessToken: 'test-ion-token',
      ionGoogleTilesAssetId: '123',
      operatorActivationSequence: [{ type: 'nav.back', payload: {} }],
      operatorActivationRateLimitMs: 1_000,
      operatorActivationSources: ['operator'],
    };
    kiosk = createKioskServer(config);
    await kiosk.listen();
    const address = kiosk.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await kiosk.close();
    await rm(staticRoot, { recursive: true, force: true });
    await rm(contentRoot, { recursive: true, force: true });
    await rm(logDir, { recursive: true, force: true });
  });

  it('serves the built app at /', async () => {
    const response = await fetch(`${baseUrl}/`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('stage');
  });

  it('serves the active content release under /content', async () => {
    const response = await fetch(`${baseUrl}/content/channels.json`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ staging: '1.0.0' });
  });

  it('serves Cesium credentials only from local runtime configuration, never a bundled source file', async () => {
    const response = await fetch(`${baseUrl}/runtime-config.json`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      ionAccessToken: 'test-ion-token',
      ionGoogleTilesAssetId: '123',
      contentChannel: 'staging',
      operatorActivationSequence: [{ type: 'nav.back', payload: {} }],
      operatorActivationRateLimitMs: 1_000,
      operatorActivationSources: ['operator'],
    });
  });

  it('accepts a valid telemetry batch and appends it', async () => {
    const response = await fetch(`${baseUrl}/telemetry`, {
      method: 'POST',
      body: JSON.stringify([
        { v: 1, ts: new Date().toISOString(), sessionId: 's1', seq: 1, kind: 'start' },
      ]),
    });
    expect(response.status).toBe(202);
    const body = (await response.json()) as { accepted: number };
    expect(body.accepted).toBe(1);
  });

  it('rejects malformed telemetry without a 5xx', async () => {
    const response = await fetch(`${baseUrl}/telemetry`, {
      method: 'POST',
      body: 'not valid json{{{',
    });
    expect(response.status).toBeLessThan(500);
    const body = (await response.json()) as { accepted: number; errors: string[] };
    expect(body.accepted).toBe(0);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it('returns 400 for a malformed percent-encoded path instead of crashing the server', async () => {
    const response = await fetch(`${baseUrl}/%ZZ`);
    expect(response.status).toBe(400);

    // The server must still be alive and answering afterward (no unhandled-rejection crash).
    const followUp = await fetch(`${baseUrl}/`);
    expect(followUp.status).toBe(200);
  });

  it('WS round-trip: a message sent by one client is relayed to another', async () => {
    const address = kiosk.server.address() as AddressInfo;
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

    const clientA = new WebSocket(wsUrl);
    const clientB = new WebSocket(wsUrl);
    await Promise.all([once(clientA, 'open'), once(clientB, 'open')]);

    const received = once(clientB, 'message');
    const envelope = {
      v: 1,
      type: 'nav.idle',
      payload: {},
      source: 'console',
      sentAt: new Date().toISOString(),
    };
    clientA.send(JSON.stringify(envelope));

    const [messageEvent] = await received;
    const parsed = JSON.parse(String((messageEvent as { data: unknown }).data ?? messageEvent));
    expect(parsed).toEqual(envelope);

    clientA.close();
    clientB.close();
  });
});

function once(emitter: WebSocket, event: string): Promise<unknown[]> {
  return new Promise((resolve) => {
    emitter.once(event, (...args: unknown[]) => resolve(args));
  });
}
