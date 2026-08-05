import { useEffect, useRef } from 'react';
import { bootstrap, createRuntimeDependencies, type BootstrapDeps } from './bootstrap.js';
import { createGlobePresentation } from './globe-presentation.js';
import { MachineProvider, useMachineActor } from './MachineProvider.js';
import { SimulatorTransport } from '../input/transports/simulator.js';
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
}

declare global {
  interface Window {
    __YII_E2E__?: E2eRuntimeBridge;
  }
}

function isE2eRun(): boolean {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).has('e2e');
}

function BootOrchestrator() {
  const actor = useMachineActor();
  const hasBooted = useRef(false);
  const depsRef = useRef<BootstrapDeps | null>(null);
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
      onReleaseLoaded: async () => {
        const projects = await deps.loader.loadAllProjects();
        actor.getSnapshot().context.runtime.setGlobe(createGlobePresentation(projects));
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot must run exactly once
  }, []);

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
