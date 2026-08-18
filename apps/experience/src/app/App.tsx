import { useEffect, useRef, useState } from 'react';
import { bootstrap, createRuntimeDependencies, type RuntimeDependencies } from './bootstrap.js';
import { createContentPlaybackPresentation } from '../content/playback.js';
import { createGlobePresentation } from './globe-presentation.js';
import { MachineProvider, useMachineActor } from './MachineProvider.js';
import { exclusivePriorityForState } from '../input/priority-gate.js';
import { SimulatorTransport } from '../input/transports/simulator.js';
import {
  transitionNowMs,
  type TransitionObservabilitySnapshot,
} from '../renderers/handover/transition-observability.js';
import { sharedTicker } from '../orchestration/ticker.js';
import { OperatorOverlay } from '../operator/OperatorOverlay.js';
import { StageMount } from './StageMount.js';

// App shell (T020): kiosk bootstrap + machine provider + public stage + operator overlay mount
// point. The public surface renders zero menus/instructions/errors (Principle VI) regardless of
// boot outcome — failures route through the machine's own `recovering` state, never a thrown
// React error or visible message.

interface E2eRuntimeBridge {
  simulator: {
    injectAction(
      type: string,
      payload: unknown,
      source?: 'console' | 'simulator' | 'operator',
    ): void;
  };
  stateHistory(): unknown[];
  diagnosticsSnapshot(): unknown;
  contentSnapshot(): unknown;
  transitionSnapshot(): TransitionObservabilitySnapshot;
}

declare global {
  interface Window {
    __YII_E2E__?: E2eRuntimeBridge;
  }
}

function isE2eRun(): boolean {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).has('e2e');
}

function isEditableTextTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function machineStatePath(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return 'unknown';
  const [parent, child] = Object.entries(value as Record<string, unknown>)[0] ?? [];
  if (!parent) return 'unknown';
  const childPath = machineStatePath(child);
  return childPath === 'unknown' ? parent : `${parent}.${childPath}`;
}

function diagnosticsVoiceoverStatus(
  status: string | undefined,
): 'unknown' | 'playing' | 'stopped' | 'fallback' | 'error' {
  if (status === 'playing' || status === 'stopped' || status === 'fallback') return status;
  return status === 'idle' || status === undefined ? 'stopped' : 'error';
}

function diagnosticsHandoverStatus(
  status: string | undefined,
):
  | 'idle'
  | 'approaching'
  | 'flying'
  | 'blending'
  | 'covering'
  | 'revealing'
  | 'settled'
  | 'fallback'
  | 'cancelled'
  | 'unknown' {
  const known = new Set([
    'idle',
    'approaching',
    'flying',
    'blending',
    'covering',
    'revealing',
    'settled',
    'fallback',
    'cancelled',
  ]);
  return known.has(status ?? '')
    ? (status as Exclude<ReturnType<typeof diagnosticsHandoverStatus>, 'unknown'>)
    : 'unknown';
}

interface BootOrchestratorProps {
  onDependenciesReady(dependencies: RuntimeDependencies): void;
  onOperatorActivated(): void;
  onCategoryIdsLoaded(categoryIds: readonly string[]): void;
}

