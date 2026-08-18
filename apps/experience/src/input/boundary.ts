import {
  computeDedupKey,
  isSourceAllowedToEmit,
  parseSemanticEnvelope,
  type ActionSource,
  type ConnectionStatusPayload,
  type SemanticAction,
} from '@yii/semantic-actions';
import { ConnectionMonitor } from './connection-monitor.js';
import { DedupWindow } from './dedup.js';
import { HoverOrdering } from './ordering.js';
import {
  ConcealedActivationSequence,
  resolveOperatorActivationConfig,
  type OperatorActivationConfig,
} from '../operator/activation.js';
import { canPassPriorityGate, type ExclusivePriorityProvider } from './priority-gate.js';
import { PERMISSIVE_RELEASE_VALIDATOR, type ReleaseRefValidator } from './validate.js';

// The input boundary (T013): transport adapters -> [validation -> 1s dedup -> priority gate ->
// ordering] -> state machine; connection monitor feeds diagnostics only. Every reject path is
// logged (onRejected) and has zero public effect (boundary rule 1) — nothing here ever throws
// on untrusted input.

export type RejectReason =
  | 'invalid-envelope'
  | 'unknown-ref'
  | 'duplicate'
  | 'priority-gate'
  | 'superseded'
  | 'operator-only';

/** Passive diagnostics/telemetry hooks; observers never receive authority to send a machine event. */
export type InputBoundaryObservation =
  | {
      kind: 'accepted';
      action: SemanticAction;
      source: ActionSource;
      atMs: number;
      /** Monotonic receipt id used only to pair passive response-latency observations. */
      receiptId: number;
    }
  | { kind: 'response'; receiptId: number; atMs: number }
  | {
      kind: 'rejected';
      reason: RejectReason;
      source: ActionSource | null;
      atMs: number;
    }
  | {
      kind: 'connection';
      payload: ConnectionStatusPayload;
      atMs: number;
    }
  | { kind: 'operator-activated'; atMs: number };

export interface InputBoundaryOptions {
  onAccepted: (action: SemanticAction) => void;
  onRejected?: (reason: RejectReason, raw: unknown) => void;
  onConnectionStatus?: (status: ConnectionStatusPayload) => void;
  onObservation?: (observation: InputBoundaryObservation) => void;
  /** Opens the hidden overlay after an exact, rate-limited configured sequence succeeds. */
  onOperatorActivated?: () => void;
  /** Kiosk-delivered concealed activation configuration; public sources never see this value. */
  operatorActivation?: OperatorActivationConfig;
  releaseValidator?: ReleaseRefValidator;
  getExclusivePriority?: ExclusivePriorityProvider;
  dedupWindowMs?: number;
  now?: () => number;
}

export class InputBoundary {
  private readonly options: InputBoundaryOptions;
  private readonly dedupWindow: DedupWindow;
  private readonly hoverOrdering = new HoverOrdering();
  private readonly connectionMonitor = new ConnectionMonitor();
  private readonly releaseValidator: ReleaseRefValidator;
  private readonly now: () => number;
  private operatorActivation: ConcealedActivationSequence;
  private operatorActive = false;
  private activeProjectId: string | null = null;
  private activeCategoryId: string | null = null;
  private receiptSequence = 0;

  constructor(options: InputBoundaryOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
    this.dedupWindow = new DedupWindow({ windowMs: options.dedupWindowMs, now: this.now });
    this.releaseValidator = options.releaseValidator ?? PERMISSIVE_RELEASE_VALIDATOR;
    this.operatorActivation = new ConcealedActivationSequence({
      ...(options.operatorActivation ?? resolveOperatorActivationConfig(undefined)),
      now: this.now,
    });
  }

