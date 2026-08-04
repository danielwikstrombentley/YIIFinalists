import { useMachineSnapshot } from './MachineProvider.js';

// Full-screen stage shell (T020): renders from machine snapshots only (Principle I) — never owns
// navigation state. The public surface renders zero menus/instructions/errors (Principle VI);
// `data-machine-state` is a debug/E2E hook only, never visible content. Real renderer mounting
// (Three.js globe / Cesium stage / handover canvases) lands with PH3's renderer adapters.
export function StageMount() {
  const snapshot = useMachineSnapshot();

  return (
    <div
      id="stage"
      data-machine-state={JSON.stringify(snapshot.value)}
      style={{ width: '100vw', height: '100vh', background: '#000' }}
    />
  );
}
