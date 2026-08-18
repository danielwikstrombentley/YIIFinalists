import type { MediaAsset, VoiceoverAsset } from '@yii/content-schema';
import { describe, expect, it, vi } from 'vitest';
import { VideoSurface } from '../../src/media/VideoSurface.js';
import { VoiceoverPlayer } from '../../src/media/VoiceoverPlayer.js';

class FakeMediaElement extends EventTarget {
  currentTime = 0;
  muted = false;
  paused = true;
  poster = '';
  preload = '';
  src = '';
  volume = 1;
  readonly load = vi.fn();
  readonly pause = vi.fn(() => {
    this.paused = true;
  });
  readonly play = vi.fn(async () => {
    this.paused = false;
  });
  readonly removeAttribute = vi.fn((name: string) => {
    if (name === 'src') this.src = '';
  });
}

const VOICEOVER: VoiceoverAsset = {
  file: 'projects/project-1/voiceover/overview.opus',
  scriptVersion: 'v1',
  voiceId: 'voice-1',
  durationMs: 1_000,
  captionText: [],
};

function videoAsset(id: string, file = `projects/project-1/media/${id}.mp4`): MediaAsset {
  return {
    id,
    kind: 'video',
    file,
    durationMs: 1_000,
    codec: 'h264',
    fallback: 'video-fallback',
    rights: { holder: 'Test', status: 'approved' },
    aiGenerated: false,
  };
}

function flushMediaPromises(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

describe('VoiceoverPlayer', () => {
  it('starts local approved audio from zero and exposes its clock for sequence synchronization', () => {
    const audio = new FakeMediaElement();
    const player = new VoiceoverPlayer({
      createAudio: () => audio as unknown as HTMLAudioElement,
      resolveAssetUrl: (path) => `/content/releases/v1/${path}`,
    });

    player.start(VOICEOVER);

    expect(audio.src).toBe('/content/releases/v1/projects/project-1/voiceover/overview.opus');
    expect(audio.currentTime).toBe(0);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(player.currentTime).toBe(0);
    expect(player.status).toBe('playing');

    player.seek(0.75);
    expect(player.currentTime).toBe(0.75);
  });

  it('stops idempotently and replays the same voiceover from the complete opening time', () => {
    const audio = new FakeMediaElement();
    const player = new VoiceoverPlayer({ createAudio: () => audio as unknown as HTMLAudioElement });

    player.start(VOICEOVER);
    player.seek(0.8);
    player.stop();
    player.stop();
    player.start(VOICEOVER);

    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(audio.currentTime).toBe(0);
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(player.status).toBe('playing');
  });

  it('contains playback failures, reports the fallback event, and remains safe to dispose repeatedly', async () => {
    const audio = new FakeMediaElement();
    audio.play.mockRejectedValueOnce(new Error('audio decode failed'));
    const onFailure = vi.fn();
    const player = new VoiceoverPlayer({
      createAudio: () => audio as unknown as HTMLAudioElement,
      onFailure,
    });

    player.start(VOICEOVER);
    await flushMediaPromises();

    expect(player.status).toBe('fallback');
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ asset: VOICEOVER }));
    expect(() => player.dispose()).not.toThrow();
    expect(() => player.dispose()).not.toThrow();
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.src).toBe('');
  });

  it('releases every object URL it creates exactly once during disposal', () => {
    const createObjectURL = vi.fn(() => 'blob:test-audio');
    const revokeObjectURL = vi.fn();
    const player = new VoiceoverPlayer({
      createAudio: () => new FakeMediaElement() as unknown as HTMLAudioElement,
      objectUrlApi: { createObjectURL, revokeObjectURL },
    });

    expect(player.createObjectUrl(new Blob(['audio']))).toBe('blob:test-audio');
    player.dispose();
    player.dispose();

    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-audio');
  });
});

describe('VideoSurface', () => {
  it('enforces exactly one decoding surface and one preloading surface across replacements', () => {
    const elements = [new FakeMediaElement(), new FakeMediaElement(), new FakeMediaElement()];
    const surface = new VideoSurface({
      createVideo: () => elements.shift() as unknown as HTMLVideoElement,
      resolveAssetUrl: (path) => `/content/releases/v1/${path}`,
    });
    const first = videoAsset('video-one');
    const second = videoAsset('video-two');
    const third = videoAsset('video-three');

    surface.start(first);
    surface.preload(second);
    surface.start(third);

    expect(surface.decodingCount).toBe(1);
    expect(surface.preloadingCount).toBe(1);
    expect(surface.activeAssetId).toBe('video-three');
    expect(surface.preloadedAssetId).toBe('video-two');
  });

  it('keeps the poster visible until the active video can play, then starts playback', () => {
    const video = new FakeMediaElement();
    const surface = new VideoSurface({
      createVideo: () => video as unknown as HTMLVideoElement,
      resolveAssetUrl: (path) => `/content/releases/v1/${path}`,
    });

    surface.start(videoAsset('video-one'), {
      posterUrl: '/content/releases/v1/projects/project-1/media/poster.jpg',
      waitForCanPlay: true,
    });

    expect(video.poster).toContain('poster.jpg');
    expect(video.play).not.toHaveBeenCalled();
    video.dispatchEvent(new Event('canplay'));
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it('swaps a failed active video to its declared fallback without removing the active surface', async () => {
    const video = new FakeMediaElement();
    const onFallback = vi.fn();
    const surface = new VideoSurface({
      createVideo: () => video as unknown as HTMLVideoElement,
      resolveAssetUrl: (path) => `/content/releases/v1/${path}`,
      onFallback,
    });
    const primary = videoAsset('video-primary');
    const fallback = videoAsset('video-fallback');

    surface.start(primary, { fallback });
    const activeElement = surface.activeElement;
    video.dispatchEvent(new Event('error'));
    await flushMediaPromises();

    expect(surface.activeElement).toBe(activeElement);
    expect(surface.activeAssetId).toBe('video-fallback');
    expect(video.src).toBe('/content/releases/v1/projects/project-1/media/video-fallback.mp4');
    expect(onFallback).toHaveBeenCalledWith(
      expect.objectContaining({ from: primary, to: fallback }),
    );
  });

  it('stops and releases active/preloaded elements and object URLs idempotently', () => {
    const active = new FakeMediaElement();
    const preload = new FakeMediaElement();
    const createObjectURL = vi.fn(() => 'blob:test-video');
    const revokeObjectURL = vi.fn();
    const elements = [active, preload];
    const surface = new VideoSurface({
      createVideo: () => elements.shift() as unknown as HTMLVideoElement,
      objectUrlApi: { createObjectURL, revokeObjectURL },
    });

    surface.start(videoAsset('video-active'));
    surface.preload(videoAsset('video-preload'));
    surface.createObjectUrl(new Blob(['video']));
    surface.dispose();
    surface.dispose();

    expect(active.pause).toHaveBeenCalled();
    expect(preload.pause).toHaveBeenCalled();
    expect(surface.decodingCount).toBe(0);
    expect(surface.preloadingCount).toBe(0);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
