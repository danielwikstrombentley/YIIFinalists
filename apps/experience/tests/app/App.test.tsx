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

function validProject(projectId: string) {
  const match = /^cat(\d+)-([abc])$/.exec(projectId);
  if (!match) throw new Error(`Unexpected fixture project id: ${projectId}`);
  const categoryNumber = Number(match[1]);
  const projectNumber = (match[2]?.charCodeAt(0) ?? 97) - 96;

  return {
    id: projectId,
    name: `Sample Project ${categoryNumber}.${projectNumber}`,
    organisation: 'Sample Organisation',
    country: 'Sampleland',
    location: 'Sample City',
    categoryId: `cat-${categoryNumber}`,
    marker: { lat: -55 + categoryNumber * 8, lon: -170 + categoryNumber * 20 + projectNumber },
    geographicFraming: {
      scopeType: 'city',
      landingCamera: {
        destination: {
          lat: -55 + categoryNumber * 8,
          lon: -170 + categoryNumber * 20,
          height: 400,
        },
        orientation: { heading: 0, pitch: -30, roll: 0 },
        range: 800,
      },
      previewEmphasis: { markerScale: 1.2 },
      tileTier: 'safe-composition',
      canvasTreatment: { darken: 0.15 },
    },
    contentOptions: [
      {
        position: 1,
        title: 'Overview',
        formats: ['overview-hero'],
        sequence: {
          openingState: { id: 'opening', elements: [{ target: 'hero', properties: { level: 0 } }] },
          timebase: 'timeline',
          syncToleranceMs: 200,
          beats: [{ type: 'text', startTime: 0, duration: 4000, target: 'hero' }],
          finalFrame: { id: 'final', elements: [{ target: 'hero', properties: { level: 1 } }] },
          interruptionExit: 'fade-out',
        },
        displayText: [{ type: 'paragraph', text: 'Fixture overview.' }],
        voiceover: {
          file: `projects/${projectId}/voiceover/overview.opus`,
          scriptVersion: 'fixture-v1',
          voiceId: 'fixture-voice',
          durationMs: 4000,
          captionText: [{ type: 'paragraph', text: 'Fixture caption.' }],
        },
        mediaRefs: [
          {
            id: 'hero-image',
            kind: 'image',
            file: `projects/${projectId}/media/hero.jpg`,
            rights: { holder: 'Fixture Organisation', status: 'approved' },
            aiGenerated: false,
          },
        ],
        available: true,
      },
    ],
    inactivePositions: [2, 3, 4, 5],
  };
}

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
        const projectMatch = /\/projects\/([^/]+)\/project\.json$/.exec(url);
        if (projectMatch?.[1]) {
          return jsonResponse(validProject(projectMatch[1]));
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
        const projectMatch = /\/projects\/([^/]+)\/project\.json$/.exec(url);
        if (projectMatch?.[1]) {
          return jsonResponse(validProject(projectMatch[1]));
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
