import { useEffect, useRef } from 'react';
import { useMachineSnapshot } from './MachineProvider.js';
import { LandingHero } from '../ui/LandingHero.js';
import { PreviewMetadata, type PreviewMetadataState } from '../ui/PreviewMetadata.js';
import type { CesiumPresentation } from '../state/runtime.js';

// Full-screen stage shell (T020): renders from machine snapshots only (Principle I) — never owns
// navigation state. The public surface renders zero menus/instructions/errors (Principle VI);
// `data-machine-state` is a debug/E2E hook only, never visible content. Real renderer mounting
// (Three.js globe / Cesium stage / handover canvases) lands with PH3's renderer adapters.
export function StageMount() {
  const snapshot = useMachineSnapshot();
  const stageRef = useRef<HTMLDivElement>(null);
  const globe = snapshot.context.runtime.globe;
  const runtime = snapshot.context.runtime;
  const previewProjectId = snapshot.context.previewedProjectId;
  const previewProject = previewProjectId ? (globe?.getProject(previewProjectId) ?? null) : null;
  const selectedProjectId = snapshot.context.selectedProjectId;
  const selectedProject = selectedProjectId ? (globe?.getProject(selectedProjectId) ?? null) : null;
  const visibleProjectIds = new Set(globe?.adapter.visibleProjectIds ?? []);
  const emphasizedProjectId = globe?.adapter.emphasizedProjectId ?? null;
  const publicState = typeof snapshot.value === 'string' ? snapshot.value : '';

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !globe) return;
    const handle = globe.adapter.start(stage);
    return () => handle.cancel();
  }, [globe]);

  useEffect(() => {
    const stage = stageRef.current;
    // Cesium's Viewer needs a real browser WebGL context. State and adapter tests inject their
    // own structural ports; skipping this browser-owned presentation in jsdom preserves that
    // separation without weakening the production/E2E path.
    if (!stage || !globe || import.meta.env.MODE === 'test') return;

    let disposed = false;
    let cesium: CesiumPresentation | null = null;
    let resolveReady!: (presentation: CesiumPresentation | null) => void;
    const ready = new Promise<CesiumPresentation | null>((resolve) => {
      resolveReady = resolve;
    });
    runtime.setCesiumReady(ready);

    // Cesium is intentionally loaded after the public stage has mounted. It is a large renderer
    // dependency, whereas boot/idle/category preview are purely globe-owned; a queued
    // `project.select` waits for this promise in the machine action rather than being dropped.
    void import('./cesium-presentation.js')
      .then(async ({ createCesiumPresentation }) => {
        if (disposed) {
          resolveReady(null);
          return;
        }
        const presentation = await createCesiumPresentation(stage, globe);
        if (disposed) {
          presentation.dispose();
          resolveReady(null);
          return;
        }
        cesium = presentation;
        runtime.setCesium(cesium);
        resolveReady(cesium);
      })
      .catch(() => {
        resolveReady(null);
      });

    return () => {
      disposed = true;
      resolveReady(null);
      if (runtime.cesium === cesium) runtime.setCesium(null);
      if (runtime.cesiumReady === ready) runtime.setCesiumReady(null);
      cesium?.dispose();
    };
  }, [globe, runtime]);

  return (
    <>
      <div
        id="stage"
        ref={stageRef}
        data-machine-state={JSON.stringify(snapshot.value)}
        style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000' }}
      >
        {/* Non-visible E2E probes: the public scene remains canvas-only with no textual UI. */}
        <div aria-hidden="true" hidden>
          {globe?.projectIds.map((projectId) => (
            <span
              key={projectId}
              data-emphasized={String(projectId === emphasizedProjectId)}
              data-project-id={projectId}
              data-testid="globe-marker"
              data-visible={String(visibleProjectIds.has(projectId))}
            />
          ))}
        </div>
      </div>
      <PreviewMetadata state={snapshot.value as PreviewMetadataState} project={previewProject} />
      <LandingHero state={publicState} project={selectedProject} />
    </>
  );
}