function BootOrchestrator({
  onDependenciesReady,
  onOperatorActivated,
  onCategoryIdsLoaded,
}: BootOrchestratorProps) {
  const actor = useMachineActor();
  const hasBooted = useRef(false);
  const depsRef = useRef<RuntimeDependencies | null>(null);
  const categoryIdsRef = useRef<readonly string[]>([]);
  const lastProjectIdRef = useRef<string | null>(null);
  const lastCategoryIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (hasBooted.current) return;
    hasBooted.current = true;
    const deps = createRuntimeDependencies({
      send: (event) => actor.send(event),
      getExclusivePriority: () => exclusivePriorityForState(actor.getSnapshot().value),
      onOperatorActivated,
    });
    depsRef.current = deps;
    onDependenciesReady(deps);
    const runtime = actor.getSnapshot().context.runtime;
    runtime.setRecoveryControls({
      clearPreloadCache: () => {
        deps.loader.clearPreloadCache();
        runtime.cesium?.clearPreloadCache?.();
      },
      requestReload: () => {
        // A watchdog request is intentionally not awaited; it cannot delay an operator command,
        // visual fallback, or public navigation if the local sidecar is unavailable.
        void fetch('/watchdog/reload', { method: 'POST' }).catch(() => undefined);
      },
    });
    if (isE2eRun()) {
      exposeE2eBridge(actor, deps);
    }
    void bootstrap({
      ...deps,
      onReleaseLoaded: async (release) => {
        const projects = await deps.loader.loadAllProjects();
        const globe = createGlobePresentation(
          projects,
          (packageRelativePath) => `/content/releases/${release.version}/${packageRelativePath}`,
        );
        runtime.setGlobe(globe);
        runtime.setContent(
          createContentPlaybackPresentation({
            getProject: (projectId) => globe.getProject(projectId),
            resolveAssetUrl: globe.resolveAssetUrl,
            send: (event) => actor.send(event),
            onMediaFailure: ({ assetId, error }) => {
              deps.diagnostics.recordAssetFailure({
                assetId,
                error,
                fallbackApplied: true,
              });
              deps.diagnostics.updateVideo({ status: 'fallback', assetId });
            },
          }),
        );
        categoryIdsRef.current = release.categories.map(({ id }) => id);
        onCategoryIdsLoaded(categoryIdsRef.current);
        deps.diagnostics.setRelease({
          version: release.version,
          contentHash: release.manifest.contentHash,
        });
        deps.telemetry.setReleaseContext({
          version: release.version,
          contentHash: release.manifest.contentHash,
        });
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot must run exactly once
  }, []);

  useEffect(() => {
    // Research R7 permits a development keyboard wrapper only when it follows the same
    // SimulatorTransport → InputBoundary path as every other console action.
    if (!import.meta.env.DEV) return;

    const simulator = depsRef.current?.transports.find(
      (transport): transport is SimulatorTransport => transport instanceof SimulatorTransport,
    );
    if (!simulator) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isEditableTextTarget(event.target)
      ) {
        return;
      }

      if (event.key === '0') {
        if (categoryIdsRef.current.length === 0) return;
        event.preventDefault();
        simulator.injectAction('nav.idle', {});
        return;
      }

      if (event.key === '3') {
        const snapshot = actor.getSnapshot();
        if (
          !snapshot.matches({ categoryActive: 'preview' }) ||
          !snapshot.context.previewedProjectId
        ) {
          return;
        }

        event.preventDefault();
        simulator.injectAction('project.select', {});
        return;
      }

      if (event.key !== '1') return;

      const categoryIds = categoryIdsRef.current;
      const categoryId = categoryIds[Math.floor(Math.random() * categoryIds.length)];
      if (!categoryId) return;

      event.preventDefault();
      simulator.injectAction('category.select', { categoryId });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actor]);

  useEffect(() => {
    // Keeps the input boundary's release validator in sync with the machine's own idea of "the
    // active category/project" (Principle I: the machine stays the single source of truth; the
    // boundary just mirrors it) so `preview.hover { projectId }` can be checked against the active
    // category's own projects (PH2 round 2 finding #1 — a project from another category was
    // previously accepted) and `content.select { position }` against the active project (round 1
    // finding #2); also warms the loader's project cache so `hasContentPosition` has data to check.
    const observeSnapshot = (snapshot: ReturnType<typeof actor.getSnapshot>): void => {
      const deps = depsRef.current;
      if (!deps) return;

      deps.diagnostics.updateMachine({
        statePath: machineStatePath(snapshot.value),
        activeCategoryId: snapshot.context.activeCategoryId,
        previewedProjectId: snapshot.context.previewedProjectId,
        selectedProjectId: snapshot.context.selectedProjectId,
        activeContentPosition: snapshot.context.activeContentPosition,
      });
      deps.telemetry.observeStateTransition({
        stateAfter: machineStatePath(snapshot.value),
        refs: {
          categoryId: snapshot.context.activeCategoryId,
          projectId: snapshot.context.selectedProjectId ?? snapshot.context.previewedProjectId,
          position: snapshot.context.activeContentPosition,
        },
      });
      deps.diagnostics.updatePerformance({ tickerCallbackCount: sharedTicker.rendererCount });

      const content = snapshot.context.runtime.content;
      const contentSnapshot = content?.snapshot;
      deps.diagnostics.updateVoiceover({
        status: diagnosticsVoiceoverStatus(content?.voiceoverStatus),
        positionSeconds: null,
        assetId: contentSnapshot?.option.voiceover.file ?? null,
      });
      deps.diagnostics.updateVideo({
        status: contentSnapshot?.mediaFallback ? 'fallback' : 'paused',
        assetId: content?.videoSurface.activeAssetId ?? null,
      });
      deps.diagnostics.updateSequenceProgress({
        beat: contentSnapshot?.phase ?? null,
        percent: contentSnapshot?.phase === 'final-hold' ? 100 : null,
        elapsedMs: null,
      });

      const runtime = snapshot.context.runtime;
      deps.diagnostics.updateRenderer('globe', {
        status: runtime.globe?.adapter.isDisposed
          ? 'disposed'
          : runtime.globe?.adapter.idleLoopRunning
            ? 'ready'
            : 'inactive',
      });
      deps.diagnostics.updateRenderer('cesium', {
        status: runtime.cesium?.stage.isRendering
          ? 'ready'
          : runtime.cesium
            ? 'inactive'
            : 'unknown',
        tier: runtime.cesium?.stage.tier ?? null,
      });
      const handover = runtime.cesium?.handover.transitionProbe;
      deps.diagnostics.updateHandover({
        status: diagnosticsHandoverStatus(handover?.status),
        lastDurationMs:
          handover?.startedAtMs === null || handover?.startedAtMs === undefined
            ? null
            : Math.max(0, performance.now() - handover.startedAtMs),
      });

      const categoryId = snapshot.context.activeCategoryId;
      if (categoryId !== lastCategoryIdRef.current) {
        lastCategoryIdRef.current = categoryId;
        deps.boundary.setActiveCategory(categoryId);
      }

      const projectId = snapshot.context.selectedProjectId;
      if (projectId === lastProjectIdRef.current) return;
      lastProjectIdRef.current = projectId;
      deps.boundary.setActiveProject(projectId);
      if (projectId) {
        void deps.loader.loadProject(projectId).catch(() => {
          // Prefetch failure is non-fatal here: content.select simply stays rejected (fail-closed)
          // until loadProject() succeeds; the renderer tasks (PH3+) retry loading for playback.
        });
      }
    };
    observeSnapshot(actor.getSnapshot());
    const subscription = actor.subscribe(observeSnapshot);
    return () => subscription.unsubscribe();
  }, [actor]);

  return null;
}

