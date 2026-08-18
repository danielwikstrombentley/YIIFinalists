import { useSyncExternalStore } from 'react';
import type { DiagnosticsSnapshot } from './DiagnosticsStore.js';
import { DiagnosticsStore } from './DiagnosticsStore.js';

export interface OperatorOverlayProps {
  open: boolean;
  diagnostics: DiagnosticsStore;
  onClose(): void;
  onReset(): void;
  onCommand(command: string, params?: unknown): void;
}

const overlayStyle = {
  position: 'fixed' as const,
  inset: 0,
  zIndex: 100,
  overflow: 'auto',
  background: 'rgba(6, 12, 20, 0.97)',
  color: '#e6f6ff',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '14px',
  lineHeight: 1.4,
  padding: '24px',
};

const panelStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: '14px',
  maxWidth: '1440px',
  margin: '0 auto',
};

const cardStyle = {
  border: '1px solid rgba(158, 216, 255, 0.35)',
  borderRadius: '8px',
  padding: '14px',
  background: 'rgba(21, 42, 60, 0.55)',
};

function value(value: string | number | null): string {
  return value === null ? '—' : String(value);
}

function TransportStatus({ snapshot }: { snapshot: DiagnosticsSnapshot }) {
  const transport = snapshot.console.transports.simulator;
  return (
    <section style={cardStyle}>
      <h2>Console / simulator</h2>
      <dl
        data-dedup-drops={transport?.dedupDrops ?? 0}
        data-last-action={transport?.lastAction ?? ''}
        data-last-message-at={transport?.lastMessageAtMs ?? ''}
        data-status={transport?.status ?? 'unknown'}
        data-testid="diagnostics-transport-simulator"
      >
        <dt>Connection</dt>
        <dd>{transport?.status ?? 'unknown'}</dd>
        <dt>Last message</dt>
        <dd>{value(transport?.lastMessageAtMs ?? null)}</dd>
        <dt>Last action</dt>
        <dd>{transport?.lastAction ?? '—'}</dd>
        <dt>Dedup drops</dt>
        <dd>{transport?.dedupDrops ?? 0}</dd>
      </dl>
    </section>
  );
}

/**
 * Operator-only DOM. Its caller mounts this as a sibling of the public stage and only while the
 * input boundary has opened an operator capability; no public component imports or renders it.
 */
export function OperatorOverlay({
  open,
  diagnostics,
  onClose,
  onReset,
  onCommand,
}: OperatorOverlayProps) {
  const snapshot = useSyncExternalStore(diagnostics.subscribe, diagnostics.getSnapshot);
  if (!open) return null;

  return (
    <aside aria-label="Operator diagnostics" data-testid="operator-overlay" style={overlayStyle}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <strong>YII operator console</strong>
          <span style={{ marginLeft: '12px', opacity: 0.75 }}>Local diagnostics and recovery</span>
        </div>
        <button data-testid="operator-overlay-close" onClick={onClose} type="button">
          Close operator layer
        </button>
      </header>

      <div style={panelStyle}>
        <section
          data-state-path={snapshot.state.path}
          data-testid="diagnostics-state"
          style={cardStyle}
        >
          <h2>State</h2>
          <dl>
            <dt>Path</dt>
            <dd>{snapshot.state.path}</dd>
            <dt>Category / preview / selection</dt>
            <dd>
              {value(snapshot.state.activeCategoryId)} / {value(snapshot.state.previewedProjectId)}{' '}
              / {value(snapshot.state.selectedProjectId)}
            </dd>
            <dt>Content / sequence</dt>
            <dd>
              {value(snapshot.state.activeContentPosition)} / {value(snapshot.state.sequence.beat)}{' '}
              / {value(snapshot.state.sequence.percent)}% /{' '}
              {value(snapshot.state.sequence.elapsedMs)} ms
            </dd>
          </dl>
        </section>

        <section style={cardStyle}>
          <h2>Media</h2>
          <dl>
            <dt>Voiceover</dt>
            <dd>
              {snapshot.media.voiceover.status} · {value(snapshot.media.voiceover.assetId)} ·{' '}
              {value(snapshot.media.voiceover.positionSeconds)} s
            </dd>
            <dt>Video</dt>
            <dd>
              {snapshot.media.video.status} · {value(snapshot.media.video.assetId)}
            </dd>
          </dl>
        </section>

        <TransportStatus snapshot={snapshot} />

        <section style={cardStyle}>
          <h2>Renderers</h2>
          <dl>
            <dt>Globe</dt>
            <dd>{snapshot.renderers.globe.status}</dd>
            <dt>Cesium</dt>
            <dd>
              {snapshot.renderers.cesium.status} · {value(snapshot.renderers.cesium.tier)}
            </dd>
            <dt>Handover</dt>
            <dd>
              {snapshot.renderers.handover.status} ·{' '}
              {value(snapshot.renderers.handover.lastDurationMs)} ms
            </dd>
          </dl>
        </section>

        <section style={cardStyle}>
          <h2>Performance</h2>
          <dl>
            <dt>FPS / frame p95</dt>
            <dd>
              {value(snapshot.performance.fps)} / {value(snapshot.performance.frameTimeP95Ms)} ms
            </dd>
            <dt>Heap / ticker callbacks</dt>
            <dd>
              {snapshot.performance.heapTrend} / {snapshot.performance.tickerCallbackCount}
            </dd>
            <dt>Telemetry drops</dt>
            <dd>{snapshot.performance.telemetryDropped}</dd>
          </dl>
        </section>

        <section data-testid="diagnostics-asset-failures" style={cardStyle}>
          <h2>Assets and errors</h2>
          <p>
            Release {value(snapshot.assets.release.version)} ·{' '}
            {value(snapshot.assets.release.contentHash)}
          </p>
          <ul>
            {snapshot.assets.recentFailures.map((failure) => (
              <li key={`${failure.assetId}:${failure.atMs}`}>
                {failure.assetId}: {failure.error} (
                {failure.fallbackApplied ? 'fallback' : 'no fallback'})
              </li>
            ))}
            {snapshot.assets.recentFailures.length === 0 ? <li>No asset failures</li> : null}
          </ul>
          <ul>
            {snapshot.errors.recent.map((error) => (
              <li key={`${error.source}:${error.atMs}`}>
                {error.source}: {error.message}
              </li>
            ))}
          </ul>
        </section>

        <section style={cardStyle}>
          <h2>Recovery</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button data-testid="recovery-reset" onClick={onReset} type="button">
              Deep reset to idle
            </button>
            <button
              data-testid="recovery-renderer-globe"
              onClick={() => onCommand('rendererRecover', { renderer: 'globe' })}
              type="button"
            >
              Recover globe
            </button>
            <button
              data-testid="recovery-renderer-cesium"
              onClick={() => onCommand('rendererRecover', { renderer: 'cesium' })}
              type="button"
            >
              Recover Cesium
            </button>
            <button onClick={() => onCommand('reloadApp')} type="button">
              Request reload
            </button>
            <button onClick={() => onCommand('clearPreloadCache')} type="button">
              Clear preload cache
            </button>
          </div>
        </section>
      </div>
    </aside>
  );
}
