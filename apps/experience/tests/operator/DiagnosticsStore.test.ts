import { describe, expect, it, vi } from 'vitest';
import { DiagnosticsStore } from '../../src/operator/DiagnosticsStore.js';

describe('DiagnosticsStore', () => {
  it('populates every QR-008 field group from independent runtime feeds', () => {
    const store = new DiagnosticsStore({ now: () => 1_000 });
    const listener = vi.fn();
    store.subscribe(listener);

    store.updateMachine({
      statePath: 'contentPlaying',
      activeCategoryId: 'cat-1',
      previewedProjectId: 'cat-1-proj-2',
      selectedProjectId: 'cat-1-proj-2',
      activeContentPosition: 1,
    });
    store.updateSequenceProgress({ beat: 'intro', percent: 40, elapsedMs: 1_200 });
    store.updateVoiceover({ status: 'playing', positionSeconds: 1.2, assetId: 'voiceover-1' });
    store.updateVideo({ status: 'playing', assetId: 'video-1' });
    store.recordTransportStatus('console-a', 'connected', 1_001);
    store.recordAcceptedAction('console-a', 'category.select', 1_002);
    store.recordDedupDrop('console-a');
    store.updateRenderer('globe', { status: 'ready' });
    store.updateRenderer('cesium', { status: 'fallback', tier: 'safe-composition' });
    store.updateHandover({ status: 'revealing', lastDurationMs: 850 });
    store.updatePerformance({
      fps: 59.8,
      frameTimeP95Ms: 18.4,
      heapTrend: 'stable',
      tickerCallbackCount: 1,
      telemetryDropped: 2,
    });
    store.recordAssetFailure({
      assetId: 'video-1',
      error: 'network unavailable',
      fallbackApplied: true,
      atMs: 1_003,
    });
    store.setRelease({ version: '1.2.3', contentHash: 'hash-123' });
    store.recordError({ source: 'renderer', message: 'fallback selected', atMs: 1_004 });

    expect(store.getSnapshot()).toEqual({
      state: {
        path: 'contentPlaying',
        activeCategoryId: 'cat-1',
        previewedProjectId: 'cat-1-proj-2',
        selectedProjectId: 'cat-1-proj-2',
        activeContentPosition: 1,
        sequence: { beat: 'intro', percent: 40, elapsedMs: 1_200 },
      },
      media: {
        voiceover: { status: 'playing', positionSeconds: 1.2, assetId: 'voiceover-1' },
        video: { status: 'playing', assetId: 'video-1' },
      },
      console: {
        transports: {
          'console-a': {
            status: 'connected',
            lastMessageAtMs: 1_002,
            lastAction: 'category.select',
            dedupDrops: 1,
          },
        },
      },
      renderers: {
        globe: { status: 'ready', tier: null },
        cesium: { status: 'fallback', tier: 'safe-composition' },
        handover: { status: 'revealing', lastDurationMs: 850 },
      },
      performance: {
        fps: 59.8,
        frameTimeP95Ms: 18.4,
        heapTrend: 'stable',
        tickerCallbackCount: 1,
        telemetryDropped: 2,
      },
      assets: {
        recentFailures: [
          {
            assetId: 'video-1',
            error: 'network unavailable',
            fallbackApplied: true,
            atMs: 1_003,
          },
        ],
        release: { version: '1.2.3', contentHash: 'hash-123' },
      },
      errors: {
        recent: [{ source: 'renderer', message: 'fallback selected', atMs: 1_004 }],
      },
    });
    expect(listener).toHaveBeenCalled();
  });

  it('keeps a stable immutable snapshot and avoids notifications for semantic no-op updates', () => {
    const store = new DiagnosticsStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    const initial = store.getSnapshot();
    store.updateMachine({ statePath: 'boot' });
    expect(store.getSnapshot()).toBe(initial);
    expect(listener).not.toHaveBeenCalled();

    store.updateMachine({ statePath: 'idle' });
    const idle = store.getSnapshot();
    expect(idle).not.toBe(initial);
    expect(listener).toHaveBeenCalledTimes(1);

    store.updateMachine({ statePath: 'idle' });
    expect(store.getSnapshot()).toBe(idle);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.updateMachine({ statePath: 'recovering' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('retains bounded newest-first rings for asset failures and runtime errors', () => {
    const store = new DiagnosticsStore({ assetFailureCapacity: 2, errorCapacity: 2 });

    for (const suffix of ['one', 'two', 'three']) {
      store.recordAssetFailure({ assetId: suffix, error: suffix, fallbackApplied: false });
      store.recordError({ source: 'media', message: suffix });
    }

    expect(store.getSnapshot().assets.recentFailures.map((failure) => failure.assetId)).toEqual([
      'three',
      'two',
    ]);
    expect(store.getSnapshot().errors.recent.map((error) => error.message)).toEqual([
      'three',
      'two',
    ]);
  });
});
