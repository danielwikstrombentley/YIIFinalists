import { useEffect, useRef, useState } from 'react';
import { SimulatorTransport } from '../input/transports/simulator.js';

export const SC006_SIMULATOR_SCENARIOS = [
  { id: 'category.select', label: 'Category select' },
  { id: 'preview.hover', label: 'Preview hover' },
  { id: 'project.select', label: 'Project select' },
  { id: 'content.select', label: 'Content select' },
  { id: 'content.replay', label: 'Deliberate content replay' },
  { id: 'nav.back', label: 'Back navigation' },
  { id: 'nav.idle', label: 'Return to idle' },
  { id: 'operator.reset', label: 'Operator reset' },
  { id: 'duplicate-burst', label: 'Duplicate burst' },
  { id: 'deliberate-repeat', label: 'Deliberate repeat' },
  { id: 'invalid-id', label: 'Invalid identifier' },
  { id: 'unknown-type', label: 'Unknown command' },
  { id: 'rapid-hover-stream', label: 'Rapid hover stream' },
  { id: 'disconnect', label: 'Disconnect' },
  { id: 'reconnect', label: 'Reconnect' },
  { id: 'transition-midpoint-interrupt', label: 'Transition midpoint interrupt' },
  { id: 'force-media-failure', label: 'Forced media failure' },
  { id: 'renderer-recover', label: 'Renderer recovery' },
] as const;

type SimulatorScenarioId = (typeof SC006_SIMULATOR_SCENARIOS)[number]['id'];

export interface SimulatorPanelProps {
  simulator: SimulatorTransport;
  /** First valid category from the release; the panel never invents a production identifier. */
  categoryId: string | null;
  /** Delays the deliberately injected higher-priority action into an active handover window. */
  transitionInterruptDelayMs?: number;
}

const panelStyle = {
  border: '1px solid rgba(158, 216, 255, 0.35)',
  borderRadius: '8px',
  padding: '14px',
  background: 'rgba(21, 42, 60, 0.55)',
};

const controlStyle = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: '8px',
};

/**
 * Hidden operator-only simulator UI. Every button either calls a SimulatorTransport injection
 * helper or builds an envelope through `injectAction`; neither path can reach the machine except
 * through the ordinary InputBoundary.
 */
