import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadKioskLocalEnv } from './src/config.js';

/** Chromium flags required for unattended playback on the event playback PC. */
export const REQUIRED_CHROMIUM_FLAGS = [
  '--kiosk',
  '--autoplay-policy=no-user-gesture-required',
  '--disable-session-crashed-bubble',
  '--noerrdialogs',
] as const;

/**
 * Initial event-hardware GPU flags. These are deliberately kept in one list so the playback
 * team can tune them after measuring the actual GPU/driver combination without changing the
 * watchdog lifecycle or adding shell-parsed arguments.
 */
export const EVENT_HARDWARE_GPU_FLAGS = ['--enable-gpu', '--ignore-gpu-blocklist'] as const;

export interface WatchdogChild {
  readonly pid?: number;
  once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export type BrowserSpawner = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => WatchdogChild;

export interface WatchdogReloadRequester {
  requestReload(): boolean | Promise<boolean>;
}

export interface ChromiumWatchdogOptions {
  browserCommand: string;
  url: string;
  gpuFlags?: readonly string[];
  relaunchDelayMs?: number;
  shutdownTimeoutMs?: number;
  spawnBrowser?: BrowserSpawner;
  onMessage?: (message: string) => void;
}

const defaultBrowserSpawner: BrowserSpawner = (command, args, options): ChildProcess =>
  spawn(command, args, options);

/** Builds the complete argument vector; no shell string is ever constructed. */
export function buildChromiumArgs(
  url: string,
  gpuFlags: readonly string[] = EVENT_HARDWARE_GPU_FLAGS,
): readonly string[] {
  return [...REQUIRED_CHROMIUM_FLAGS, ...gpuFlags, url];
}

/**
 * A small process watchdog with an explicit lifecycle. Unexpected browser exits are retried;
 * reload and shutdown are marked intentional so they do not create duplicate launches.
 */
export class ChromiumWatchdog implements WatchdogReloadRequester {
  private readonly browserCommand: string;
  private readonly url: string;
  private readonly gpuFlags: readonly string[];
  private readonly relaunchDelayMs: number;
  private readonly shutdownTimeoutMs: number;
  private readonly spawnBrowser: BrowserSpawner;
  private readonly onMessage: ((message: string) => void) | undefined;
  private child: WatchdogChild | null = null;
  private running = false;
  private stopping = false;
  private relaunchAfterExit = false;
  private generation = 0;
  private launchTimer: ReturnType<typeof setTimeout> | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;
  private stopWait: {
    child: WatchdogChild;
    timer: ReturnType<typeof setTimeout>;
    resolve: () => void;
  } | null = null;

  constructor(options: ChromiumWatchdogOptions) {
    this.browserCommand = options.browserCommand;
    this.url = options.url;
    this.gpuFlags = options.gpuFlags ?? EVENT_HARDWARE_GPU_FLAGS;
    this.relaunchDelayMs = Math.max(0, options.relaunchDelayMs ?? 500);
    this.shutdownTimeoutMs = Math.max(1, options.shutdownTimeoutMs ?? 2_000);
    this.spawnBrowser = options.spawnBrowser ?? defaultBrowserSpawner;
    this.onMessage = options.onMessage;
  }

  get browserProcess(): WatchdogChild | null {
    return this.child;
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running || this.stopping) return;
    this.running = true;
    this.launchNow();
  }

  /** Requests a browser refresh by terminating the child and letting the watchdog relaunch it. */
  requestReload(): boolean {
    if (!this.running || this.stopping) return false;

    this.relaunchAfterExit = true;
    const child = this.child;
    if (!child) {
      this.clearLaunchTimer();
      this.scheduleLaunch(0);
      return true;
    }

    this.clearReloadTimer();
    this.reloadTimer = setTimeout(() => {
      if (this.child !== child || !this.relaunchAfterExit || this.stopping) return;
      this.report('browser did not exit after reload request; forcing termination');
      try {
        child.kill('SIGKILL');
      } catch {
        // The child may have exited between the timeout and the signal.
      }
      this.handleChildExit(child, this.generation);
    }, this.shutdownTimeoutMs);

    try {
      if (!child.kill('SIGTERM')) this.handleChildExit(child, this.generation);
    } catch {
      this.handleChildExit(child, this.generation);
    }
    return true;
  }

