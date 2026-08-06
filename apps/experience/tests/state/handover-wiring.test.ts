import { describe, expect, it, vi } from 'vitest';
import type { Project } from '@yii/content-schema';
import { startForwardHandover } from '../../src/state/actions.js';
import { createCleanupRegistry } from '../../src/state/cleanup-registry.js';
import {
  createExperienceRuntime,
  type CesiumPresentation,
  type GlobePresentation,
} from '../../src/state/runtime.js';
import {
  INITIAL_CONTEXT,
  type ExperienceContext,
  type ExperienceEvent,
} from '../../src/state/types.js';

const PROJECT = { id: 'cat-1-proj-1' } as Project;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function createContext() {
  const runtime = createExperienceRuntime();
  runtime.setGlobe({
    adapter: {} as GlobePresentation['adapter'],
    projectIds: [PROJECT.id],
    getProject: (projectId) => (projectId === PROJECT.id ? PROJECT : undefined),
    resolveAssetUrl: (path) => path,
  });
  const context: ExperienceContext = {
    ...INITIAL_CONTEXT,
    selectedProjectId: PROJECT.id,
    generation: 17,
    cleanup: createCleanupRegistry(),
    runtime,
  };
  return context;
}

describe('forward handover machine wiring', () => {
  it('queues a valid confirmation until the code-split Cesium presentation is ready', async () => {
    const context = createContext();
    const readiness = deferred<CesiumPresentation | null>();
    context.runtime.setCesiumReady(readiness.promise);
    const completion = deferred<{
      projectId: string;
      generation: number;
      status: 'completed';
    }>();
    const operation = { completion: completion.promise, cancel: vi.fn() };
    const handover = { startForward: vi.fn(() => operation) };
    const cesium = { handover } as unknown as CesiumPresentation;
    const send = vi.fn<(event: ExperienceEvent) => void>();
    const self = { send, getSnapshot: () => ({ context }) };

    startForwardHandover({ context, self });
    expect(handover.startForward).not.toHaveBeenCalled();

    context.runtime.setCesium(cesium);
    readiness.resolve(cesium);
    await flushAsyncWork();

    expect(handover.startForward).toHaveBeenCalledWith(PROJECT);
    expect(context.cleanup.size).toBe(1);

    completion.resolve({ projectId: PROJECT.id, generation: 1, status: 'completed' });
    await flushAsyncWork();
    expect(send).toHaveBeenCalledWith({
      type: 'internal.handoverToProjectComplete',
      generation: 17,
    });

    context.cleanup.cancelAll();
    expect(operation.cancel).toHaveBeenCalledTimes(1);
  });

  it('discards a queued handover once a higher-priority transition invalidates its generation', async () => {
    const context = createContext();
    const readiness = deferred<CesiumPresentation | null>();
    context.runtime.setCesiumReady(readiness.promise);
    const handover = {
      startForward: vi.fn(),
    };
    const cesium = { handover } as unknown as CesiumPresentation;
    const send = vi.fn<(event: ExperienceEvent) => void>();
    const self = { send, getSnapshot: () => ({ context }) };

    startForwardHandover({ context, self });
    context.generation += 1;
    context.runtime.setCesium(cesium);
    readiness.resolve(cesium);
    await flushAsyncWork();

    expect(handover.startForward).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(context.cleanup.size).toBe(0);
  });
});
