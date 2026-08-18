import { useEffect, useRef } from 'react';
import { bootstrap, createRuntimeDependencies, type BootstrapDeps } from './bootstrap.js';
import { createContentPlaybackPresentation } from '../content/playback.js';
import { createGlobePresentation } from './globe-presentation.js';
import { MachineProvider, useMachineActor } from './MachineProvider.js';
import { SimulatorTransport } from '../input/transports/simulator.js';
import {
  transitionNowMs,
  type TransitionObservabilitySnapshot,
} from '../renderers/handover/transition-observability.js';
import { sharedTicker } from '../orchestration/ticker.js';
import { StageMount } from './StageMount.js';

// App shell (T020): kiosk bootstrap + machine provider + public stage + operator overlay mount
// point. The public surface renders zero menus/instructions/errors (Principle VI) regardless of
// boot outcome — failures route through the machine's own `recovering` state, never a thrown
// React error or visible message.

interface E2eRuntimeBridge {
  simulator: {
    injectAction(type: string, payload: unknown): void;
  };
  stateHistory(): unknown[];
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

function BootOrchestrator() {
  const actor = useMachineActor();
  const hasBooted = useRef(false);
  const depsRef = useRef<BootstrapDeps | null>(null);
  const categoryIdsRef = useRef<readonly string[]>([]);
  const lastProjectIdRef = useRef<string | null>(null);
  const lastCategoryIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (hasBooted.current) return;
    hasBooted.current = true;
    const deps = createRuntimeDependencies({ send: (event) => actor.send(event) });
    depsRef.current = deps;
    if (isE2eRun()) {
      exposeE2eBridge(actor, deps);
    }
    void bootstrap({
      ...deps,
      onReleaseLoaded: async (release) => {
        const projects = await deps.loader.loadAllProjects();
        const runtime = actor.getSnapshot().context.runtime;
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
          }),
        );
        categoryIdsRef.current = release.categories.map(({ id }) => id);
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
    const subscription = actor.subscribe((snapshot) => {
      const deps = depsRef.current;
      if (!deps) return;

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
    });
    return () => subscription.unsubscribe();
  }, [actor]);

  return null;
}

function exposeE2eBridge(actor: ReturnType<typeof useMachineActor>, deps: BootstrapDeps): void {
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
      injectAction(type, payload) {
        simulator.injectAction(type, payload);
      },
    },
    stateHistory: () => [...history],
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

export default function App() {
  return (
    <MachineProvider>
      <BootOrchestrator />
      <StageMount />
      {/* Hidden until the concealed activation sequence + operator UI land (T051/PH7). */}
      <div id="operator-overlay-mount" style={{ display: 'none' }} />
    </MachineProvider>
  );
}