function exposeE2eBridge(
  actor: ReturnType<typeof useMachineActor>,
  deps: RuntimeDependencies,
): void {
  const simulator = deps.transports.find(
    (transport): transport is SimulatorTransport => transport instanceof SimulatorTransport,
  );
  if (!simulator) return;

  const history: unknown[] = [];
  let previous = '';
  const record = (value: unknown): void => {
    const serialized = JSON.stringify(value);
    if (serialized === previous) return;
    previous = serialized;
    history.push(value);
  };
  record(actor.getSnapshot().value);
  actor.subscribe((snapshot) => record(snapshot.value));

  window.__YII_E2E__ = {
    simulator: {
      injectAction(type, payload, source) {
        simulator.injectAction(type, payload, source ? { source } : {});
      },
    },
    stateHistory: () => [...history],
    diagnosticsSnapshot: () => deps.diagnostics.getSnapshot(),
    contentSnapshot: () => actor.getSnapshot().context.runtime.content?.snapshot ?? null,
    transitionSnapshot() {
      const snapshot = actor.getSnapshot();
      const runtime = snapshot.context.runtime;
      const targetProjectId =
        snapshot.context.selectedProjectId ?? snapshot.context.previewedProjectId;
      return {
        capturedAtMs: transitionNowMs(),
        targetProjectId,
        sharedTickerRendererCount: sharedTicker.rendererCount,
        globe: runtime.globe?.adapter.transitionProbe(targetProjectId) ?? null,
        cesium: runtime.cesium?.stage.transitionProbe() ?? null,
        handover: runtime.cesium?.handover.transitionProbe ?? null,
      };
    },
  };
}

function ExperienceShell() {
  const [dependencies, setDependencies] = useState<RuntimeDependencies | null>(null);
  const [operatorOpen, setOperatorOpen] = useState(false);
  const [categoryIds, setCategoryIds] = useState<readonly string[]>([]);
  const simulator = dependencies?.transports.find(
    (transport): transport is SimulatorTransport => transport instanceof SimulatorTransport,
  );

  const closeOperatorOverlay = (): void => {
    dependencies?.boundary.deactivateOperator();
    setOperatorOpen(false);
  };

  return (
    <>
      <BootOrchestrator
        onCategoryIdsLoaded={setCategoryIds}
        onDependenciesReady={setDependencies}
        onOperatorActivated={() => setOperatorOpen(true)}
      />
      <StageMount />
      <div id="operator-overlay-mount" style={{ display: operatorOpen ? 'block' : 'none' }}>
        {dependencies && simulator ? (
          <OperatorOverlay
            categoryId={categoryIds[0] ?? null}
            diagnostics={dependencies.diagnostics}
            onClose={closeOperatorOverlay}
            onCommand={(command, params) => {
              simulator.injectAction(
                'operator.command',
                { command, params },
                { source: 'operator' },
              );
            }}
            onReset={() => simulator.injectAction('operator.reset', {}, { source: 'operator' })}
            open={operatorOpen}
            simulator={simulator}
          />
        ) : null}
      </div>
    </>
  );
}

export default function App() {
  return (
    <MachineProvider>
      <ExperienceShell />
    </MachineProvider>
  );
}
