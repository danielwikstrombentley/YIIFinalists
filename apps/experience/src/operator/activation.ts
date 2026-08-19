import {
  computeDedupKey,
  isDiagnosticsOnlyAction,
  isOperatorOnlyAction,
  parseSemanticEnvelope,
  type ActionSource,
  type SemanticAction,
} from '@yii/semantic-actions';

/**
 * Development-safe fallback only. Production kiosk config supplies the active sequence through
 * `/runtime-config.json`; the sequence is deliberately never rendered or mentioned publicly.
 */
export const DEFAULT_OPERATOR_ACTIVATION_SEQUENCE: readonly SemanticAction[] = [
  { type: 'nav.back', payload: {} },
  { type: 'nav.idle', payload: {} },
  { type: 'project.select', payload: {} },
];

export const DEFAULT_OPERATOR_ACTIVATION_RATE_LIMIT_MS = 1_000;
const DEFAULT_OPERATOR_ACTIVATION_SOURCES: readonly ActionSource[] = ['operator'];

export interface OperatorActivationConfig {
  readonly sequence: readonly SemanticAction[];
  readonly rateLimitMs: number;
  /** A dedicated hidden-input source prevents the gesture from consuming visitor navigation. */
  readonly sources?: readonly ActionSource[];
}

export interface ConcealedActivationOptions extends OperatorActivationConfig {
  now?: () => number;
}

export type ActivationObservation = 'none' | 'partial' | 'activated' | 'rate-limited';

interface KioskActivationConfig {
  operatorActivationSequence?: unknown;
  operatorActivationRateLimitMs?: unknown;
  operatorActivationSources?: unknown;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function normalizeSequence(value: unknown): readonly SemanticAction[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) return null;
  const sequence: SemanticAction[] = [];

  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') return null;
    const step = candidate as Record<string, unknown>;
    const parsed = parseSemanticEnvelope({
      v: 1,
      type: step.type,
      payload: step.payload,
      source: 'simulator',
      sentAt: '2026-01-01T00:00:00.000Z',
    });
    if (
      !parsed.success ||
      isOperatorOnlyAction(parsed.data.type) ||
      isDiagnosticsOnlyAction(parsed.data.type)
    ) {
      return null;
    }
    sequence.push({ type: parsed.data.type, payload: parsed.data.payload } as SemanticAction);
  }

  return sequence;
}

function normalizeSources(value: unknown): readonly ActionSource[] {
  if (!Array.isArray(value)) return DEFAULT_OPERATOR_ACTIVATION_SOURCES;
  const sources = value.filter(
    (source): source is ActionSource =>
      source === 'console' || source === 'simulator' || source === 'operator',
  );
  return sources.length > 0 ? [...new Set(sources)] : DEFAULT_OPERATOR_ACTIVATION_SOURCES;
}

/** Safely resolves a kiosk-delivered configuration, preserving a deterministic local fallback. */
export function resolveOperatorActivationConfig(value: unknown): OperatorActivationConfig {
  const raw = value && typeof value === 'object' ? (value as KioskActivationConfig) : {};
  const sequence =
    normalizeSequence(raw.operatorActivationSequence) ?? DEFAULT_OPERATOR_ACTIVATION_SEQUENCE;
  const rateLimitMs = isPositiveFiniteNumber(raw.operatorActivationRateLimitMs)
    ? Math.floor(raw.operatorActivationRateLimitMs)
    : DEFAULT_OPERATOR_ACTIVATION_RATE_LIMIT_MS;
  return { sequence, rateLimitMs, sources: normalizeSources(raw.operatorActivationSources) };
}

/**
 * Stateful exact-sequence matcher owned by the input boundary. It observes only already-valid
 * semantic actions; malformed, rejected, duplicate, and operator-only inputs cannot advance it.
 */
export class ConcealedActivationSequence {
  private readonly keys: readonly string[];
  private readonly sources: ReadonlySet<ActionSource>;
  private readonly rateLimitMs: number;
  private readonly now: () => number;
  private position = 0;
  private lastActivatedAtMs = Number.NEGATIVE_INFINITY;

  constructor(options: ConcealedActivationOptions) {
    if (options.sequence.length === 0) {
      throw new Error('A concealed activation sequence must contain at least one action.');
    }
    this.keys = options.sequence.map((action) => computeDedupKey(action));
    this.sources = new Set(options.sources ?? DEFAULT_OPERATOR_ACTIVATION_SOURCES);
    this.rateLimitMs = Math.max(1, Math.floor(options.rateLimitMs));
    this.now = options.now ?? Date.now;
  }

  reset(): void {
    this.position = 0;
  }

  observe(
    action: Pick<SemanticAction, 'type' | 'payload'>,
    source: ActionSource = 'operator',
  ): boolean {
    return this.observeStep(action, source) === 'activated';
  }

  /**
   * The boundary consumes `partial`, `activated`, and `rate-limited` steps. This keeps a correct
   * concealed sequence from causing public navigation while a non-matching action continues
   * through the ordinary semantic-action path.
   */
  observeStep(
    action: Pick<SemanticAction, 'type' | 'payload'>,
    source: ActionSource = 'operator',
  ): ActivationObservation {
    if (!this.sources.has(source)) {
      this.reset();
      return 'none';
    }
    const key = computeDedupKey(action);
    const expected = this.keys[this.position];

    if (key === expected) {
      this.position += 1;
    } else {
      // A mismatched action restarts only when it is also the first exact step. This makes
      // overlapping sequences deterministic while refusing prefix/payload near-misses.
      this.position = key === this.keys[0] ? 1 : 0;
    }

    if (this.position === 0) return 'none';
    if (this.position !== this.keys.length) return 'partial';
    this.position = 0;

    const now = this.now();
    if (now - this.lastActivatedAtMs < this.rateLimitMs) return 'rate-limited';
    this.lastActivatedAtMs = now;
    return 'activated';
  }
}