  /** Handles one raw wire message. Never throws — every failure path is a logged, safe reject. */
  handle(rawEnvelope: unknown): void {
    const receivedAtMs = this.now();
    const result = parseSemanticEnvelope(rawEnvelope);
    if (!result.success) {
      this.reject('invalid-envelope', rawEnvelope, null, receivedAtMs);
      return;
    }
    const envelope = result.data;

    if (envelope.type === 'connection.status') {
      // connection.status: diagnostics only, bypasses dedup/priority/ordering entirely.
      const previous = this.connectionMonitor.get(envelope.payload.transportId);
      this.connectionMonitor.setStatus(envelope.payload.transportId, envelope.payload.connected);
      if (envelope.payload.connected && previous?.connected === false) this.notifyReconnect();
      this.options.onConnectionStatus?.(envelope.payload);
      this.observe({ kind: 'connection', payload: envelope.payload, atMs: receivedAtMs });
      return;
    }

    this.connectionMonitor.recordMessage(envelope.source, receivedAtMs);

    if (!isSourceAllowedToEmit(envelope.type, envelope.source)) {
      this.reject('operator-only', rawEnvelope, envelope.source, receivedAtMs);
      return;
    }

    // Concealed activation is owned by a dedicated operator input source. Match and consume it
    // before visitor validation/dedup/priority processing so it can never cause a public
    // navigation side effect (or be defeated by a recent public press with the same identity).
    const activationAction = {
      type: envelope.type,
      payload: envelope.payload,
    } as SemanticAction;
    const activation = this.operatorActivation.observeStep(activationAction, envelope.source);
    if (activation !== 'none') {
      if (activation === 'activated') {
        this.operatorActive = true;
        this.observe({ kind: 'operator-activated', atMs: receivedAtMs });
        try {
          this.options.onOperatorActivated?.();
        } catch {
          // An overlay listener must never prevent a public semantic action from being handled.
        }
      }
      return;
    }

    if (
      (envelope.type === 'operator.reset' || envelope.type === 'operator.command') &&
      !this.operatorActive
    ) {
      this.reject('operator-only', rawEnvelope, envelope.source, receivedAtMs);
      return;
    }

    if (!this.passesRefValidation(envelope)) {
      this.reject('unknown-ref', rawEnvelope, envelope.source, receivedAtMs);
      return;
    }

    if (!canPassPriorityGate(envelope.type, this.options.getExclusivePriority?.())) {
      this.reject('priority-gate', rawEnvelope, envelope.source, receivedAtMs);
      return;
    }

    let hoverSentAtMs: number | undefined;
    if (envelope.type === 'preview.hover') {
      // Both hover payload forms (explicit projectId or direction) use `sentAt` for per-source
      // supersession — a newer hover always wins over an unprocessed older one (boundary rule 4).
      hoverSentAtMs = Date.parse(envelope.sentAt);
      if (!this.hoverOrdering.canProcess(envelope.source, hoverSentAtMs)) {
        this.reject('superseded', rawEnvelope, envelope.source, receivedAtMs);
        return;
      }
    }

    const action = activationAction;
    const dedupKey = computeDedupKey(action);
    if (!this.dedupWindow.isAccepted(dedupKey)) {
      this.reject('duplicate', rawEnvelope, envelope.source, receivedAtMs);
      return;
    }

    // The action has crossed every validation, priority, ordering, and dedup gate. Record it as
    // accepted only now so rejected input can never suppress a later deliberate signal.
    this.dedupWindow.recordAccepted(dedupKey);
    if (hoverSentAtMs !== undefined) {
      this.hoverOrdering.recordAccepted(envelope.source, hoverSentAtMs);
    }
    const receiptId = this.receiptSequence;
    this.receiptSequence += 1;
    this.observe({
      kind: 'accepted',
      action,
      source: envelope.source,
      atMs: receivedAtMs,
      receiptId,
    });
    try {
      this.options.onAccepted(action);
    } finally {
      // This remains synchronous and passive. A machine subscription can update telemetry's
      // read model during onAccepted() before the response observation is delivered.
      this.observe({ kind: 'response', receiptId, atMs: this.now() });
    }
  }

  /** Boundary rule 6: reconnect resumes input handling with dedup state reset. */
  notifyReconnect(): void {
    this.dedupWindow.reset();
    this.hoverOrdering.reset();
  }

  /** Replaces kiosk configuration and closes any current operator capability until reactivated. */
  setOperatorActivationConfig(config: OperatorActivationConfig): void {
    this.operatorActivation = new ConcealedActivationSequence({ ...config, now: this.now });
    this.operatorActive = false;
  }

  /** Closing the operator layer removes its command capability without changing public state. */
  deactivateOperator(): void {
    this.operatorActive = false;
    this.operatorActivation.reset();
  }

  /**
   * Tracks the machine's currently selected/landed project (Principle I keeps the machine as the
   * single source of truth; the boundary just mirrors it) so a bare `content.select { position }`
   * — whose payload carries no projectId of its own — can be checked against the right project.
   */
  setActiveProject(projectId: string | null): void {
    this.activeProjectId = projectId;
  }

  /**
   * Tracks the machine's currently active category so an explicit `preview.hover { projectId }`
   * ref can be validated as belonging to that category, not merely existing anywhere in the
   * release (PH2 round 2 finding #1 — a project from another category was previously accepted).
   */
  setActiveCategory(categoryId: string | null): void {
    this.activeCategoryId = categoryId;
  }

  private passesRefValidation(envelope: { type: string; payload: unknown }): boolean {
    if (envelope.type === 'category.select') {
      const { categoryId } = envelope.payload as { categoryId: string };
      return this.releaseValidator.hasCategory(categoryId);
    }
    if (envelope.type === 'preview.hover') {
      const payload = envelope.payload as { projectId?: string };
      if (payload.projectId) {
        return this.releaseValidator.hasProject(this.activeCategoryId, payload.projectId);
      }
    }
    if (envelope.type === 'content.select') {
      const { position } = envelope.payload as { position: number };
      return this.releaseValidator.hasContentPosition(this.activeProjectId, position);
    }
    return true;
  }

  private reject(
    reason: RejectReason,
    raw: unknown,
    source: ActionSource | null,
    atMs: number,
  ): void {
    this.options.onRejected?.(reason, raw);
    this.observe({ kind: 'rejected', reason, source, atMs });
  }

  private observe(observation: InputBoundaryObservation): void {
    try {
      this.options.onObservation?.(observation);
    } catch {
      // Diagnostics and telemetry subscribers are passive by design and cannot disrupt input.
    }
  }
}
