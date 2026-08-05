import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createActor, type ActorRefFrom, type SnapshotFrom } from 'xstate';
import { experienceMachine } from '../state/machine.js';

// Machine provider (T020): the XState actor is the sole navigation authority (Principle I).
// React components only ever read snapshots and send events — they never own navigation state.
// Uses `useSyncExternalStore` rather than `@xstate/react` to avoid an extra dependency for what
// is, at this shape, a very small subscription need.

type ExperienceActor = ActorRefFrom<typeof experienceMachine>;
export type ExperienceSnapshot = SnapshotFrom<typeof experienceMachine>;

const MachineContext = createContext<ExperienceActor | null>(null);

export interface MachineProviderProps {
  children: ReactNode;
  /** Injectable for tests; defaults to a fresh actor over the real experienceMachine. */
  actor?: ExperienceActor;
}

export function MachineProvider({ children, actor: injectedActor }: MachineProviderProps) {
  // `useState`'s lazy initializer runs exactly once and never touches a ref during render (unlike
  // the classic `if (!ref.current)` lazy-init pattern) — the setter is intentionally unused.
  const [actor] = useState<ExperienceActor>(() => injectedActor ?? createActor(experienceMachine));
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    actor.start();
    // Deliberately no cleanup/`actor.stop()` here: this provider is mounted once for the whole
    // app's lifetime (there is no real scenario where it unmounts while the page keeps running),
    // and once an XState actor is stopped it can never be restarted — `.start()` after `.stop()`
    // silently leaves it in `status: 'stopped'` and its `.subscribe()` callbacks never fire again
    // (confirmed directly against xstate@5), which is exactly what made React StrictMode's dev-only
    // mount→cleanup→remount probe permanently strand the app at its initial snapshot. Guarding
    // `.start()` with `hasStarted` (mirroring BootOrchestrator's own `hasBooted` guard) makes this
    // effect safe under that probe without ever calling `.stop()` on a still-live app.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- actor identity is stable for the component's lifetime
  }, []);

  return <MachineContext.Provider value={actor}>{children}</MachineContext.Provider>;
}

export function useMachineActor(): ExperienceActor {
  const actor = useContext(MachineContext);
  if (!actor) {
    throw new Error('useMachineActor must be used within a MachineProvider');
  }
  return actor;
}

export function useMachineSnapshot(): ExperienceSnapshot {
  const actor = useMachineActor();
  return useSyncExternalStore(
    useMemo(
      () => (onStoreChange: () => void) => actor.subscribe(onStoreChange).unsubscribe,
      [actor],
    ),
    () => actor.getSnapshot(),
  );
}
