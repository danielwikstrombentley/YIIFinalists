import { describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { parseOperatorCommand } from '../../src/operator/commands.js';
import {
  deepResetRuntime,
  executeRecoveryCommand,
  type RecoveryRuntimeTargets,
} from '../../src/state/recovery.js';
import { experienceMachine } from '../../src/state/machine.js';

function targets(): RecoveryRuntimeTargets & {
  globeRebuild: ReturnType<typeof vi.fn>;
  cesiumRebuild: ReturnType<typeof vi.fn>;
  cancelContent: ReturnType<typeof vi.fn>;
  forceMediaFailure: ReturnType<typeof vi.fn>;
  clearPreloadCache: ReturnType<typeof vi.fn>;
  requestReload: ReturnType<typeof vi.fn>;
  resetCesium: ReturnType<typeof vi.fn>;
} {
  const globeRebuild = vi.fn();
  const cesiumRebuild = vi.fn();
  const cancelContent = vi.fn();
  const forceMediaFailure = vi.fn(() => true);
  const clearPreloadCache = vi.fn();
  const requestReload = vi.fn();
  const resetCesium = vi.fn();
  return {
    globeRebuild,
    cesiumRebuild,
    cancelContent,
    forceMediaFailure,
    resetCesium,
    globe: { rebuild: globeRebuild },
    cesium: { rebuild: cesiumRebuild, reset: resetCesium, clearPreloadCache },
    content: { cancel: cancelContent, forceMediaFailure },
    clearPreloadCache,
    requestReload,
  };
}

describe('operator command validation', () => {
  it('accepts only the defined recovery command set and validates renderer names', () => {
    expect(parseOperatorCommand({ command: 'forceMediaFailure' })).toEqual({
      kind: 'forceMediaFailure',
    });
    expect(
      parseOperatorCommand({ command: 'rendererRecover', params: { renderer: 'globe' } }),
    ).toEqual({
      kind: 'rendererRecover',
      renderer: 'globe',
    });
    expect(
      parseOperatorCommand({ command: 'rendererRecover', params: { renderer: 'invalid' } }),
    ).toBeNull();
    expect(
      parseOperatorCommand({ command: 'untrusted-open-url', params: { url: 'https://x.example' } }),
    ).toBeNull();
  });
});

describe('recovery ladder', () => {
  it('executes every non-reset rung without throwing and leaves unknown commands inert', async () => {
    const runtime = targets();

    await expect(executeRecoveryCommand(runtime, { kind: 'forceMediaFailure' })).resolves.toEqual({
      status: 'completed',
      rung: 'media-recovery',
    });
    await expect(
      executeRecoveryCommand(runtime, { kind: 'rendererRecover', renderer: 'globe' }),
    ).resolves.toEqual({ status: 'completed', rung: 'renderer-recovery' });
    await expect(
      executeRecoveryCommand(runtime, { kind: 'rendererRecover', renderer: 'cesium' }),
    ).resolves.toEqual({ status: 'completed', rung: 'renderer-recovery' });
    await expect(executeRecoveryCommand(runtime, { kind: 'clearPreloadCache' })).resolves.toEqual({
      status: 'completed',
      rung: 'cache-clear',
    });
    await expect(executeRecoveryCommand(runtime, { kind: 'reloadApp' })).resolves.toEqual({
      status: 'requested',
      rung: 'reload',
    });
    await expect(executeRecoveryCommand(runtime, null)).resolves.toEqual({
      status: 'rejected',
      rung: 'none',
    });

    expect(runtime.forceMediaFailure).toHaveBeenCalledOnce();
    expect(runtime.globeRebuild).toHaveBeenCalledOnce();
    expect(runtime.cesiumRebuild).toHaveBeenCalledOnce();
    expect(runtime.clearPreloadCache).toHaveBeenCalledOnce();
    expect(runtime.requestReload).toHaveBeenCalledOnce();
  });

  it('deep reset is re-runnable and always cancels content, clears cache, and resets Cesium', () => {
    const runtime = targets();

    deepResetRuntime(runtime);
    deepResetRuntime(runtime);

    expect(runtime.cancelContent).toHaveBeenCalledTimes(2);
    expect(runtime.clearPreloadCache).toHaveBeenCalledTimes(2);
    expect(runtime.resetCesium).toHaveBeenCalledTimes(2);
  });

  it('routes a validated forceMediaFailure operator command from contentPlaying to the state-owned content runtime', () => {
    const actor = createActor(experienceMachine).start();
    const forceMediaFailure = vi.fn(() => true);
    actor.getSnapshot().context.runtime.setContent({
      cancel: vi.fn(),
      forceMediaFailure,
    } as never);
    actor.send({ type: 'internal.assetsVerified' });
    actor.send({ type: 'category.select', payload: { categoryId: 'cat-1' } });
    actor.send({ type: 'project.select', payload: {} });
    actor.send({
      type: 'internal.handoverToProjectComplete',
      generation: actor.getSnapshot().context.generation,
    });
    actor.send({ type: 'content.select', payload: { position: 1 } });

    actor.send({
      type: 'operator.command',
      payload: { command: 'forceMediaFailure' },
    });

    expect(forceMediaFailure).toHaveBeenCalledOnce();
    actor.stop();
  });

  it('keeps an adapter failure in recovering until an explicit recovery completion arrives', () => {
    const actor = createActor(experienceMachine).start();
    actor.send({ type: 'internal.adapterFailure', reason: 'renderer unavailable' });
    const generation = actor.getSnapshot().context.generation;

    expect(actor.getSnapshot().value).toBe('recovering');
    actor.send({ type: 'internal.recovered', generation });
    expect(actor.getSnapshot().value).toBe('idle');
    actor.stop();
  });
});
