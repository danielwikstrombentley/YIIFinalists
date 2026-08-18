import { EventEmitter } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildChromiumArgs,
  ChromiumWatchdog,
  createWatchdogControlServer,
  EVENT_HARDWARE_GPU_FLAGS,
  REQUIRED_CHROMIUM_FLAGS,
  type BrowserSpawner,
  type WatchdogChild,
} from '../watchdog.js';
import { createKioskServer } from '../src/server.js';
import type { KioskConfig } from '../src/config.js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

class FakeBrowser extends EventEmitter implements WatchdogChild {
  readonly pid = 40_000 + Math.floor(Math.random() * 10_000);
  readonly killSignals: Array<NodeJS.Signals | number | undefined> = [];

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killSignals.push(signal);
    this.emit('exit', null, typeof signal === 'string' ? signal : null);
    return true;
  }

  die(code = 1): void {
    this.emit('exit', code, null);
  }
}

describe('ChromiumWatchdog', () => {
  it('builds exact kiosk flags plus documented GPU placeholders without a shell command', () => {
    expect(buildChromiumArgs('http://127.0.0.1:4174/')).toEqual([
      ...REQUIRED_CHROMIUM_FLAGS,
      ...EVENT_HARDWARE_GPU_FLAGS,
      'http://127.0.0.1:4174/',
    ]);
  });

  it('relaunches after unexpected browser death and passes spawn args safely', async () => {
    const children: FakeBrowser[] = [];
    const spawner = vi.fn<BrowserSpawner>((command, args, options) => {
      expect(command).toBe('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
      expect(args.length).toBeGreaterThan(0);
      expect(options.shell).toBe(false);
      const child = new FakeBrowser();
      children.push(child);
      return child;
    });
    const watchdog = new ChromiumWatchdog({
      browserCommand: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      url: 'http://127.0.0.1:4174/?safe=1;touch /tmp/not-a-command',
      relaunchDelayMs: 0,
      spawnBrowser: spawner,
    });

    watchdog.start();
    expect(spawner).toHaveBeenCalledTimes(1);
    expect(spawner.mock.calls[0]?.[1]).toEqual([
      ...REQUIRED_CHROMIUM_FLAGS,
      ...EVENT_HARDWARE_GPU_FLAGS,
      'http://127.0.0.1:4174/?safe=1;touch /tmp/not-a-command',
    ]);

    children[0]?.die();
    await vi.waitFor(() => expect(spawner).toHaveBeenCalledTimes(2));
    expect(watchdog.browserProcess).toBe(children[1]);

    await watchdog.stop();
    expect(children[1]?.killSignals).toContain('SIGTERM');
  });

  it('reload request round-trips through the loopback control server', async () => {
    const requestReload = vi.fn(() => true);
    const control = createWatchdogControlServer({ requestReload }, { port: 0 });
    await control.listen();
    const address = control.server.address() as AddressInfo;

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/reload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'operator' }),
      });
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ requested: true });
      expect(requestReload).toHaveBeenCalledOnce();
    } finally {
      await control.close();
    }
  });
});

describe('kiosk sidecar watchdog reload endpoint', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('signals the watchdog and remains successful when the watchdog is not configured', async () => {
    const staticRoot = await mkdtemp(join(tmpdir(), 'yii-kiosk-watchdog-static-'));
    const contentRoot = await mkdtemp(join(tmpdir(), 'yii-kiosk-watchdog-content-'));
    const logDir = await mkdtemp(join(tmpdir(), 'yii-kiosk-watchdog-logs-'));
    temporaryDirectories.push(staticRoot, contentRoot, logDir);
    await writeFile(join(staticRoot, 'index.html'), '<!doctype html><title>stage</title>');

    const config: KioskConfig = {
      port: 0,
      staticRoot,
      contentRoot,
      logDir,
      ionAccessToken: undefined,
      ionGoogleTilesAssetId: undefined,
      operatorActivationSequence: [{ type: 'nav.back', payload: {} }],
      operatorActivationRateLimitMs: 1_000,
      operatorActivationSources: ['operator'],
    };
    const requestReload = vi.fn(() => true);
    const kiosk = createKioskServer(config, { watchdog: { requestReload } });
    await kiosk.listen();
    const address = kiosk.server.address() as AddressInfo;

    try {
      const requested = await fetch(`http://127.0.0.1:${address.port}/watchdog/reload`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'operator' }),
      });
      expect(requested.status).toBe(202);
      expect(await requested.json()).toEqual({ requested: true });
      expect(requestReload).toHaveBeenCalledOnce();

      const withoutWatchdog = createKioskServer(config);
      await withoutWatchdog.listen();
      const noWatchdogAddress = withoutWatchdog.server.address() as AddressInfo;
      try {
        const response = await fetch(`http://127.0.0.1:${noWatchdogAddress.port}/watchdog/reload`, {
          method: 'POST',
          body: JSON.stringify({ reason: 'operator' }),
        });
        expect(response.status).toBeLessThan(500);
        expect(await response.json()).toEqual({ requested: false });
      } finally {
        await withoutWatchdog.close();
      }
    } finally {
      await kiosk.close();
    }
  });
});
