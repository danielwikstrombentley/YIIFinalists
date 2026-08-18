// QR-008 diagnostics read model (T050). This store is intentionally independent from React,
// XState, and renderer/media implementations: producers push small observations into it, while
// the hidden operator layer reads immutable snapshots through `getSnapshot()` / `subscribe()`.
// It never sends an event, starts work, or otherwise mutates public experience state.

export type DiagnosticsTransportStatus = 'unknown' | 'connected' | 'disconnected';
export type DiagnosticsVoiceoverStatus = 'unknown' | 'playing' | 'stopped' | 'fallback' | 'error';
export type DiagnosticsVideoStatus = 'unknown' | 'playing' | 'paused' | 'error' | 'fallback';
export type DiagnosticsRendererStatus =
  'unknown' | 'inactive' | 'starting' | 'ready' | 'recovering' | 'fallback' | 'failed' | 'disposed';
export type DiagnosticsHandoverStatus =
  | 'idle'
  | 'approaching'
  | 'flying'
  | 'blending'
  | 'covering'
  | 'revealing'
  | 'settled'
  | 'fallback'
  | 'cancelled'
  | 'unknown';
export type HeapTrend = 'unavailable' | 'increasing' | 'stable' | 'decreasing';

export interface SequenceProgressDiagnostics {
  readonly beat: string | null;
  readonly percent: number | null;
  readonly elapsedMs: number | null;
}

export interface StateDiagnostics {
  readonly path: string;
  readonly activeCategoryId: string | null;
  readonly previewedProjectId: string | null;
  readonly selectedProjectId: string | null;
  readonly activeContentPosition: number | null;
  readonly sequence: SequenceProgressDiagnostics;
}

export interface VoiceoverDiagnostics {
  readonly status: DiagnosticsVoiceoverStatus;
  readonly positionSeconds: number | null;
  readonly assetId: string | null;
}

export interface VideoDiagnostics {
  readonly status: DiagnosticsVideoStatus;
  readonly assetId: string | null;
}

export interface MediaDiagnostics {
  readonly voiceover: VoiceoverDiagnostics;
  readonly video: VideoDiagnostics;
}

export interface TransportDiagnostics {
  readonly status: DiagnosticsTransportStatus;
  readonly lastMessageAtMs: number | null;
  readonly lastAction: string | null;
  readonly dedupDrops: number;
}

export interface ConsoleDiagnostics {
  readonly transports: Readonly<Record<string, TransportDiagnostics>>;
}

export interface RendererDiagnostics {
  readonly status: DiagnosticsRendererStatus;
  readonly tier: string | null;
}

export interface HandoverDiagnostics {
  readonly status: DiagnosticsHandoverStatus;
  readonly lastDurationMs: number | null;
}

export interface RenderersDiagnostics {
  readonly globe: RendererDiagnostics;
  readonly cesium: RendererDiagnostics;
  readonly handover: HandoverDiagnostics;
}

export interface PerformanceDiagnostics {
  readonly fps: number | null;
  readonly frameTimeP95Ms: number | null;
  readonly heapTrend: HeapTrend;
  readonly tickerCallbackCount: number;
  /** Telemetry ring overflow is an operator-only health signal (analytics contract). */
  readonly telemetryDropped: number;
}

export interface AssetFailureDiagnostics {
  readonly assetId: string;
  readonly error: string;
  readonly fallbackApplied: boolean;
  readonly atMs: number;
}

export interface ReleaseDiagnostics {
  readonly version: string | null;
  readonly contentHash: string | null;
}

export interface AssetsDiagnostics {
  readonly recentFailures: readonly AssetFailureDiagnostics[];
  readonly release: ReleaseDiagnostics;
}

export interface RuntimeErrorDiagnostics {
  readonly source: string;
  readonly message: string;
  readonly atMs: number;
}

export interface ErrorsDiagnostics {
  readonly recent: readonly RuntimeErrorDiagnostics[];
}