  /** Stops relaunch timers and asks Chromium to exit, escalating once after the timeout. */
  async stop(): Promise<void> {
    this.running = false;
    this.relaunchAfterExit = false;
    this.clearLaunchTimer();
    this.clearReloadTimer();

    const child = this.child;
    if (!child) return;

    this.stopping = true;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (this.child === child) {
          try {
            child.kill('SIGKILL');
          } catch {
            // The process may have exited just before escalation.
          }
          this.child = null;
        }
        this.finishStop(child);
      }, this.shutdownTimeoutMs);
      this.stopWait = { child, timer, resolve };

      try {
        if (!child.kill('SIGTERM')) {
          this.child = null;
          this.finishStop(child);
        }
      } catch {
        this.child = null;
        this.finishStop(child);
      }
    });
  }

  private launchNow(): void {
    if (!this.running || this.stopping || this.child) return;

    let child: WatchdogChild;
    try {
      child = this.spawnBrowser(this.browserCommand, buildChromiumArgs(this.url, this.gpuFlags), {
        shell: false,
        stdio: 'inherit',
      });
    } catch (error) {
      this.report(`browser launch failed: ${describeError(error)}`);
      this.scheduleLaunch(this.relaunchDelayMs);
      return;
    }

    const generation = ++this.generation;
    this.child = child;
    this.relaunchAfterExit = false;
    this.report(`browser launched${child.pid === undefined ? '' : ` (pid ${child.pid})`}`);
    child.once('exit', () => this.handleChildExit(child, generation));
    child.once('error', (error) => this.handleChildError(child, generation, error));
  }

  private handleChildExit(child: WatchdogChild, generation: number): void {
    if (this.child !== child || this.generation !== generation) return;
    this.clearReloadTimer();
    this.child = null;

    if (this.stopping) {
      this.finishStop(child);
      return;
    }
    if (!this.running) return;

    const immediate = this.relaunchAfterExit;
    this.relaunchAfterExit = false;
    this.report(
      immediate ? 'browser reload completed; relaunching' : 'browser exited; relaunching',
    );
    this.scheduleLaunch(immediate ? 0 : this.relaunchDelayMs);
  }

  private handleChildError(child: WatchdogChild, generation: number, error: Error): void {
    if (this.child !== child || this.generation !== generation) return;
    this.clearReloadTimer();
    this.child = null;

    if (this.stopping) {
      this.finishStop(child);
      return;
    }
    if (!this.running) return;

    const immediate = this.relaunchAfterExit;
    this.relaunchAfterExit = false;
    this.report(`browser process error (${describeError(error)}); relaunching`);
    this.scheduleLaunch(immediate ? 0 : this.relaunchDelayMs);
  }

  private scheduleLaunch(delayMs: number): void {
    if (!this.running || this.stopping || this.child || this.launchTimer) return;
    this.launchTimer = setTimeout(
      () => {
        this.launchTimer = null;
        this.launchNow();
      },
      Math.max(0, delayMs),
    );
  }

  private clearLaunchTimer(): void {
    if (!this.launchTimer) return;
    clearTimeout(this.launchTimer);
    this.launchTimer = null;
  }

  private clearReloadTimer(): void {
    if (!this.reloadTimer) return;
    clearTimeout(this.reloadTimer);
    this.reloadTimer = null;
  }

  private finishStop(child: WatchdogChild): void {
    if (!this.stopWait || this.stopWait.child !== child) return;
    clearTimeout(this.stopWait.timer);
    const resolve = this.stopWait.resolve;
    this.stopWait = null;
    this.stopping = false;
    resolve();
  }

  private report(message: string): void {
    this.onMessage?.(message);
  }
}

