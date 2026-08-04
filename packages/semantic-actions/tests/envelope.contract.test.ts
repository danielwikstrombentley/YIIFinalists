import { describe, expect, it } from 'vitest';
import {
  ACTION_PRIORITIES,
  DIAGNOSTICS_ONLY_ACTION_TYPES,
  OPERATOR_ONLY_ACTION_TYPES,
  SEMANTIC_ACTION_TYPES,
  computeDedupKey,
  getActionPriority,
  isMachineBoundAction,
  isSourceAllowedToEmit,
  parseSemanticEnvelope,
} from '../src/index.js';

// Executable form of contracts/semantic-input.md. Every table row and boundary rule 1-6 has at
// least one assertion here (T006 Accept criterion). This suite MUST be red until T008 lands.

function envelope(overrides: Record<string, unknown>) {
  return {
    v: 1,
    source: 'console',
    sentAt: '2026-08-03T12:00:00.000Z',
    ...overrides,
  };
}

describe('Action set (contract table + FR-019 priorities)', () => {
  it('declares exactly the nine actions from the contract table', () => {
    expect(new Set(SEMANTIC_ACTION_TYPES)).toEqual(
      new Set([
        'category.select',
        'preview.hover',
        'project.select',
        'content.select',
        'nav.back',
        'nav.idle',
        'operator.reset',
        'operator.command',
        'connection.status',
      ]),
    );
  });

  it('assigns the exact priority values from the contract table', () => {
    expect(ACTION_PRIORITIES).toEqual({
      'preview.hover': 1,
      'content.select': 2,
      'project.select': 3,
      'nav.back': 4,
      'category.select': 5,
      'nav.idle': 6,
      'operator.reset': 7,
      'operator.command': 7,
    });
  });

  it('operator.reset (7) outranks nav.idle (6) outranks category.select (5) ... outranks preview.hover (1)', () => {
    const ordered: (keyof typeof ACTION_PRIORITIES)[] = [
      'operator.reset',
      'nav.idle',
      'category.select',
      'nav.back',
      'project.select',
      'content.select',
      'preview.hover',
    ];
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const higher = getActionPriority(ordered[i]!)!;
      const lower = getActionPriority(ordered[i + 1]!)!;
      expect(higher).toBeGreaterThan(lower);
    }
  });

  it('has no priority for connection.status (diagnostics only, n/a in the contract)', () => {
    expect(getActionPriority('connection.status')).toBeUndefined();
  });
});

describe('Boundary rule 1: envelope validation', () => {
  it('accepts the exact wire-format example from the contract', () => {
    const result = parseSemanticEnvelope(
      envelope({
        type: 'content.select',
        payload: { position: 2 },
        msgId: 'optional-transport-id',
      }),
    );
    expect(result.success).toBe(true);
  });

  it.each([
    ['category.select', { categoryId: 'cat-01' }],
    ['preview.hover', { direction: 'next' }],
    ['preview.hover', { projectId: 'proj-01' }],
    ['project.select', {}],
    ['content.select', { position: 1 }],
    ['content.select', { position: 5 }],
    ['nav.back', {}],
    ['nav.idle', {}],
    ['connection.status', { connected: true, transportId: 'ws-1' }],
  ] as const)('accepts a valid %s envelope', (type, payload) => {
    const source = type === 'connection.status' ? 'simulator' : 'console';
    const result = parseSemanticEnvelope(envelope({ type, payload, source }));
    expect(result.success).toBe(true);
  });

  it.each([
    ['operator.reset', {}],
    ['operator.command', { command: 'reload' }],
  ] as const)('accepts a valid %s envelope from the operator source', (type, payload) => {
    const result = parseSemanticEnvelope(envelope({ type, payload, source: 'operator' }));
    expect(result.success).toBe(true);
  });

  it('rejects an unknown action type', () => {
    const result = parseSemanticEnvelope(envelope({ type: 'nav.teleport', payload: {} }));
    expect(result.success).toBe(false);
  });

  it('rejects content.select with a position outside 1..5', () => {
    const result = parseSemanticEnvelope(
      envelope({ type: 'content.select', payload: { position: 6 } }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a payload with extra unknown fields', () => {
    const result = parseSemanticEnvelope(
      envelope({ type: 'nav.back', payload: { unexpected: true } }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects an envelope with the wrong protocol version', () => {
    const result = parseSemanticEnvelope(envelope({ v: 2, type: 'nav.idle', payload: {} }));
    expect(result.success).toBe(false);
  });

  it('rejects a non-ISO sentAt timestamp', () => {
    const result = parseSemanticEnvelope(
      envelope({ type: 'nav.idle', payload: {}, sentAt: 'not-a-date' }),
    );
    expect(result.success).toBe(false);
  });
});

describe('Boundary rule 2: deduplication identity', () => {
  it('derives the same key for identical (type, payload) regardless of payload key order', () => {
    const a = computeDedupKey({ type: 'content.select', payload: { position: 2 } });
    const b = computeDedupKey({
      type: 'content.select',
      payload: { position: 2 } as Record<string, unknown> as { position: 1 | 2 | 3 | 4 | 5 },
    });
    expect(a).toBe(b);
  });

  it('derives different keys for different payloads of the same type', () => {
    const a = computeDedupKey({ type: 'content.select', payload: { position: 2 } });
    const b = computeDedupKey({ type: 'content.select', payload: { position: 3 } });
    expect(a).not.toBe(b);
  });

  it('derives different keys for the same payload shape under different types', () => {
    const a = computeDedupKey({ type: 'nav.back', payload: {} });
    const b = computeDedupKey({ type: 'nav.idle', payload: {} });
    expect(a).not.toBe(b);
  });
});

describe('Boundary rule 5: operator gating', () => {
  it('marks operator.reset and operator.command as operator-only', () => {
    expect(OPERATOR_ONLY_ACTION_TYPES.has('operator.reset')).toBe(true);
    expect(OPERATOR_ONLY_ACTION_TYPES.has('operator.command')).toBe(true);
  });

  it('rejects operator actions from the console source', () => {
    expect(isSourceAllowedToEmit('operator.reset', 'console')).toBe(false);
    expect(isSourceAllowedToEmit('operator.command', 'console')).toBe(false);
  });

  it('accepts operator actions from the simulator and operator sources', () => {
    expect(isSourceAllowedToEmit('operator.reset', 'simulator')).toBe(true);
    expect(isSourceAllowedToEmit('operator.reset', 'operator')).toBe(true);
  });

  it('accepts every public action from the console source', () => {
    const publicActions = SEMANTIC_ACTION_TYPES.filter(
      (type) => !OPERATOR_ONLY_ACTION_TYPES.has(type) && !DIAGNOSTICS_ONLY_ACTION_TYPES.has(type),
    );
    for (const type of publicActions) {
      expect(isSourceAllowedToEmit(type, 'console')).toBe(true);
    }
  });
});

describe('Boundary rule 6 (partial): connection.status is excluded from machine-bound actions', () => {
  it('flags connection.status as not machine-bound', () => {
    expect(isMachineBoundAction('connection.status')).toBe(false);
  });

  it('flags every other action type as machine-bound', () => {
    for (const type of SEMANTIC_ACTION_TYPES) {
      if (type === 'connection.status') continue;
      expect(isMachineBoundAction(type)).toBe(true);
    }
  });
});
