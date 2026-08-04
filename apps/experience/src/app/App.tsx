import { useEffect, useRef } from 'react';
import { createRuntimeDependencies, bootstrap } from './bootstrap.js';
import { MachineProvider, useMachineActor } from './MachineProvider.js';
import { StageMount } from './StageMount.js';

// App shell (T020): kiosk bootstrap + machine provider + public stage + operator overlay mount
// point. The public surface renders zero menus/instructions/errors (Principle VI) regardless of
// boot outcome — failures route through the machine's own `recovering` state, never a thrown
// React error or visible message.

function BootOrchestrator() {
  const actor = useMachineActor();
  const hasBooted = useRef(false);

  useEffect(() => {
    if (hasBooted.current) return;
    hasBooted.current = true;
    const deps = createRuntimeDependencies({ send: (event) => actor.send(event) });
    void bootstrap(deps);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot must run exactly once
  }, []);

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
