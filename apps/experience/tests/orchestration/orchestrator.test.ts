import gsap from 'gsap';
import { describe, expect, it } from 'vitest';
import {
  SequenceOrchestrator,
  type PlayableSequence,
} from '../../src/orchestration/orchestrator.js';
import { Ticker } from '../../src/orchestration/ticker.js';

// T015 (red-first): Principle II cancellation/replay semantics + research.md R6 single-ticker
// rule. MUST be red until T016 lands.

function sampleSequence(overrides: Partial<PlayableSequence> = {}): PlayableSequence {
  return {
    id: 'seq-1',
    openingState: { id: 'opening', elements: [{ target: 'hero', properties: { level: 0 } }] },
    beats: [
      { type: 'text', startTime: 0, duration: 200 },
      { type: 'media', startTime: 200, duration: 200 },
    ],
    finalFrame: { id: 'final', elements: [{ target: 'hero', properties: { level: 1 } }] },
    ...overrides,
  };
}

describe('SequenceOrchestrator: idempotent cancel', () => {
  it('repeated cancel() calls are a no-op (no throw, safe when nothing is playing)', () => {
    const orchestrator = new SequenceOrchestrator();
    expect(() => orchestrator.cancel()).not.toThrow();
    expect(() => orchestrator.cancel()).not.toThrow();
  });

  it('repeated cancel() after play() is a no-op the second time', () => {
    const orchestrator = new SequenceOrchestrator();
    orchestrator.play(sampleSequence());
    orchestrator.cancel();
    expect(() => orchestrator.cancel()).not.toThrow();
    expect(orchestrator.isPlaying()).toBe(false);
  });
});

describe('SequenceOrchestrator: replay restores the complete opening state', () => {
  it('replay() re-applies the openingState composition and resets progress to the start', () => {
    const orchestrator = new SequenceOrchestrator();
    const sequence = sampleSequence();
    orchestrator.play(sequence);

    orchestrator.seek(300); // move well into the sequence
    expect(orchestrator.progress).toBeGreaterThan(0);

    orchestrator.replay();
    expect(orchestrator.progress).toBe(0);
  });

  it('replay() is a no-op when nothing has been played yet', () => {
    const orchestrator = new SequenceOrchestrator();
    expect(() => orchestrator.replay()).not.toThrow();
    expect(orchestrator.isPlaying()).toBe(false);
  });
});

describe('SequenceOrchestrator: progress/completion callbacks report to a listener only', () => {
  it('calls onProgress as the timeline advances, without the orchestrator transitioning any state itself', () => {
    const progressValues: number[] = [];
    const orchestrator = new SequenceOrchestrator({ onProgress: (p) => progressValues.push(p) });
    orchestrator.play(sampleSequence());

    orchestrator.seek(200);
    orchestrator.seek(400);

    expect(progressValues.length).toBeGreaterThan(0);
    expect(progressValues.every((p) => p >= 0 && p <= 1)).toBe(true);
  });

  it('calls onComplete exactly once when the timeline reaches its end', () => {
    let completedCount = 0;
    const orchestrator = new SequenceOrchestrator({ onComplete: () => (completedCount += 1) });
    orchestrator.play(sampleSequence());

    orchestrator.seek(10_000); // past the end
    expect(completedCount).toBe(1);
  });
});

describe('Ticker: single RAF driver (research.md R6)', () => {
  it('registering a renderer twice via repeated start/stop cycles still fires exactly once per tick', () => {
    const ticker = new Ticker();
    let callCount = 0;
    const stopRegistration = ticker.registerRenderer(() => (callCount += 1));

    ticker.start();
    ticker.start(); // simulate a second play() cycle calling start() again
    ticker.start();
    gsap.ticker.tick();

    expect(callCount).toBe(1);

    ticker.stop();
    gsap.ticker.tick();
    expect(callCount).toBe(1); // fully unhooked after a single stop()

    stopRegistration();
  });

  it('supports multiple simultaneously-registered renderers (handover window)', () => {
    const ticker = new Ticker();
    let globeCalls = 0;
    let cesiumCalls = 0;
    const stopGlobe = ticker.registerRenderer(() => (globeCalls += 1));
    const stopCesium = ticker.registerRenderer(() => (cesiumCalls += 1));

    ticker.start();
    gsap.ticker.tick();

    expect(globeCalls).toBe(1);
    expect(cesiumCalls).toBe(1);

    stopGlobe();
    stopCesium();
    ticker.stop();
  });

  it('a deregistered renderer stops receiving ticks', () => {
    const ticker = new Ticker();
    let calls = 0;
    const stop = ticker.registerRenderer(() => (calls += 1));
    ticker.start();
    gsap.ticker.tick();
    expect(calls).toBe(1);

    stop();
    gsap.ticker.tick();
    expect(calls).toBe(1);

    ticker.stop();
  });
});

describe('SequenceOrchestrator: killed timelines release references', () => {
  it('cancel() clears internal timeline/context references so a subsequent play() starts fresh', () => {
    const orchestrator = new SequenceOrchestrator();
    orchestrator.play(sampleSequence());
    orchestrator.seek(200);
    orchestrator.cancel();

    expect(orchestrator.isPlaying()).toBe(false);
    expect(orchestrator.progress).toBe(0);

    orchestrator.play(sampleSequence({ id: 'seq-2' }));
    expect(orchestrator.progress).toBe(0);
    orchestrator.cancel();
  });
});
