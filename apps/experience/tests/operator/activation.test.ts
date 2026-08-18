import { describe, expect, it, vi } from 'vitest';
import {
  ConcealedActivationSequence,
  type OperatorActivationConfig,
} from '../../src/operator/activation.js';
import { InputBoundary } from '../../src/input/boundary.js';

const CONFIG: OperatorActivationConfig = {
  sequence: [
    { type: 'nav.back', payload: {} },
    { type: 'nav.idle', payload: {} },
    { type: 'project.select', payload: {} },
  ],
  rateLimitMs: 1_000,
};

function envelope(type: string, payload: unknown, sentAt = '2026-08-18T12:00:00.000Z') {
  return { v: 1, type, payload, source: 'simulator', sentAt };
}

describe('ConcealedActivationSequence', () => {
  it('activates only after the exact configured action and payload sequence', () => {
    const activation = new ConcealedActivationSequence(CONFIG);

    expect(activation.observe({ type: 'nav.back', payload: {} })).toBe(false);
    expect(activation.observe({ type: 'nav.idle', payload: {} })).toBe(false);
    expect(activation.observe({ type: 'project.select', payload: {} })).toBe(true);

    expect(activation.observe({ type: 'nav.back', payload: {} })).toBe(false);
    expect(activation.observe({ type: 'nav.idle', payload: {} })).toBe(false);
    expect(activation.observe({ type: 'project.select', payload: { unexpected: true } })).toBe(
      false,
    );
  });

  it('rate-limits repeated completed sequences without weakening later activation', () => {
    let now = 0;
    const activation = new ConcealedActivationSequence({ ...CONFIG, now: () => now });
    const activate = () => {
      activation.observe({ type: 'nav.back', payload: {} });
      activation.observe({ type: 'nav.idle', payload: {} });
      return activation.observe({ type: 'project.select', payload: {} });
    };

    expect(activate()).toBe(true);
    now = 999;
    expect(activate()).toBe(false);
    now = 1_000;
    expect(activate()).toBe(true);
  });
});

describe('InputBoundary concealed activation hook', () => {
  it('accepts operator actions only after the exact hidden activation sequence succeeds', () => {
    const onAccepted = vi.fn();
    const onOperatorActivated = vi.fn();
    const boundary = new InputBoundary({
      onAccepted,
      onOperatorActivated,
      operatorActivation: CONFIG,
    });

    boundary.handle(envelope('operator.reset', {}));
    expect(onAccepted).not.toHaveBeenCalled();

    boundary.handle(envelope('nav.back', {}));
    boundary.handle(envelope('nav.idle', {}));
    boundary.handle(envelope('project.select', {}));
    expect(onOperatorActivated).toHaveBeenCalledOnce();

    boundary.handle(envelope('operator.reset', {}));
    expect(onAccepted).toHaveBeenLastCalledWith({ type: 'operator.reset', payload: {} });
  });
});
