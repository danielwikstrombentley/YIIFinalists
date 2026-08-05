import { useEffect, useRef } from 'react';
import { useMachineSnapshot } from './MachineProvider.js';
import { PreviewMetadata, type PreviewMetadataState } from '../ui/PreviewMetadata.js';

// Full-screen stage shell (T020): renders from machine snapshots only (Principle I) — never owns
// navigation state. The public surface renders zero menus/instructions/errors (Principle VI);
// `data-machine-state` is a debug/E2E hook only, never visible content. Real renderer mounting
// (Three.js globe / Cesium stage / handover canvases) lands with PH3's renderer adapters.
export function StageMount() {
  const snapshot = useMachineSnapshot();
  const stageRef = useRef<HTMLDivElement>(null);
  const globe = snapshot.context.runtime.globe;
  const previewProjectId = snapshot.context.previewedProjectId;
  const previewProject = previewProjectId ? (globe?.getProject(previewProjectId) ?? null) : null;
  const visibleProjectIds = new Set(globe?.adapter.visibleProjectIds ?? []);
  const emphasizedProjectId = globe?.adapter.emphasizedProjectId ?? null;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !globe) return;
    const handle = globe.adapter.start(stage);
    return () => handle.cancel();
  }, [globe]);

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
    </>
  );
}
