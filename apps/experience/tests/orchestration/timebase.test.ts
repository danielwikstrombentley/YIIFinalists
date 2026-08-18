import { describe, expect, it, vi } from 'vitest';
import {
  TimebaseSynchronizer,
  type MediaClock,
  type TimelineClock,
} from '../../src/orchestration/timebase.js';

function createTimeline(initialTime = 0): TimelineClock & { seek: ReturnType<typeof vi.fn> } {
  let time = initialTime;
  return {
    get time() {
      return time;
    },
    seek: vi.fn((nextTime: number) => {
      time = nextTime;
    }),
  };
}

function createMediaClock(initialTime = 0): MediaClock & { seek: ReturnType<typeof vi.fn> } {
  let time = initialTime;
  return {
    get currentTime() {
      return time;
    },
    seek: vi.fn((nextTime: number) => {
      time = nextTime;
    }),
  };
}

describe('TimebaseSynchronizer: voiceover-authoritative sequences', () => {
  it('corrects an out-of-tolerance GSAP timeline and video beat from the voiceover clock', () => {
    const timeline = createTimeline(0.15);
    const voiceover = createMediaClock(0.8);
    const video = createMediaClock(0.1);
    const synchronizer = new TimebaseSynchronizer({
      timebase: 'voiceover',
      syncToleranceMs: 100,
      timeline,
      voiceover,
      video,
    });

    const result = synchronizer.synchronize();

    expect(result.authority).toBe('voiceover');
    expect(result.timelineCorrected).toBe(true);
    expect(result.videoCorrected).toBe(true);
    expect(timeline.seek).toHaveBeenCalledWith(0.8, false);
    expect(video.seek).toHaveBeenCalledWith(0.8);
  });

  it('does not thrash seeks when every clock remains inside the declared tolerance', () => {
    const timeline = createTimeline(0.75);
    const voiceover = createMediaClock(0.8);
    const video = createMediaClock(0.77);
    const synchronizer = new TimebaseSynchronizer({
      timebase: 'voiceover',
      syncToleranceMs: 100,
      timeline,
      voiceover,
      video,
    });

    synchronizer.synchronize();
    synchronizer.synchronize();

    expect(timeline.seek).not.toHaveBeenCalled();
    expect(video.seek).not.toHaveBeenCalled();
  });

  it('recovers from a frame drop, then remains stable after the corrected clocks converge', () => {
    const timeline = createTimeline(0.1);
    const voiceover = createMediaClock(0.9);
    const video = createMediaClock(0.9);
    const synchronizer = new TimebaseSynchronizer({
      timebase: 'voiceover',
      syncToleranceMs: 50,
      timeline,
      voiceover,
      video,
    });

    synchronizer.synchronize();
    expect(timeline.seek).toHaveBeenCalledTimes(1);
    voiceover.seek(0.94);
    synchronizer.synchronize();

    expect(timeline.seek).toHaveBeenCalledTimes(1);
  });
});

describe('TimebaseSynchronizer: timeline-authoritative sequences and lifecycle reset', () => {
  it('uses the timeline clock when narration is absent and slaves video to it', () => {
    const timeline = createTimeline(0.6);
    const video = createMediaClock(0.2);
    const synchronizer = new TimebaseSynchronizer({
      timebase: 'timeline',
      syncToleranceMs: 80,
      timeline,
      video,
    });

    const result = synchronizer.synchronize();

    expect(result.authority).toBe('timeline');
    expect(result.timelineCorrected).toBe(false);
    expect(result.videoCorrected).toBe(true);
    expect(video.seek).toHaveBeenCalledWith(0.6);
  });

  it('resets timeline and video time deterministically for replay and recovery', () => {
    const timeline = createTimeline(0.8);
    const video = createMediaClock(0.8);
    const synchronizer = new TimebaseSynchronizer({
      timebase: 'timeline',
      syncToleranceMs: 80,
      timeline,
      video,
    });

    synchronizer.reset();
    synchronizer.reset();

    expect(timeline.seek).toHaveBeenLastCalledWith(0, false);
    expect(video.seek).toHaveBeenLastCalledWith(0);
    expect(timeline.time).toBe(0);
    expect(video.currentTime).toBe(0);
  });
});