/** The exact group structure required by contracts/operator-diagnostics.md. */
export interface DiagnosticsSnapshot {
  readonly state: StateDiagnostics;
  readonly media: MediaDiagnostics;
  readonly console: ConsoleDiagnostics;
  readonly renderers: RenderersDiagnostics;
  readonly performance: PerformanceDiagnostics;
  readonly assets: AssetsDiagnostics;
  readonly errors: ErrorsDiagnostics;
}

export interface DiagnosticsStoreOptions {
  now?: () => number;
  assetFailureCapacity?: number;
  errorCapacity?: number;
}

export interface MachineDiagnosticsUpdate {
  statePath?: string;
  activeCategoryId?: string | null;
  previewedProjectId?: string | null;
  selectedProjectId?: string | null;
  activeContentPosition?: number | null;
}

export interface SequenceProgressUpdate {
  beat?: string | null;
  percent?: number | null;
  elapsedMs?: number | null;
}

export interface VoiceoverDiagnosticsUpdate {
  status?: DiagnosticsVoiceoverStatus;
  positionSeconds?: number | null;
  assetId?: string | null;
}

export interface VideoDiagnosticsUpdate {
  status?: DiagnosticsVideoStatus;
  assetId?: string | null;
}

export interface RendererDiagnosticsUpdate {
  status?: DiagnosticsRendererStatus;
  tier?: string | null;
}

export interface HandoverDiagnosticsUpdate {
  status?: DiagnosticsHandoverStatus;
  lastDurationMs?: number | null;
}

export interface PerformanceDiagnosticsUpdate {
  fps?: number | null;
  frameTimeP95Ms?: number | null;
  heapTrend?: HeapTrend;
  tickerCallbackCount?: number;
  telemetryDropped?: number;
}

export interface AssetFailureInput {
  assetId: string;
  error: string;
  fallbackApplied: boolean;
  atMs?: number;
}

export interface RuntimeErrorInput {
  source: string;
  message: string;
  atMs?: number;
}

export interface ReleaseDiagnosticsUpdate {
  version: string | null;
  contentHash: string | null;
}

export type DiagnosticsListener = () => void;

const EMPTY_SEQUENCE: SequenceProgressDiagnostics = {
  beat: null,
  percent: null,
  elapsedMs: null,
};

const EMPTY_TRANSPORT: TransportDiagnostics = {
  status: 'unknown',
  lastMessageAtMs: null,
  lastAction: null,
  dedupDrops: 0,
};

const INITIAL_SNAPSHOT: DiagnosticsSnapshot = {
  state: {
    path: 'boot',
    activeCategoryId: null,
    previewedProjectId: null,
    selectedProjectId: null,
    activeContentPosition: null,
    sequence: EMPTY_SEQUENCE,
  },
  media: {
    voiceover: { status: 'unknown', positionSeconds: null, assetId: null },
    video: { status: 'unknown', assetId: null },
  },
  console: { transports: {} },
  renderers: {
    globe: { status: 'unknown', tier: null },
    cesium: { status: 'unknown', tier: null },
    handover: { status: 'idle', lastDurationMs: null },
  },
  performance: {
    fps: null,
    frameTimeP95Ms: null,
    heapTrend: 'unavailable',
    tickerCallbackCount: 0,
    telemetryDropped: 0,
  },
  assets: { recentFailures: [], release: { version: null, contentHash: null } },
  errors: { recent: [] },
};

function hasOwn(object: object, property: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, property);
}

function sameObject(left: object, right: object): boolean {
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = Object.keys(leftRecord);
  return (
    keys.length === Object.keys(rightRecord).length &&
    keys.every((key) => leftRecord[key] === rightRecord[key])
  );
}

function boundedPositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

/**
 * Minimal external store compatible with `useSyncExternalStore`. Snapshots use structural sharing:
 * unchanged producer data retains its reference, and semantic no-op observations do not allocate
 * or notify subscribers. This prevents diagnostics from becoming a render-loop writer.
 */
export class DiagnosticsStore {
  private readonly now: () => number;
  private readonly assetFailureCapacity: number;
  private readonly errorCapacity: number;
  private readonly listeners = new Set<DiagnosticsListener>();
  private snapshot: DiagnosticsSnapshot = INITIAL_SNAPSHOT;

