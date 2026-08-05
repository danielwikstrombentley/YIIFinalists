import {
  computeDedupKey,
  isSourceAllowedToEmit,
  parseSemanticEnvelope,
  type ConnectionStatusPayload,
  type SemanticAction,
} from '@yii/semantic-actions';
import { ConnectionMonitor } from './connection-monitor.js';
import { DedupWindow } from './dedup.js';
import { HoverOrdering } from './ordering.js';
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

export interface InputBoundaryOptions {
  onAccepted: (action: SemanticAction) => void;
  onRejected?: (reason: RejectReason, raw: unknown) => void;
  onConnectionStatus?: (status: ConnectionStatusPayload) => void;
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
  private activeProjectId: string | null = null;

  constructor(options: InputBoundaryOptions) {
    this.options = options;
    this.dedupWindow = new DedupWindow({ windowMs: options.dedupWindowMs, now: options.now });
    this.releaseValidator = options.releaseValidator ?? PERMISSIVE_RELEASE_VALIDATOR;
  }

  /** Handles one raw wire message. Never throws — every failure path is a logged, safe reject. */
  handle(rawEnvelope: unknown): void {
    const result = parseSemanticEnvelope(rawEnvelope);
    if (!result.success) {
      this.reject('invalid-envelope', rawEnvelope);
      return;
    }
    const envelope = result.data;

    if (envelope.type === 'connection.status') {
      // connection.status: diagnostics only, bypasses dedup/priority/ordering entirely.
      this.connectionMonitor.setStatus(envelope.payload.transportId, envelope.payload.connected);
      this.options.onConnectionStatus?.(envelope.payload);
      return;
    }

    if (!isSourceAllowedToEmit(envelope.type, envelope.source)) {
      this.reject('operator-only', rawEnvelope);
      return;
    }

    if (!this.passesRefValidation(envelope)) {
      this.reject('unknown-ref', rawEnvelope);
      return;
    }

    const action = { type: envelope.type, payload: envelope.payload } as SemanticAction;
    const dedupKey = computeDedupKey(action);
    if (!this.dedupWindow.accept(dedupKey)) {
      this.reject('duplicate', rawEnvelope);
      return;
    }

    if (!canPassPriorityGate(envelope.type, this.options.getExclusivePriority?.())) {
      this.reject('priority-gate', rawEnvelope);
      return;
    }

    if (envelope.type === 'preview.hover') {
      // Both hover payload forms (explicit projectId or direction) use `sentAt` for per-source
      // supersession — a newer hover always wins over an unprocessed older one (boundary rule 4).
      const sentAtMs = Date.parse(envelope.sentAt);
      if (!this.hoverOrdering.shouldProcess(envelope.source, sentAtMs)) {
        this.reject('superseded', rawEnvelope);
        return;
      }
    }

    this.options.onAccepted(action);
  }

  /** Boundary rule 6: reconnect resumes input handling with dedup state reset. */
  notifyReconnect(): void {
    this.dedupWindow.reset();
    this.hoverOrdering.reset();
  }

  /**
   * Tracks the machine's currently selected/landed project (Principle I keeps the machine as the
   * single source of truth; the boundary just mirrors it) so a bare `content.select { position }`
   * — whose payload carries no projectId of its own — can be checked against the right project.
   */
  setActiveProject(projectId: string | null): void {
    this.activeProjectId = projectId;
  }

  private passesRefValidation(envelope: { type: string; payload: unknown }): boolean {
    if (envelope.type === 'category.select') {
      const { categoryId } = envelope.payload as { categoryId: string };
      return this.releaseValidator.hasCategory(categoryId);
    }
    if (envelope.type === 'preview.hover') {
      const payload = envelope.payload as { projectId?: string };
      if (payload.projectId) {
        return this.releaseValidator.hasProject(payload.projectId);
      }
    }
    if (envelope.type === 'content.select') {
      const { position } = envelope.payload as { position: number };
      return this.releaseValidator.hasContentPosition(this.activeProjectId, position);
    }
    return true;
  }

  private reject(reason: RejectReason, raw: unknown): void {
    this.options.onRejected?.(reason, raw);
  }
}
