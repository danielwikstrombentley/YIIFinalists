import type { SemanticAction } from './actions.js';

// Deterministic, key-order-independent JSON stringify, so the derived identity never depends on
// the order properties were set on the payload object (contract boundary rule 2: identity is the
// semantic `(type, payload)` pair, not its JSON encoding).
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(',')}}`;
}

/**
 * Derives the dedup identity for an action: `(type, payload)` per contracts/semantic-input.md
 * boundary rule 2. Two actions with this same key arriving within the 1000 ms window are the
 * "identical action" the dedup window filters.
 */
export function computeDedupKey(action: Pick<SemanticAction, 'type' | 'payload'>): string {
  return `${action.type}|${stableStringify(action.payload)}`;
}
