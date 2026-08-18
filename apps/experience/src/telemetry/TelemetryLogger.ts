import type { InputBoundaryObservation } from '../input/boundary.js';
import type { SemanticAction } from '@yii/semantic-actions';

/** FR-038 event kinds accepted by the runtime and kiosk sink. */
export const TELEMETRY_EVENT_KINDS = [
  'start',
  'reset',
  'connect',
  'disconnect',
  'category',
  'preview',
  'select',
  'content',
  'replay',
  'interrupt',
  'return',
  'mediaFailure',
  'assetFailure',
  'rendererFailure',
  'recovery',
] as const;

export type TelemetryEventKind = (typeof TELEMETRY_EVENT_KINDS)[number];
export type TelemetryFields = Readonly<Record<string, unknown>>;

/** The JSON envelope written to the kiosk sidecar. */
export interface TelemetryEvent {
  readonly v: 1;
  readonly ts: string;
  readonly sessionId: string;
  readonly seq: number;
  readonly kind: TelemetryEventKind;
  readonly stateBefore?: string;
  readonly stateAfter?: string;
  readonly refs?: TelemetryFields;
  readonly latencyMs?: number;
  readonly detail?: TelemetryFields;
}

/** Fields supplied by runtime producers; envelope fields are added by `TelemetryLogger`. */
export interface TelemetryEventInput {
  readonly kind: TelemetryEventKind;
  readonly stateBefore?: string;
  readonly stateAfter?: string;
  readonly refs?: TelemetryFields;
  readonly latencyMs?: number;
  readonly detail?: TelemetryFields;
}

export interface TelemetryFetchResponse {
  readonly ok: boolean;
}

export type TelemetryFetch = (
  input: string,
  init?: RequestInit,
) => PromiseLike<TelemetryFetchResponse>;

export interface TelemetryLoggerOptions {
  endpoint?: string;
  capacity?: number;
  batchSize?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  sessionId?: string;
  now?: () => number;
  fetchImpl?: TelemetryFetch;
  /** Disables automatic flush scheduling for deterministic unit tests or deliberate local use. */
  autoFlush?: boolean;
  /** Called synchronously when the ring drops its oldest event. It must remain passive. */
  onDropped?: (totalDropped: number) => void;
}

export type TelemetryValidationResult =
  | { readonly success: true; readonly data: TelemetryEvent }
  | { readonly success: false; readonly error: string };

const TELEMETRY_EVENT_KIND_SET: ReadonlySet<string> = new Set(TELEMETRY_EVENT_KINDS);
const TELEMETRY_EVENT_KEYS = new Set([
  'v',
  'ts',
  'sessionId',
  'seq',
  'kind',
  'stateBefore',
  'stateAfter',
  'refs',
  'latencyMs',
  'detail',
]);
const ISO_DATETIME_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+(?:0\d|1\d|2[0-3]):[0-5]\d|-(?:0\d|1\d|2[0-3]):[0-5]\d)$/;

/**
 * Validates the FR-038 envelope without importing the Node kiosk package into the browser app.
 * The runtime intentionally keeps this validator dependency-free; the sidecar validates again at
 * its own boundary before appending JSONL.
 */
export function validateTelemetryEvent(value: unknown): TelemetryValidationResult {
  if (!isPlainObject(value)) return invalid('event must be an object');
  if (Object.keys(value).some((key) => !TELEMETRY_EVENT_KEYS.has(key))) {
    return invalid('event contains an unknown field');
  }
  if (value.v !== 1) return invalid('v must be 1');
  if (typeof value.ts !== 'string' || !isIsoDateTimeWithOffset(value.ts)) {
    return invalid('ts must be an ISO datetime with an offset');
  }
  if (typeof value.sessionId !== 'string' || value.sessionId.length === 0) {
    return invalid('sessionId must be a non-empty string');
  }
  if (!isNonNegativeInteger(value.seq)) return invalid('seq must be a non-negative integer');
  if (typeof value.kind !== 'string' || !TELEMETRY_EVENT_KIND_SET.has(value.kind)) {
    return invalid('kind is not a supported telemetry event kind');
  }
  if (!isOptionalString(value.stateBefore)) return invalid('stateBefore must be a string');
  if (!isOptionalString(value.stateAfter)) return invalid('stateAfter must be a string');
  if (!isOptionalFields(value.refs)) return invalid('refs must be an object');
  if (value.latencyMs !== undefined && !isNonNegativeFiniteNumber(value.latencyMs)) {
    return invalid('latencyMs must be a non-negative finite number');
  }
  if (!isOptionalFields(value.detail)) return invalid('detail must be an object');
  if (!isJsonSerializable(value)) return invalid('event must be JSON serializable');

  return { success: true, data: value as unknown as TelemetryEvent };
}

