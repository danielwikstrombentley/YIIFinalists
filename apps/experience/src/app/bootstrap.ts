import type { SemanticAction } from '@yii/semantic-actions';
import { ContentLoader, type ContentLoaderOptions } from '../content/loader.js';
import { InputBoundary } from '../input/boundary.js';
import type { ExclusivePriorityProvider } from '../input/priority-gate.js';
import type { Transport } from '../input/transports/transport.js';
import { SimulatorTransport } from '../input/transports/simulator.js';
import { WebSocketTransport } from '../input/transports/websocket.js';
import { createReleaseRefValidator } from '../input/validate.js';
import type { ExperienceEvent } from '../state/types.js';

// Boot sequence (T020): load+revalidate the release, start the input boundary + transports,
// verify console connectivity (non-blocking), then enter idle — or fall back to `recovering` on
// failure. Kept as a plain function (not a hook) so it's directly unit-testable without mounting
// React (Tests: "boot integration test: seeded release -> boot -> idle; boot failure ->
// recovering fallback path").

export interface BootstrapDeps {
  loader: Pick<ContentLoader, 'load' | 'loadAllProjects' | 'loadProject' | 'getCachedProject'>;
  boundary: InputBoundary;
  transports: readonly Transport[];
  send: (event: ExperienceEvent) => void;
  onBootError?: (error: unknown) => void;
  /** Completes renderer-specific release preparation before the machine is allowed to enter idle. */
  onReleaseLoaded?: (release: Awaited<ReturnType<ContentLoader['load']>>) => Promise<void> | void;
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
    const release = await deps.loader.load();
    deps.send({
      type: 'internal.releaseLoaded',
      categories: release.categories.map((category) => ({
        id: category.id,
        projectIds: category.projectIds,
      })),
    });
    await deps.onReleaseLoaded?.(release);
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
  /** Reads the machine's current exclusive transition floor without giving the boundary state ownership. */
  getExclusivePriority?: ExclusivePriorityProvider;
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
    // Real release-backed validation (PH2 review round 1 finding #2) — reads through to the
    // loader at call time, so it safely rejects every ref (fail-closed) until `loader.load()`
    // resolves, then validates against the live release with no further wiring needed.
    releaseValidator: createReleaseRefValidator(
      () => loader.activeRelease,
      (projectId) => loader.getCachedProject(projectId),
    ),
    getExclusivePriority: options.getExclusivePriority,
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
