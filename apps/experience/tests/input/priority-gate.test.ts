import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeDependencies } from '../../src/app/bootstrap.js';
import { exclusivePriorityForState } from '../../src/input/priority-gate.js';

function envelope(type: string, payload: unknown) {
  return {
    v: 1,
    type,
    payload,
    source: 'simulator',
    sentAt: '2026-08-18T12:00:00.000Z',
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Phase 06 exclusive priority wiring', () => {
  it('declares only handover states as exclusive, with the action that opened each transition as its floor', () => {
    expect(exclusivePriorityForState('transitionToProject')).toBe(3);
    expect(exclusivePriorityForState('transitionToPreview')).toBe(4);
    expect(exclusivePriorityForState('idle')).toBeUndefined();
    expect(exclusivePriorityForState({ categoryActive: 'preview' })).toBeUndefined();
  });

  it('feeds the live InputBoundary from the current machine state so lower actions are rejected while equal and higher actions proceed', () => {
    const send = vi.fn();
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    let state: unknown = 'transitionToProject';
    const dependencies = createRuntimeDependencies({
      send,
      getExclusivePriority: () => exclusivePriorityForState(state),
    });

    dependencies.boundary.handle(envelope('preview.hover', { direction: 'next' }));
    expect(send).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledWith('[input] rejected', 'priority-gate', expect.anything());

    dependencies.boundary.handle(envelope('project.select', {}));
    dependencies.boundary.handle(envelope('nav.back', {}));
    expect(send).toHaveBeenCalledWith({ type: 'project.select', payload: {} });
    expect(send).toHaveBeenCalledWith({ type: 'nav.back', payload: {} });

    state = 'idle';
    dependencies.boundary.handle(envelope('preview.hover', { direction: 'next' }));
    expect(send).toHaveBeenCalledWith({
      type: 'preview.hover',
      payload: { direction: 'next' },
    });
  });
});
