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

/** Fills in the ContentLoader members BootstrapDeps requires alongside `load()`. */
function fakeLoader(load: BootstrapDeps['loader']['load']): BootstrapDeps['loader'] {
  return { load, loadAllProjects: vi.fn(), loadProject: vi.fn(), getCachedProject: vi.fn() };
}

function releaseLoaded(categories: readonly { id: string; projectIds: readonly string[] }[] = []) {
  return {
    type: 'internal.releaseLoaded' as const,
    categories: categories.map(({ id, projectIds }) => ({ id, projectIds })),
  };
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

    expect(events).toEqual([releaseLoaded(), { type: 'internal.assetsVerified' }]);
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
    expect(events).toEqual([releaseLoaded(), { type: 'internal.assetsVerified' }]);
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

  it('applies a kiosk-provided production channel before boot when no explicit loader channel is supplied', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/runtime-config.json') {
        return new Response(JSON.stringify({ contentChannel: 'production' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch ${String(input)}`);
    });
    const events: ExperienceEvent[] = [];
    const fetchJson = vi.fn(
      fakeFetchJson({
        '/content/channels.json': {
          staging: null,
          production: '1.0.0',
          frozen: false,
          history: [],
        },
        '/content/releases/1.0.0/manifest.json': VALID_MANIFEST,
        '/content/releases/1.0.0/categories.json': VALID_CATEGORIES,
      }),
    );
    const deps = createRuntimeDependencies({
      send: (event) => events.push(event),
      contentLoaderOptions: { fetchJson },
    });

    try {
      await bootstrap({ ...deps, transports: [] });
      expect(events).toEqual([
        releaseLoaded(VALID_CATEGORIES),
        { type: 'internal.assetsVerified' },
      ]);
      expect(fetchJson).toHaveBeenCalledWith('/content/channels.json');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('does not let an unavailable kiosk runtime configuration delay boot', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {}));
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

    try {
      await bootstrap({ ...deps, transports: [] });
      expect(events).toEqual([
        releaseLoaded(VALID_CATEGORIES),
        { type: 'internal.assetsVerified' },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
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
    expect(events).toEqual([releaseLoaded(VALID_CATEGORIES), { type: 'internal.assetsVerified' }]);

    deps.boundary.handle(categorySelectEnvelope('does-not-exist'));
    expect(events).toEqual([releaseLoaded(VALID_CATEGORIES), { type: 'internal.assetsVerified' }]); // rejected: no new event

    deps.boundary.handle(categorySelectEnvelope('cat-1'));
    expect(events).toEqual([
      releaseLoaded(VALID_CATEGORIES),
      { type: 'internal.assetsVerified' },
      { type: 'category.select', payload: { categoryId: 'cat-1' } },
    ]);
  });

  it('rejects a preview.hover project from another category, and accepts one in the active category (round 2 finding #1)', async () => {
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
    deps.boundary.handle(categorySelectEnvelope('cat-1'));
    deps.boundary.setActiveCategory('cat-1'); // mirrors what App.tsx's BootOrchestrator does

    function hoverEnvelope(projectId: string) {
      return {
        v: 1,
        type: 'preview.hover',
        payload: { projectId },
        source: 'console',
        sentAt: new Date().toISOString(),
      };
    }

    // "cat2-a" is a real project, but in cat-2, not the active cat-1 — rejected.
    deps.boundary.handle(hoverEnvelope('cat2-a'));
    expect(events).toEqual([
      releaseLoaded(VALID_CATEGORIES),
      { type: 'internal.assetsVerified' },
      { type: 'category.select', payload: { categoryId: 'cat-1' } },
    ]);

    // "cat1-a" is in the active category — accepted.
    deps.boundary.handle(hoverEnvelope('cat1-a'));
    expect(events).toEqual([
      releaseLoaded(VALID_CATEGORIES),
      { type: 'internal.assetsVerified' },
      { type: 'category.select', payload: { categoryId: 'cat-1' } },
      { type: 'preview.hover', payload: { projectId: 'cat1-a' } },
    ]);
  });
});
