import type { SemanticAction } from '@yii/semantic-actions';
import { ContentLoader, type ContentLoaderOptions } from '../content/loader.js';
import { InputBoundary } from '../input/boundary.js';
import type { Transport } from '../input/transports/transport.js';
import { SimulatorTransport } from '../input/transports/simulator.js';
import { WebSocketTransport } from '../input/transports/websocket.js';
import type { ExperienceEvent } from '../state/types.js';

// Boot sequence (T020): load+revalidate the release, start the input boundary + transports,
// verify console connectivity (non-blocking), then enter idle — or fall back to `recovering` on
// failure. Kept as a plain function (not a hook) so it's directly unit-testable without mounting
// React (Tests: "boot integration test: seeded release -> boot -> idle; boot failure ->
// recovering fallback path").

export interface BootstrapDeps {
  loader: Pick<ContentLoader, 'load'>;
  boundary: InputBoundary;
  transports: readonly Transport[];
  send: (event: ExperienceEvent) => void;
  onBootError?: (error: unknown) => void;
}

export async function bootstrap(deps: BootstrapDeps): Promise<void> {
  // Input boundary + transports start immediately (non-blocking): console input can arrive
  // before content finishes loading, though nothing routes anywhere until idle is reached.
  for (const transport of deps.transports) {
    transport.onMessage((raw) => deps.boundary.handle(raw));
    try {
      transport.connect();
    } catch (error) {
      // Connection failures are diagnostics-only (contract boundary rule 6) — never fatal to boot.
      deps.onBootError?.(error);
    }
  }

  try {
    await deps.loader.load();
    deps.send({ type: 'internal.assetsVerified' });
  } catch (error) {
    deps.onBootError?.(error);
    deps.send({
      type: 'internal.adapterFailure',
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

export interface RuntimeDependenciesOptions {
  send: (event: ExperienceEvent) => void;
  contentLoaderOptions?: ContentLoaderOptions;
}

/** Builds the real, browser-facing dependency set used by the app shell (App.tsx). */
export function createRuntimeDependencies(options: RuntimeDependenciesOptions): BootstrapDeps {
  const loader = new ContentLoader({
    basePath: '/content',
    channel: 'staging',
    onOperatorAlert: (message) => console.warn(`[operator-alert] ${message}`),
    ...options.contentLoaderOptions,
  });

  const boundary = new InputBoundary({
    onAccepted: (action: SemanticAction) => {
      // `connection.status` never reaches the machine (contract boundary rule 6) — InputBoundary
      // already diverts it to onConnectionStatus, this is a type-narrowing backstop, not a
      // behaviour change.
      if (action.type === 'connection.status') return;
      options.send(action);
    },
    onRejected: (reason, raw) => console.debug('[input] rejected', reason, raw),
    onConnectionStatus: (status) => console.debug('[input] connection', status),
  });

  const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const transports: Transport[] = [
    new WebSocketTransport(`${wsProtocol}://${window.location.host}/ws`, { id: 'websocket' }),
    new SimulatorTransport({ id: 'simulator' }),
  ];

  return {
    loader,
    boundary,
    transports,
    send: options.send,
    onBootError: (error) => console.error('[boot]', error),
  };
}
