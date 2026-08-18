import { createContext, type Context } from 'react';
import type { ActorRefFrom } from 'xstate';
import type { ExperienceMachine } from '../state/machine.js';

export type ExperienceActor = ActorRefFrom<ExperienceMachine>;

interface MachineContextHotData {
  machineContext?: Context<ExperienceActor | null>;
}

// Keep the context object outside the Fast Refresh boundary that owns the provider and hooks.
// Otherwise Vite can update the provider before its consumers, leaving the old hook subscribed
// to a different context object and unmounting the public stage with a missing-provider error.
const hotData = import.meta.hot?.data as MachineContextHotData | undefined;

export const MachineContext =
  hotData?.machineContext ?? createContext<ExperienceActor | null>(null);

if (import.meta.hot) {
  import.meta.hot.dispose((data: MachineContextHotData) => {
    data.machineContext = MachineContext;
  });
}
