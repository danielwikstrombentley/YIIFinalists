import { useEffect, useRef } from 'react';
import { bootstrap, createRuntimeDependencies, type BootstrapDeps } from './bootstrap.js';
import { MachineProvider, useMachineActor } from './MachineProvider.js';
import { StageMount } from './StageMount.js';

// App shell (T020): kiosk bootstrap + machine provider + public stage + operator overlay mount
// point. The public surface renders zero menus/instructions/errors (Principle VI) regardless of
// boot outcome — failures route through the machine's own `recovering` state, never a thrown
// React error or visible message.

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
    void bootstrap(deps);
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