export function SimulatorPanel({
  simulator,
  categoryId,
  transitionInterruptDelayMs = 120,
}: SimulatorPanelProps) {
  const [exercised, setExercised] = useState<ReadonlySet<SimulatorScenarioId>>(() => new Set());
  const interruptTimer = useRef<number | null>(null);
  const selectedCategoryId = categoryId ?? '';

  useEffect(
    () => () => {
      if (interruptTimer.current !== null) window.clearTimeout(interruptTimer.current);
    },
    [],
  );

  const run = (scenario: SimulatorScenarioId, inject: () => void): void => {
    inject();
    setExercised((previous) => {
      if (previous.has(scenario)) return previous;
      return new Set([...previous, scenario]);
    });
  };

  const injectCategory = (): void => {
    if (!selectedCategoryId) return;
    simulator.injectAction('category.select', { categoryId: selectedCategoryId });
  };

  const scheduleTransitionInterrupt = (): void => {
    if (!selectedCategoryId) return;
    if (interruptTimer.current !== null) window.clearTimeout(interruptTimer.current);
    interruptTimer.current = window.setTimeout(
      () => {
        interruptTimer.current = null;
        simulator.injectAction('category.select', { categoryId: selectedCategoryId });
      },
      Math.max(0, transitionInterruptDelayMs),
    );
  };

  return (
    <section data-testid="simulator-panel" style={panelStyle}>
      <h2>Simulator</h2>
      <div style={controlStyle}>
        <button
          data-testid="simulator-category-select"
          disabled={!selectedCategoryId}
          onClick={() => run('category.select', injectCategory)}
          type="button"
        >
          Select category
        </button>
        <button
          data-testid="simulator-preview-next"
          onClick={() =>
            run('preview.hover', () =>
              simulator.injectAction('preview.hover', { direction: 'next' }),
            )
          }
          type="button"
        >
          Preview next
        </button>
        <button
          data-testid="simulator-preview-prev"
          onClick={() =>
            run('preview.hover', () =>
              simulator.injectAction('preview.hover', { direction: 'prev' }),
            )
          }
          type="button"
        >
          Preview previous
        </button>
        <button
          data-testid="simulator-project-select"
          onClick={() => run('project.select', () => simulator.injectAction('project.select', {}))}
          type="button"
        >
          Confirm project
        </button>
        <button
          data-testid="simulator-content-select"
          onClick={() =>
            run('content.select', () => simulator.injectAction('content.select', { position: 1 }))
          }
          type="button"
        >
          Select content 1
        </button>
        <button
          data-testid="simulator-content-replay"
          onClick={() =>
            run('content.replay', () => simulator.injectAction('content.select', { position: 1 }))
          }
          type="button"
        >
          Replay content 1
        </button>
        <button
          data-testid="simulator-back"
          onClick={() => run('nav.back', () => simulator.injectAction('nav.back', {}))}
          type="button"
        >
          Back
        </button>
        <button
          data-testid="simulator-idle"
          onClick={() => run('nav.idle', () => simulator.injectAction('nav.idle', {}))}
          type="button"
        >
          Return to idle
        </button>
        <button
          data-testid="simulator-reset"
          onClick={() =>
            run('operator.reset', () =>
              simulator.injectAction('operator.reset', {}, { source: 'operator' }),
            )
          }
          type="button"
        >
          Operator reset
        </button>
      </div>

      <h3>Input and failure injections</h3>
      <div style={controlStyle}>
        <button
          data-testid="simulator-duplicate-burst"
          onClick={() =>
            run('duplicate-burst', () =>
              simulator.injectDuplicateBurst('content.select', { position: 1 }),
            )
          }
          type="button"
        >
          Duplicate burst
        </button>
        <button
          data-testid="simulator-deliberate-repeat"
          onClick={() =>
            run('deliberate-repeat', () =>
              simulator.injectDeliberateRepeat('content.select', { position: 1 }),
            )
          }
          type="button"
        >
          Deliberate repeat
        </button>
        <button
          data-testid="simulator-invalid-id"
          onClick={() => run('invalid-id', () => simulator.injectInvalidId())}
          type="button"
        >
          Invalid ID
        </button>
        <button
          data-testid="simulator-unknown-type"
          onClick={() => run('unknown-type', () => simulator.injectUnknownType())}
          type="button"
        >
          Unknown type
        </button>
        <button
          data-testid="simulator-rapid-hover-stream"
          onClick={() => run('rapid-hover-stream', () => simulator.injectRapidHoverStream())}
          type="button"
        >
          Rapid hover stream
        </button>
        <button
          data-testid="simulator-disconnect"
          onClick={() => run('disconnect', () => simulator.disconnect())}
          type="button"
        >
          Disconnect simulator
        </button>
        <button
          data-testid="simulator-reconnect"
          onClick={() => run('reconnect', () => simulator.connect())}
          type="button"
        >
          Reconnect simulator
        </button>
        <button
          data-testid="simulator-transition-midpoint-interrupt"
          disabled={!selectedCategoryId}
          onClick={() => run('transition-midpoint-interrupt', scheduleTransitionInterrupt)}
          type="button"
        >
          Interrupt transition midpoint
        </button>
        <button
          data-testid="simulator-force-media-failure"
          onClick={() =>
            run('force-media-failure', () =>
              simulator.injectAction(
                'operator.command',
                { command: 'forceMediaFailure' },
                { source: 'operator' },
              ),
            )
          }
          type="button"
        >
          Force media failure
        </button>
        <button
          data-testid="simulator-renderer-recover"
          onClick={() =>
            run('renderer-recover', () =>
              simulator.injectAction(
                'operator.command',
                { command: 'rendererRecover', params: { renderer: 'cesium' } },
                { source: 'operator' },
              ),
            )
          }
          type="button"
        >
          Recover Cesium renderer
        </button>
      </div>

      <section aria-label="SC-006 simulator coverage" data-testid="simulator-coverage">
        <h3>SC-006 simulator coverage</h3>
        <ul>
          {SC006_SIMULATOR_SCENARIOS.map((scenario) => (
            <li
              data-available="true"
              data-exercised={String(exercised.has(scenario.id))}
              data-simulator-scenario={scenario.id}
              key={scenario.id}
            >
              {scenario.label}: {exercised.has(scenario.id) ? 'exercised' : 'available'}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
