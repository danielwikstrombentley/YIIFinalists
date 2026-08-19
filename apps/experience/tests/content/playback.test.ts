import type { Project } from '@yii/content-schema';
import { describe, expect, it, vi } from 'vitest';
import { createContentPlaybackPresentation } from '../../src/content/playback.js';

function createProject(): Project {
  return {
    id: 'project-1',
    name: 'A sample project',
    organisation: 'Sample Organisation',
    country: 'Sampleland',
    location: 'Sample City',
    categoryId: 'cat-1',
    marker: { lat: 1, lon: 2 },
    geographicFraming: {
      scopeType: 'city',
      landingCamera: {
        destination: { lat: 1, lon: 2, height: 100 },
        orientation: { heading: 0, pitch: -30, roll: 0 },
        range: 500,
      },
      previewEmphasis: { markerScale: 1.2 },
      tileTier: 'safe-composition',
      canvasTreatment: { darken: 0.1 },
    },
    contentOptions: [
      {
        position: 1,
        title: 'Overview',
        formats: ['overview-hero'],
        sequence: {
          openingState: {
            id: 'opening',
            elements: [{ target: 'story', properties: { opacity: 0 } }],
          },
          timebase: 'timeline',
          syncToleranceMs: 200,
          beats: [
            { type: 'text', target: 'story', startTime: 0, duration: 1000, params: { opacity: 1 } },
          ],
          finalFrame: { id: 'final', elements: [{ target: 'story', properties: { opacity: 1 } }] },
          interruptionExit: 'fade-out',
        },
        displayText: [{ type: 'paragraph', text: 'A story.' }],
        voiceover: {
          file: 'projects/project-1/voiceover/overview.opus',
          scriptVersion: 'v1',
          voiceId: 'test',
          durationMs: 1000,
          captionText: [],
        },
        mediaRefs: [],
        available: true,
      },
    ],
    inactivePositions: [2, 3, 4, 5],
  };
}

describe('ContentPlaybackPresentation', () => {
  it('starts a validated option once, exposes its run snapshot, and cancels it idempotently', () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined as unknown as void);
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const project = createProject();
    const send = vi.fn();
    const presentation = createContentPlaybackPresentation({
      getProject: (projectId) => (projectId === project.id ? project : undefined),
      resolveAssetUrl: (path) => `/content/releases/v1/${path}`,
      send,
    });

    expect(presentation.start(project.id, 1, 7)).toBe(true);
    expect(presentation.snapshot).toMatchObject({
      projectId: project.id,
      phase: 'playing',
      run: 1,
      openingStateRestored: true,
    });
    expect(presentation.start(project.id, 5, 7)).toBe(false);

    presentation.cancel();
    presentation.cancel();
    expect(presentation.snapshot).toBeNull();
    expect(send).not.toHaveBeenCalled();

    presentation.dispose();
    play.mockRestore();
    pause.mockRestore();
    load.mockRestore();
  });

  it('keeps the active composition mounted and marks it as a fallback after an operator-injected media failure', () => {
    const project = createProject();
    const onMediaFailure = vi.fn();
    const presentation = createContentPlaybackPresentation({
      getProject: (projectId) => (projectId === project.id ? project : undefined),
      resolveAssetUrl: (path) => `/content/releases/v1/${path}`,
      send: vi.fn(),
      onMediaFailure,
    });

    expect(presentation.start(project.id, 1, 7)).toBe(true);
    expect(presentation.forceMediaFailure()).toBe(true);
    expect(presentation.snapshot).toMatchObject({ mediaFallback: true });
    expect(onMediaFailure).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringMatching(/operator-injected/i) }),
    );
  });
});