export function isTelemetryEvent(value: unknown): value is TelemetryEvent {
  return validateTelemetryEvent(value).success;
}

interface PendingReceipt {
  readonly action: SemanticAction;
  readonly source: string;
  readonly receivedAtMs: number;
  readonly stateBefore: string;
  readonly refs: TelemetryFields;
}

const DEFAULT_CAPACITY = 5_000;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_RETRY_BASE_DELAY_MS = 250;
const DEFAULT_RETRY_MAX_DELAY_MS = 10_000;
const MAX_PENDING_RECEIPTS = 256;

/**
 * Browser-side, fire-and-forget telemetry producer.
 *
 * `record()`, boundary observations, and state observations are synchronous and never await a
 * sink operation. POST work is started from a microtask, while failures are retried with a small
 * bounded timer. The logger has no navigation authority; its only externally visible side effect
 * is the operator-only overflow callback.
 */
export class TelemetryLogger {
  private readonly endpoint: string;
  private readonly capacity: number;
  private readonly batchSize: number;
  private readonly retryBaseDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly now: () => number;
  private readonly fetchImpl: TelemetryFetch;
  private readonly autoFlush: boolean;
  private readonly onDropped?: (totalDropped: number) => void;
  private readonly buffer: TelemetryEvent[] = [];
  private readonly inFlightBatch: TelemetryEvent[] = [];
  private readonly pendingReceipts = new Map<number, PendingReceipt>();
  private readonly session: string;
  private currentStatePath = 'boot';
  private currentRefs: TelemetryFields = {};
  private releaseContext: TelemetryFields = {};
  private sequence = 0;
  private dropped = 0;
  private inFlight = false;
  private flushQueued = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private disposed = false;
  private started = false;
  private lastContentKey: string | null = null;

