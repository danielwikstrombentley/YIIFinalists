import { describe, expect, it, vi } from 'vitest';
import { bootstrap, type BootstrapDeps } from '../../src/app/bootstrap.js';
import { InputBoundary } from '../../src/input/boundary.js';
import type { Transport } from '../../src/input/transports/transport.js';
import type { ExperienceEvent } from '../../src/state/types.js';

// T020 Tests: "boot integration test: seeded release -> boot -> idle; boot failure ->
// recovering fallback path." bootstrap() is a plain function so this drives it directly with
// fakes, without mounting React — the same events App.tsx's BootOrchestrator sends to the actor.

function createFakeTransport(): Transport {
  return {
    id: 'fake',
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: () => true,
    onMessage: vi.fn(() => () => {}),
    onStatusChange: vi.fn(() => () => {}),
    emit: vi.fn(),
  };
}

describe('bootstrap(): seeded release -> boot -> idle', () => {
  it('sends internal.assetsVerified when the loader resolves', async () => {
    const events: ExperienceEvent[] = [];
    const deps: BootstrapDeps = {
      loader: {
        load: vi.fn().mockResolvedValue({ version: '1.0.0', manifest: {}, categories: [] }),
      },
      boundary: new InputBoundary({ onAccepted: () => {} }),
      transports: [createFakeTransport()],
      send: (event) => events.push(event),
    };

    await bootstrap(deps);

    expect(events).toEqual([{ type: 'internal.assetsVerified' }]);
  });

  it('connects every transport and wires its messages into the input boundary', async () => {
    const onAccepted = vi.fn();
    const transport = createFakeTransport();
    const deps: BootstrapDeps = {
      loader: {
        load: vi.fn().mockResolvedValue({ version: '1.0.0', manifest: {}, categories: [] }),
      },
      boundary: new InputBoundary({ onAccepted }),
      transports: [transport],
      send: () => {},
    };

    await bootstrap(deps);

    expect(transport.connect).toHaveBeenCalledTimes(1);
    expect(transport.onMessage).toHaveBeenCalledTimes(1);

    // Simulate the transport delivering a message through the handler bootstrap() registered.
    const handler = (transport.onMessage as ReturnType<typeof vi.fn>).mock.calls[0]![0] as (
      raw: unknown,
    ) => void;
    handler({
      v: 1,
      type: 'nav.idle',
      payload: {},
      source: 'console',
      sentAt: new Date().toISOString(),
    });
    expect(onAccepted).toHaveBeenCalledTimes(1);
  });
});

describe('bootstrap(): boot failure -> recovering fallback path', () => {
  it('sends internal.adapterFailure when the loader rejects', async () => {
    const events: ExperienceEvent[] = [];
    const onBootError = vi.fn();
    const deps: BootstrapDeps = {
      loader: { load: vi.fn().mockRejectedValue(new Error('channels.json unreachable')) },
      boundary: new InputBoundary({ onAccepted: () => {} }),
      transports: [createFakeTransport()],
      send: (event) => events.push(event),
      onBootError,
    };

    await bootstrap(deps);

    expect(events).toEqual([
      { type: 'internal.adapterFailure', reason: 'channels.json unreachable' },
    ]);
    expect(onBootError).toHaveBeenCalledTimes(1);
  });

  it('does not fail boot when a transport fails to connect (diagnostics-only)', async () => {
    const events: ExperienceEvent[] = [];
    const failingTransport = createFakeTransport();
    failingTransport.connect = vi.fn(() => {
      throw new Error('no network');
    });
    const deps: BootstrapDeps = {
      loader: {
        load: vi.fn().mockResolvedValue({ version: '1.0.0', manifest: {}, categories: [] }),
      },
      boundary: new InputBoundary({ onAccepted: () => {} }),
      transports: [failingTransport],
      send: (event) => events.push(event),
    };

    await expect(bootstrap(deps)).resolves.toBeUndefined();
    expect(events).toEqual([{ type: 'internal.assetsVerified' }]);
  });
});