export interface WatchdogControlServerOptions {
  host?: string;
  port: number;
}

export interface WatchdogControlServer {
  readonly server: Server;
  listen(): Promise<void>;
  close(): Promise<void>;
}

/** Returns true only for loopback addresses, including IPv4-mapped IPv6 addresses. */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.replace(/^::ffff:/i, '');
  return normalized === '127.0.0.1' || normalized === '::1';
}

/**
 * Validates the tiny reload message accepted by the loopback control server. Empty request bodies
 * are valid; the optional reason is bounded and cannot carry a command, path, or URL.
 */
export function isValidWatchdogReloadPayload(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== 'reason')) return false;
  return (
    record.reason === undefined ||
    (typeof record.reason === 'string' && record.reason.length <= 128)
  );
}

/** Creates the loopback-only control endpoint used by the sidecar's reload route. */
export function createWatchdogControlServer(
  watchdog: WatchdogReloadRequester,
  options: WatchdogControlServerOptions,
): WatchdogControlServer {
  const server = createServer((req, res) => {
    void handleWatchdogControlRequest(req, res, watchdog).catch(() => {
      if (!res.headersSent) writeJson(res, 202, { requested: false });
    });
  });

  return {
    server,
    listen(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.port, options.host ?? '127.0.0.1', () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
    },
    close(): Promise<void> {
      if (!server.listening) return Promise.resolve();
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function handleWatchdogControlRequest(
  req: IncomingMessage,
  res: ServerResponse,
  watchdog: WatchdogReloadRequester,
): Promise<void> {
  if (!isLoopbackAddress(req.socket.remoteAddress)) {
    writeJson(res, 403, { requested: false, error: 'loopback only' });
    return;
  }
  if (req.method !== 'POST' || (req.url ?? '').split('?')[0] !== '/reload') {
    writeJson(res, 404, { requested: false });
    return;
  }

  const body = await readBoundedJsonBody(req);
  if (!body.ok || !isValidWatchdogReloadPayload(body.value)) {
    writeJson(res, 400, { requested: false, error: 'invalid reload request' });
    return;
  }

  let requested = false;
  try {
    requested = await watchdog.requestReload();
  } catch {
    // A failed local signal is still a handled operator request, never a control-server crash.
  }
  writeJson(res, 202, { requested });
}

async function readBoundedJsonBody(
  req: IncomingMessage,
): Promise<{ ok: true; value: unknown } | { ok: false; value: undefined }> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  let tooLarge = false;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes <= 64 * 1024) chunks.push(buffer);
    else tooLarge = true;
  }
  if (tooLarge) return { ok: false, value: undefined };
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, value: undefined };
  }
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultChromiumCommand(): string {
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  if (process.platform === 'win32') return 'chrome.exe';
  return 'chromium';
}

function positivePort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : fallback;
}

async function runWatchdogProcess(): Promise<void> {
  loadKioskLocalEnv();
  const kioskPort = positivePort(process.env.KIOSK_PORT, 4_174);
  const controlPort = positivePort(process.env.KIOSK_WATCHDOG_PORT, 4_175);
  const watchdog = new ChromiumWatchdog({
    browserCommand: process.env.KIOSK_CHROMIUM ?? defaultChromiumCommand(),
    url: process.env.KIOSK_URL ?? `http://127.0.0.1:${kioskPort}/`,
    onMessage: (message) => console.log(`[kiosk-watchdog] ${message}`),
  });
  const control = createWatchdogControlServer(watchdog, { port: controlPort });

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    await watchdog.stop();
    await control.close();
  };
  process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)));
  process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)));

  await control.listen();
  watchdog.start();
  console.log(`[kiosk-watchdog] control endpoint listening on http://127.0.0.1:${controlPort}`);
}

const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  void runWatchdogProcess().catch((error: unknown) => {
    console.error(`[kiosk-watchdog] fatal error: ${describeError(error)}`);
    process.exitCode = 1;
  });
}
