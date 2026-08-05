import { describe, expect, it, vi } from 'vitest';
import {
  bootstrap,
  createRuntimeDependencies,
  type BootstrapDeps,
} from '../../src/app/bootstrap.js';
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

/** Fills in the loadProject/getCachedProject members BootstrapDeps['loader'] requires alongside load. */
function fakeLoader(load: BootstrapDeps['loader']['load']): BootstrapDeps['loader'] {
  return { load, loadProject: vi.fn(), getCachedProject: vi.fn() };
}

describe('bootstrap(): seeded release -> boot -> idle', () => {
  it('sends internal.assetsVerified when the loader resolves', async () => {
    const events: ExperienceEvent[] = [];
    const deps: BootstrapDeps = {
      loader: fakeLoader(
        vi.fn().mockResolvedValue({ version: '1.0.0', manifest: {}, categories: [] }),
      ),
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
      loader: fakeLoader(
        vi.fn().mockResolvedValue({ version: '1.0.0', manifest: {}, categories: [] }),
      ),
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
      loader: fakeLoader(vi.fn().mockRejectedValue(new Error('channels.json unreachable'))),
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
      loader: fakeLoader(
        vi.fn().mockResolvedValue({ version: '1.0.0', manifest: {}, categories: [] }),
      ),
      boundary: new InputBoundary({ onAccepted: () => {} }),
      transports: [failingTransport],
      send: (event) => events.push(event),
    };

    await expect(bootstrap(deps)).resolves.toBeUndefined();
    expect(events).toEqual([{ type: 'internal.assetsVerified' }]);
  });
});

// PH2 review round 1 finding #2: createRuntimeDependencies() used to wire InputBoundary with no
// releaseValidator at all (the permissive fallback), so unknown category/project refs were
// accepted forever, even after the release loaded. These tests exercise the real wiring.
describe('createRuntimeDependencies(): release-ref validation', () => {
  const VALID_MANIFEST = {
    schemaVersion: 1,
    version: '1.0.0',
    contentHash: 'sha256-test',
    createdAt: '2026-08-03T12:00:00.000Z',
    approvedBy: 'editor@example.com',
    frozen: false,
  };

  const VALID_CATEGORIES = Array.from({ length: 12 }, (_, i) => ({
    id: `cat-${i + 1}`,
    name: `Category ${i + 1}`,
    order: i + 1,
    projectIds: [`cat${i + 1}-a`, `cat${i + 1}-b`, `cat${i + 1}-c`],
  }));

  function fakeFetchJson(files: Record<string, unknown>) {
    return async (path: string): Promise<unknown> => {
      if (!(path in files)) throw new Error(`404: ${path}`);
      return files[path];
    };
  }

  function categorySelectEnvelope(categoryId: string) {
    return {
      v: 1,
      type: 'category.select',
      payload: { categoryId },
      source: 'console',
      sentAt: new Date().toISOString(),
    };
  }

  it('rejects every category.select before the release has loaded (fail-closed default)', () => {
    const events: ExperienceEvent[] = [];
    const deps = createRuntimeDependencies({ send: (event) => events.push(event) });

    deps.boundary.handle(categorySelectEnvelope('cat-1'));
    expect(events).toEqual([]);
  });

  it('rejects an unknown category and accepts a known one once the release has loaded', async () => {
    const events: ExperienceEvent[] = [];
    const deps = createRuntimeDependencies({
      send: (event) => events.push(event),
      contentLoaderOptions: {
        fetchJson: fakeFetchJson({
          '/content/channels.json': {
            staging: '1.0.0',
            production: null,
            frozen: false,
            history: [],
          },
          '/content/releases/1.0.0/manifest.json': VALID_MANIFEST,
          '/content/releases/1.0.0/categories.json': VALID_CATEGORIES,
        }),
      },
    });

    await bootstrap({ ...deps, transports: [] });
    expect(events).toEqual([{ type: 'internal.assetsVerified' }]);

    deps.boundary.handle(categorySelectEnvelope('does-not-exist'));
    expect(events).toEqual([{ type: 'internal.assetsVerified' }]); // rejected: no new event

    deps.boundary.handle(categorySelectEnvelope('cat-1'));
    expect(events).toEqual([
      { type: 'internal.assetsVerified' },
      { type: 'category.select', payload: { categoryId: 'cat-1' } },
    ]);
  });
});