  constructor(options: TelemetryLoggerOptions = {}) {
    this.endpoint = options.endpoint ?? '/telemetry';
    this.capacity = boundedPositiveInteger(options.capacity, DEFAULT_CAPACITY);
    this.batchSize = Math.min(
      this.capacity,
      boundedPositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE),
    );
    this.retryBaseDelayMs = boundedPositiveInteger(
      options.retryBaseDelayMs,
      DEFAULT_RETRY_BASE_DELAY_MS,
    );
    this.retryMaxDelayMs = Math.max(
      this.retryBaseDelayMs,
      boundedPositiveInteger(options.retryMaxDelayMs, DEFAULT_RETRY_MAX_DELAY_MS),
    );
    this.now = options.now ?? Date.now;
    this.fetchImpl = options.fetchImpl ?? defaultFetch;
    this.autoFlush = options.autoFlush ?? true;
    this.onDropped = options.onDropped;
    this.session = nonEmpty(options.sessionId) ? options.sessionId : createSessionId();
  }

  get sessionId(): string {
    return this.session;
  }

  get telemetryDropped(): number {
    return this.dropped;
  }

  get pendingCount(): number {
    return this.buffer.length + this.inFlightBatch.length;
  }

  get statePath(): string {
    return this.currentStatePath;
  }

  /** A copy is exposed only for diagnostics/tests; callers cannot mutate the ring itself. */
  getPendingEvents(): readonly TelemetryEvent[] {
    return [...this.buffer];
  }

  /** Stores one validated event and schedules a non-blocking flush. */
  record(input: TelemetryEventInput): TelemetryEvent | null {
    if (this.disposed || !isPlainObject(input)) return null;

    let timestamp: string;
    try {
      timestamp = new Date(this.now()).toISOString();
    } catch {
      return null;
    }

    const candidate: Record<string, unknown> = {
      v: 1,
      ts: timestamp,
      sessionId: this.session,
      seq: this.sequence,
      kind: input.kind,
    };
    if (input.stateBefore !== undefined) candidate.stateBefore = input.stateBefore;
    if (input.stateAfter !== undefined) candidate.stateAfter = input.stateAfter;
    if (input.refs !== undefined) candidate.refs = input.refs;
    if (input.latencyMs !== undefined) candidate.latencyMs = input.latencyMs;
    if (input.detail !== undefined) candidate.detail = input.detail;

    const result = validateTelemetryEvent(candidate);
    if (!result.success) return null;

    this.sequence += 1;
    this.buffer.push(result.data);
    this.trimOverflow();
    this.scheduleFlush();
    return result.data;
  }

  /** Alias for callers that use the event-oriented terminology from the contract. */
  log(input: TelemetryEventInput): TelemetryEvent | null {
    return this.record(input);
  }

  /**
   * Updates the state/ref read model and emits the one required boot-complete `start` event.
   * Action events use this read model for stateBefore/stateAfter; it never sends machine events.
   */
  observeStateTransition(input: {
    readonly stateAfter: string;
    readonly refs?: TelemetryFields;
  }): void {
    if (this.disposed || typeof input.stateAfter !== 'string' || input.stateAfter.length === 0) {
      return;
    }
    const stateBefore = this.currentStatePath;
    this.currentStatePath = input.stateAfter;
    this.currentRefs = input.refs ?? {};

    if (!this.started && stateBefore === 'boot' && input.stateAfter === 'idle') {
      this.started = true;
      this.record({
        kind: 'start',
        stateBefore,
        stateAfter: input.stateAfter,
        refs: this.currentRefs,
        detail: this.releaseContext,
      });
    }
  }

  /** Adds release metadata to the next boot-complete start event without logging credentials. */
  setReleaseContext(input: { readonly version?: string; readonly contentHash?: string }): void {
    const detail: Record<string, unknown> = {};
    if (nonEmpty(input.version)) detail.releaseVersion = input.version;
    if (nonEmpty(input.contentHash)) detail.contentHash = input.contentHash;
    this.releaseContext = detail;
  }

  /** Records a passive lifecycle/failure observation using the current state read model. */
  observeEvent(input: TelemetryEventInput): void {
    this.record({
      ...input,
      stateBefore: input.stateBefore ?? this.currentStatePath,
      stateAfter: input.stateAfter ?? this.currentStatePath,
    });
  }

  /**
   * Consumes passive input-boundary observations. Accepted actions are completed after dispatch by
   * the boundary's response observation, which captures receipt → first synchronous state response
   * latency without putting a Promise or sink operation on the action path.
   */
  observeInputObservation(observation: InputBoundaryObservation): void {
    if (this.disposed) return;

    if (observation.kind === 'accepted') {
      this.pendingReceipts.set(observation.receiptId, {
        action: observation.action,
        source: observation.source,
        receivedAtMs: observation.atMs,
        stateBefore: this.currentStatePath,
        refs: this.currentRefs,
      });
      this.trimPendingReceipts();
      return;
    }

    if (observation.kind === 'response') {
      const pending = this.pendingReceipts.get(observation.receiptId);
      if (!pending) return;
      this.pendingReceipts.delete(observation.receiptId);
      this.recordActionReceipt(pending, observation.atMs);
      return;
    }

    if (observation.kind === 'connection') {
      this.record({
        kind: observation.payload.connected ? 'connect' : 'disconnect',
        stateBefore: this.currentStatePath,
        stateAfter: this.currentStatePath,
        refs: { transportId: observation.payload.transportId },
      });
      return;
    }

    // The FR-038 contract has no separate `rejected` event kind. Rejections remain diagnostics-only
    // so invalid/untrusted input cannot be represented as a misleading successful interaction.
  }

  /** Flushes one batch immediately; callers still do not await the returned work. */
  flush(): void {
    if (this.disposed || this.inFlight || this.retryTimer || this.buffer.length === 0) return;

    const batch = this.buffer.splice(0, this.batchSize);
    this.inFlightBatch.push(...batch);
    this.inFlight = true;
    let request: PromiseLike<TelemetryFetchResponse>;
    try {
      request = this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });
    } catch {
      this.handleFailure(batch);
      return;
    }

    Promise.resolve(request).then(
      (response) => {
        this.inFlight = false;
        this.inFlightBatch.splice(0, batch.length);
        if (response.ok) {
          this.retryAttempt = 0;
          this.scheduleFlush();
          return;
        }
        this.handleFailure(batch);
      },
      () => this.handleFailure(batch),
    );
  }

  /** Releases timers and prevents any later retry from touching the sink. */
  dispose(): void {
    this.disposed = true;
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.pendingReceipts.clear();
  }

  private recordActionReceipt(pending: PendingReceipt, responseAtMs: number): void {
    const action = pending.action;
    const stateAfter = this.currentStatePath;
    const latencyMs = Math.max(0, responseAtMs - pending.receivedAtMs);
    const actionRefs = actionRefsFor(action, pending.refs, this.currentRefs);
    const detail: Record<string, unknown> = { source: pending.source };
    const kind = actionKindFor(action, stateAfter, actionRefs, this.lastContentKey);

    if (action.type === 'content.select') {
      this.lastContentKey = `${String(actionRefs.projectId ?? '')}:${action.payload.position}`;
    }
    if (action.type === 'operator.command') detail.command = action.payload.command;

    this.record({
      kind,
      stateBefore: pending.stateBefore,
      stateAfter,
      refs: actionRefs,
      latencyMs,
      detail,
    });
  }

  private scheduleFlush(): void {
    if (!this.autoFlush || this.flushQueued || this.inFlight || this.retryTimer) return;
    this.flushQueued = true;
    queueMicrotask(() => {
      this.flushQueued = false;
      this.flush();
    });
  }

  private handleFailure(batch: readonly TelemetryEvent[]): void {
    this.inFlight = false;
    this.inFlightBatch.splice(0, batch.length);
    if (this.disposed) return;

    this.buffer.unshift(...batch);
    this.trimOverflow();
    this.retryAttempt += 1;
    const delay = Math.min(
      this.retryMaxDelayMs,
      this.retryBaseDelayMs * 2 ** Math.max(0, this.retryAttempt - 1),
    );
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.flush();
    }, delay);
  }

  private trimOverflow(): void {
    const overflow = this.buffer.length + this.inFlightBatch.length - this.capacity;
    if (overflow <= 0) return;
    const dropped = Math.min(overflow, this.buffer.length);
    this.buffer.splice(0, dropped);
    this.dropped += dropped;
    try {
      this.onDropped?.(this.dropped);
    } catch {
      // Diagnostics is a passive read model and must not affect the input or telemetry ring.
    }
  }

  private trimPendingReceipts(): void {
    while (this.pendingReceipts.size > MAX_PENDING_RECEIPTS) {
      const oldest = this.pendingReceipts.keys().next().value;
      if (oldest === undefined) return;
      this.pendingReceipts.delete(oldest);
    }
  }
}

