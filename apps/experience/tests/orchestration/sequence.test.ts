import type { ContentOption } from '@yii/content-schema';
import { describe, expect, it, vi } from 'vitest';
import { SequenceCompiler } from '../../src/orchestration/sequence-compiler.js';
import { SequenceOrchestrator } from '../../src/orchestration/orchestrator.js';

// T038 (red-first): Principle II / QR-002 contract for the compiler that T043 wires into the
// machine. The media doubles deliberately model only the adapter boundary: tests never depend on
// browser media decoding or a real renderer to prove timing, replay, and cleanup behaviour.

interface MutableTarget {
  [property: string]: number | boolean;
}

function createOption(): ContentOption {
  return {
    position: 1,
    title: 'Overview',
    formats: ['overview-hero'],
    sequence: {
      openingState: {
        id: 'opening',
        elements: [
          { target: 'story', properties: { opacity: 0, visible: true } },
          { target: 'camera', properties: { range: 100 } },
          { target: 'video', properties: { currentTime: 0 } },
        ],
      },
      timebase: 'voiceover',
      syncToleranceMs: 100,
      beats: [
        {
          type: 'text',
          target: 'story',
          startTime: 0,
          duration: 400,
          params: { opacity: 1 },
        },
        {
          type: 'camera',
          target: 'camera',
          startTime: 100,
          duration: 500,
          params: { range: 800 },
        },
        {
          type: 'media',
          target: 'video',
          startTime: 200,
          duration: 600,
          params: { currentTime: 800 },
        },
      ],
      finalFrame: {
        id: 'final',
        elements: [{ target: 'story', properties: { opacity: 1, visible: true } }],
      },
      interruptionExit: 'fade-out',
    },
    displayText: [{ type: 'paragraph', text: 'A test story.' }],
    voiceover: {
      file: 'projects/test/voiceover/overview.opus',
      scriptVersion: 'v1',
      voiceId: 'test-voice',
      durationMs: 800,
      captionText: [],
    },
    mediaRefs: [
      {
        id: 'hero-image',
        kind: 'image',
        file: 'projects/test/media/hero.jpg',
        rights: { holder: 'Test', status: 'approved' },
        aiGenerated: false,
      },
    ],
    available: true,
  };
}

function createFixture(options: { failVoiceoverStart?: boolean } = {}) {
  const targets: Record<string, MutableTarget> = {
    story: { opacity: 0, visible: true },
    camera: { range: 100 },
    video: { currentTime: 0 },
  };
  const voiceover = {
    currentTime: 0,
    start: vi.fn(() => {
      if (options.failVoiceoverStart) throw new Error('voiceover unavailable');
    }),
    stop: vi.fn(),
    seek: vi.fn((seconds: number) => {
      voiceover.currentTime = seconds;
    }),
  };
  const video = {
    currentTime: 0,
    stop: vi.fn(),
    seek: vi.fn((seconds: number) => {
      video.currentTime = seconds;
    }),
  };
  const interruptionExit = vi.fn();
  const failure = vi.fn();
  const orchestrator = new SequenceOrchestrator({
    resolveTarget: (targetId) => targets[targetId] ?? (targets[targetId] = {}),
  });
  const compiler = new SequenceCompiler({
    orchestrator,
    resolveTarget: (targetId: string) => targets[targetId] ?? (targets[targetId] = {}),
    voiceover,
    video,
    onInterruptionExit: interruptionExit,
    onFailure: failure,
    safeComposition: {
      id: 'safe-composition',
      elements: [{ target: 'story', properties: { opacity: 0.6, visible: true } }],
    },
  });
  const playback = compiler.compile(createOption());

  return { failure, interruptionExit, orchestrator, playback, targets, video, voiceover };
}

describe('Content sequence compiler: replay and final-frame semantics', () => {
  it('restores the complete opening state on replay, including visual targets, camera, media, and voiceover', () => {
    const { orchestrator, playback, targets, video, voiceover } = createFixture();

    playback.play();
    orchestrator.seek(700);
    voiceover.currentTime = 0.7;
    video.currentTime = 0.7;
    expect(targets.story.opacity).toBe(1);
    expect(targets.camera.range).toBe(800);

    playback.replay();

    expect(targets.story).toMatchObject({ opacity: 0, visible: true });
    expect(targets.camera).toMatchObject({ range: 100 });
    expect(targets.video).toMatchObject({ currentTime: 0 });
    expect(voiceover.seek).toHaveBeenLastCalledWith(0);
    expect(video.seek).toHaveBeenLastCalledWith(0);
    expect(voiceover.start).toHaveBeenCalledTimes(2);
  });

  it('reaches and indefinitely holds the declared final frame after timeline completion', () => {
    const { orchestrator, playback, targets } = createFixture();

    playback.play();
    orchestrator.seek(1_000);

    expect(playback.phase).toBe('final-hold');
    expect(targets.story).toMatchObject({ opacity: 1, visible: true });
    orchestrator.seek(10_000);
    expect(playback.phase).toBe('final-hold');
  });
});

describe('Content sequence compiler: cancellation, failure, and synchronization', () => {
  it('applies the declared interruption cleanup profile with no residual media or overlay ownership', () => {
    const { interruptionExit, playback, targets, video, voiceover } = createFixture();

    playback.play();
    playback.cancel();

    expect(interruptionExit).toHaveBeenCalledWith('fade-out');
    expect(voiceover.stop).toHaveBeenCalledTimes(1);
    expect(video.stop).toHaveBeenCalledTimes(1);
    expect(playback.phase).toBe('cancelled');
    expect(targets.story.visible).toBe(false);
  });

  it('corrects an out-of-tolerance timeline drift from the authoritative voiceover clock', () => {
    const { orchestrator, playback, voiceover } = createFixture();

    playback.play();
    orchestrator.seek(100);
    voiceover.currentTime = 0.7;
    playback.synchronizeTimebase();

    expect(orchestrator.progress).toBeCloseTo(0.7, 1);
  });

  it('contains a sequence startup failure in the supplied safe composition and reports it to the owner', () => {
    const { failure, playback, targets } = createFixture({ failVoiceoverStart: true });

    expect(() => playback.play()).not.toThrow();
    expect(playback.phase).toBe('failed');
    expect(targets.story).toMatchObject({ opacity: 0.6, visible: true });
    expect(failure).toHaveBeenCalledWith(expect.any(Error));
  });
});
