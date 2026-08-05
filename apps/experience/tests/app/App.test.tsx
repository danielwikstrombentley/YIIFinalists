import { act, render, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/app/App.js';

// T020 Tests (React-level): full boot -> idle through the real App shell, with only `fetch`
// mocked (the only real I/O boundary at this layer) — proves the wiring in bootstrap.ts +
// MachineProvider + StageMount actually reaches idle end-to-end, and that boot failure never
// throws or renders any public-facing error content.

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

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

describe('App shell: boot -> idle', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/content/channels.json')) {
          return jsonResponse({ staging: '1.0.0', production: null, frozen: false, history: [] });
        }
        if (url.endsWith('/content/releases/1.0.0/manifest.json')) {
          return jsonResponse(VALID_MANIFEST);
        }
        if (url.endsWith('/content/releases/1.0.0/categories.json')) {
          return jsonResponse(VALID_CATEGORIES);
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the full-screen stage with zero public-facing menus/instructions/errors, and reaches idle', async () => {
    const { container } = await act(async () => render(<App />));

    const stage = container.querySelector('#stage');
    expect(stage).toBeInTheDocument();
    expect(container.textContent).toBe(''); // no visible text content anywhere (Principle VI)

    await waitFor(() => {
      expect(stage?.getAttribute('data-machine-state')).toBe('"idle"');
    });
  });

  it('keeps the operator overlay mount point present but hidden', async () => {
    const { container } = await act(async () => render(<App />));
    const overlay = container.querySelector('#operator-overlay-mount');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveStyle({ display: 'none' });
  });
});

describe('App shell: boot failure -> recovering fallback path', () => {
  it('never throws or renders visible error content when content loading fails entirely', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404 })),
    );

    const { container } = await act(async () => render(<App />));
    const stage = container.querySelector('#stage');

    await waitFor(() => {
      expect(stage?.getAttribute('data-machine-state')).toBe('"recovering"');
    });
    expect(container.textContent).toBe('');

    vi.unstubAllGlobals();
  });
});

// PH2 round 2 finding #2: React StrictMode's dev-only mount→cleanup→remount effect probe used to
// strand the app at "boot" forever — MachineProvider stopped the XState actor during the
// synthetic cleanup and then called `.start()` again, which does not revive a stopped actor (its
// `.subscribe()` callbacks never fire again), so StageMount's data-machine-state never updated.
// This regression test wraps the real App tree in <StrictMode>, exactly like main.tsx does.
describe('App shell under React.StrictMode: still boots to idle', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/content/channels.json')) {
          return jsonResponse({ staging: '1.0.0', production: null, frozen: false, history: [] });
        }
        if (url.endsWith('/content/releases/1.0.0/manifest.json')) {
          return jsonResponse(VALID_MANIFEST);
        }
        if (url.endsWith('/content/releases/1.0.0/categories.json')) {
          return jsonResponse(VALID_CATEGORIES);
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reaches idle even when the machine-provider/boot effects run twice (StrictMode dev probe)', async () => {
    const { container } = await act(async () =>
      render(
        <StrictMode>
          <App />
        </StrictMode>,
      ),
    );
    const stage = container.querySelector('#stage');

    await waitFor(() => {
      expect(stage?.getAttribute('data-machine-state')).toBe('"idle"');
    });
  });
});