function actionKindFor(
  action: SemanticAction,
  stateAfter: string,
  refs: TelemetryFields,
  lastContentKey: string | null,
): TelemetryEventKind {
  switch (action.type) {
    case 'category.select':
      return 'category';
    case 'preview.hover':
      return 'preview';
    case 'project.select':
      return 'select';
    case 'content.select': {
      const contentKey = `${String(refs.projectId ?? '')}:${action.payload.position}`;
      return lastContentKey === contentKey &&
        (stateAfter === 'contentPlaying' || stateAfter === 'contentFinalHold')
        ? 'replay'
        : 'content';
    }
    case 'nav.back':
    case 'nav.idle':
      return 'return';
    case 'operator.reset':
      return 'reset';
    case 'operator.command':
      return 'recovery';
    case 'connection.status':
      return action.payload.connected ? 'connect' : 'disconnect';
  }
}

function actionRefsFor(
  action: SemanticAction,
  pendingRefs: TelemetryFields,
  currentRefs: TelemetryFields,
): TelemetryFields {
  const refs: Record<string, unknown> = {};
  const projectId = scalarString(currentRefs.projectId) ?? scalarString(pendingRefs.projectId);
  const categoryId = scalarString(currentRefs.categoryId) ?? scalarString(pendingRefs.categoryId);
  if (categoryId) refs.categoryId = categoryId;
  if (projectId) refs.projectId = projectId;

  switch (action.type) {
    case 'category.select':
      refs.categoryId = action.payload.categoryId;
      break;
    case 'preview.hover':
      if ('projectId' in action.payload) refs.projectId = action.payload.projectId;
      if ('direction' in action.payload) refs.direction = action.payload.direction;
      break;
    case 'content.select':
      refs.position = action.payload.position;
      break;
    case 'nav.back':
    case 'nav.idle':
      refs.target = action.type === 'nav.idle' ? 'idle' : 'preview';
      break;
    case 'operator.command':
      refs.command = action.payload.command;
      break;
    case 'project.select':
    case 'operator.reset':
    case 'connection.status':
      break;
  }
  return refs;
}

function scalarString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function validateOptionalRecord(value: unknown): value is TelemetryFields {
  return value === undefined || isPlainObject(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isOptionalFields(value: unknown): value is TelemetryFields | undefined {
  return validateOptionalRecord(value) && (value === undefined || isJsonSerializable(value));
}

function isIsoDateTimeWithOffset(value: string): boolean {
  return ISO_DATETIME_WITH_OFFSET.test(value) && Number.isFinite(Date.parse(value));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonSerializable(value: unknown): boolean {
  try {
    return JSON.stringify(value) !== undefined;
  } catch {
    return false;
  }
}

function invalid(error: string): TelemetryValidationResult {
  return { success: false, error };
}

function boundedPositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function nonEmpty(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

function defaultFetch(input: string, init?: RequestInit): PromiseLike<TelemetryFetchResponse> {
  if (typeof globalThis.fetch !== 'function') {
    return Promise.reject(new Error('fetch is unavailable'));
  }
  return globalThis.fetch(input, init);
}

function createSessionId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] ?? 0) & 0x0f;
  bytes[6] = (bytes[6] ?? 0) | 0x40;
  bytes[8] = (bytes[8] ?? 0) & 0x3f;
  bytes[8] = (bytes[8] ?? 0) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