  constructor(options: DiagnosticsStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.assetFailureCapacity = boundedPositiveInteger(options.assetFailureCapacity, 20);
    this.errorCapacity = boundedPositiveInteger(options.errorCapacity, 20);
  }

  getSnapshot = (): DiagnosticsSnapshot => this.snapshot;

  subscribe = (listener: DiagnosticsListener): (() => void) => {
    this.listeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.listeners.delete(listener);
    };
  };

  updateMachine(update: MachineDiagnosticsUpdate): void {
    const current = this.snapshot.state;
    const next: StateDiagnostics = {
      path: hasOwn(update, 'statePath') ? (update.statePath ?? current.path) : current.path,
      activeCategoryId: hasOwn(update, 'activeCategoryId')
        ? (update.activeCategoryId ?? null)
        : current.activeCategoryId,
      previewedProjectId: hasOwn(update, 'previewedProjectId')
        ? (update.previewedProjectId ?? null)
        : current.previewedProjectId,
      selectedProjectId: hasOwn(update, 'selectedProjectId')
        ? (update.selectedProjectId ?? null)
        : current.selectedProjectId,
      activeContentPosition: hasOwn(update, 'activeContentPosition')
        ? (update.activeContentPosition ?? null)
        : current.activeContentPosition,
      sequence: current.sequence,
    };
    if (sameObject(current, next)) return;
    this.publish({ ...this.snapshot, state: next });
  }

  updateSequenceProgress(update: SequenceProgressUpdate): void {
    const current = this.snapshot.state.sequence;
    const next: SequenceProgressDiagnostics = {
      beat: hasOwn(update, 'beat') ? (update.beat ?? null) : current.beat,
      percent: hasOwn(update, 'percent') ? (update.percent ?? null) : current.percent,
      elapsedMs: hasOwn(update, 'elapsedMs') ? (update.elapsedMs ?? null) : current.elapsedMs,
    };
    if (sameObject(current, next)) return;
    this.publish({
      ...this.snapshot,
      state: { ...this.snapshot.state, sequence: next },
    });
  }

  updateVoiceover(update: VoiceoverDiagnosticsUpdate): void {
    const current = this.snapshot.media.voiceover;
    const next: VoiceoverDiagnostics = {
      status: hasOwn(update, 'status') ? (update.status ?? current.status) : current.status,
      positionSeconds: hasOwn(update, 'positionSeconds')
        ? (update.positionSeconds ?? null)
        : current.positionSeconds,
      assetId: hasOwn(update, 'assetId') ? (update.assetId ?? null) : current.assetId,
    };
    if (sameObject(current, next)) return;
    this.publish({
      ...this.snapshot,
      media: { ...this.snapshot.media, voiceover: next },
    });
  }

  updateVideo(update: VideoDiagnosticsUpdate): void {
    const current = this.snapshot.media.video;
    const next: VideoDiagnostics = {
      status: hasOwn(update, 'status') ? (update.status ?? current.status) : current.status,
      assetId: hasOwn(update, 'assetId') ? (update.assetId ?? null) : current.assetId,
    };
    if (sameObject(current, next)) return;
    this.publish({ ...this.snapshot, media: { ...this.snapshot.media, video: next } });
  }

  recordTransportStatus(
    transportId: string,
    status: DiagnosticsTransportStatus,
    atMs = this.now(),
  ): void {
    this.updateTransport(transportId, (current) => ({
      ...current,
      status,
      lastMessageAtMs: atMs,
    }));
  }

  recordAcceptedAction(transportId: string, action: string, atMs = this.now()): void {
    this.updateTransport(transportId, (current) => ({
      ...current,
      lastMessageAtMs: atMs,
      lastAction: action,
    }));
  }

  recordDedupDrop(transportId: string): void {
    this.updateTransport(transportId, (current) => ({
      ...current,
      dedupDrops: current.dedupDrops + 1,
    }));
  }

  updateRenderer(renderer: 'globe' | 'cesium', update: RendererDiagnosticsUpdate): void {
    const current = this.snapshot.renderers[renderer];
    const next: RendererDiagnostics = {
      status: hasOwn(update, 'status') ? (update.status ?? current.status) : current.status,
      tier: hasOwn(update, 'tier') ? (update.tier ?? null) : current.tier,
    };
    if (sameObject(current, next)) return;
    this.publish({
      ...this.snapshot,
      renderers: { ...this.snapshot.renderers, [renderer]: next },
    });
  }

  updateHandover(update: HandoverDiagnosticsUpdate): void {
    const current = this.snapshot.renderers.handover;
    const next: HandoverDiagnostics = {
      status: hasOwn(update, 'status') ? (update.status ?? current.status) : current.status,
      lastDurationMs: hasOwn(update, 'lastDurationMs')
        ? (update.lastDurationMs ?? null)
        : current.lastDurationMs,
    };
    if (sameObject(current, next)) return;
    this.publish({
      ...this.snapshot,
      renderers: { ...this.snapshot.renderers, handover: next },
    });
  }

  updatePerformance(update: PerformanceDiagnosticsUpdate): void {
    const current = this.snapshot.performance;
    const next: PerformanceDiagnostics = {
      fps: hasOwn(update, 'fps') ? (update.fps ?? null) : current.fps,
      frameTimeP95Ms: hasOwn(update, 'frameTimeP95Ms')
        ? (update.frameTimeP95Ms ?? null)
        : current.frameTimeP95Ms,
      heapTrend: hasOwn(update, 'heapTrend')
        ? (update.heapTrend ?? current.heapTrend)
        : current.heapTrend,
      tickerCallbackCount: hasOwn(update, 'tickerCallbackCount')
        ? (update.tickerCallbackCount ?? current.tickerCallbackCount)
        : current.tickerCallbackCount,
      telemetryDropped: hasOwn(update, 'telemetryDropped')
        ? (update.telemetryDropped ?? current.telemetryDropped)
        : current.telemetryDropped,
    };
    if (sameObject(current, next)) return;
    this.publish({ ...this.snapshot, performance: next });
  }

  setRelease(update: ReleaseDiagnosticsUpdate): void {
    const current = this.snapshot.assets.release;
    const next: ReleaseDiagnostics = {
      version: update.version,
      contentHash: update.contentHash,
    };
    if (sameObject(current, next)) return;
    this.publish({ ...this.snapshot, assets: { ...this.snapshot.assets, release: next } });
  }

  recordAssetFailure(input: AssetFailureInput): void {
    const failure: AssetFailureDiagnostics = {
      assetId: input.assetId,
      error: input.error,
      fallbackApplied: input.fallbackApplied,
      atMs: input.atMs ?? this.now(),
    };
    this.publish({
      ...this.snapshot,
      assets: {
        ...this.snapshot.assets,
        recentFailures: [failure, ...this.snapshot.assets.recentFailures].slice(
          0,
          this.assetFailureCapacity,
        ),
      },
    });
  }

  recordError(input: RuntimeErrorInput): void {
    const error: RuntimeErrorDiagnostics = {
      source: input.source,
      message: input.message,
      atMs: input.atMs ?? this.now(),
    };
    this.publish({
      ...this.snapshot,
      errors: {
        recent: [error, ...this.snapshot.errors.recent].slice(0, this.errorCapacity),
      },
    });
  }

  private updateTransport(
    transportId: string,
    update: (current: TransportDiagnostics) => TransportDiagnostics,
  ): void {
    const current = this.snapshot.console.transports[transportId] ?? EMPTY_TRANSPORT;
    const next = update(current);
    if (sameObject(current, next)) return;
    this.publish({
      ...this.snapshot,
      console: {
        transports: { ...this.snapshot.console.transports, [transportId]: next },
      },
    });
  }

  private publish(next: DiagnosticsSnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Diagnostics observers must never interfere with event handling or rendering.
      }
    }
  }
}
