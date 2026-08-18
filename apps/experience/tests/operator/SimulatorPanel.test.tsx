import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SimulatorPanel } from '../../src/operator/SimulatorPanel.js';
import { SimulatorTransport } from '../../src/input/transports/simulator.js';

describe('SimulatorPanel', () => {
  it('emits every public semantic action and operator-only failure hook through SimulatorTransport', () => {
    const simulator = new SimulatorTransport();
    const injectAction = vi.spyOn(simulator, 'injectAction');
    const { getByTestId } = render(<SimulatorPanel categoryId="cat-1" simulator={simulator} />);

    fireEvent.click(getByTestId('simulator-category-select'));
    fireEvent.click(getByTestId('simulator-preview-next'));
    fireEvent.click(getByTestId('simulator-preview-prev'));
    fireEvent.click(getByTestId('simulator-project-select'));
    fireEvent.click(getByTestId('simulator-content-select'));
    fireEvent.click(getByTestId('simulator-content-replay'));
    fireEvent.click(getByTestId('simulator-back'));
    fireEvent.click(getByTestId('simulator-idle'));
    fireEvent.click(getByTestId('simulator-reset'));
    fireEvent.click(getByTestId('simulator-force-media-failure'));

    expect(injectAction).toHaveBeenNthCalledWith(1, 'category.select', { categoryId: 'cat-1' });
    expect(injectAction).toHaveBeenNthCalledWith(2, 'preview.hover', { direction: 'next' });
    expect(injectAction).toHaveBeenNthCalledWith(3, 'preview.hover', { direction: 'prev' });
    expect(injectAction).toHaveBeenNthCalledWith(4, 'project.select', {});
    expect(injectAction).toHaveBeenNthCalledWith(5, 'content.select', { position: 1 });
    expect(injectAction).toHaveBeenNthCalledWith(6, 'content.select', { position: 1 });
    expect(injectAction).toHaveBeenNthCalledWith(7, 'nav.back', {});
    expect(injectAction).toHaveBeenNthCalledWith(8, 'nav.idle', {});
    expect(injectAction).toHaveBeenNthCalledWith(9, 'operator.reset', {}, { source: 'operator' });
    expect(injectAction).toHaveBeenNthCalledWith(
      10,
      'operator.command',
      { command: 'forceMediaFailure' },
      { source: 'operator' },
    );
  });

  it('invokes every transport-level failure injection and marks every SC-006 scenario as available', () => {
    const simulator = new SimulatorTransport();
    const duplicate = vi.spyOn(simulator, 'injectDuplicateBurst');
    const deliberate = vi.spyOn(simulator, 'injectDeliberateRepeat');
    const invalid = vi.spyOn(simulator, 'injectInvalidId');
    const unknown = vi.spyOn(simulator, 'injectUnknownType');
    const rapid = vi.spyOn(simulator, 'injectRapidHoverStream');
    const disconnect = vi.spyOn(simulator, 'disconnect');
    const connect = vi.spyOn(simulator, 'connect');
    const { getByTestId, getByText } = render(
      <SimulatorPanel categoryId="cat-1" simulator={simulator} transitionInterruptDelayMs={0} />,
    );

    fireEvent.click(getByTestId('simulator-duplicate-burst'));
    fireEvent.click(getByTestId('simulator-deliberate-repeat'));
    fireEvent.click(getByTestId('simulator-invalid-id'));
    fireEvent.click(getByTestId('simulator-unknown-type'));
    fireEvent.click(getByTestId('simulator-rapid-hover-stream'));
    fireEvent.click(getByTestId('simulator-disconnect'));
    fireEvent.click(getByTestId('simulator-reconnect'));
    fireEvent.click(getByTestId('simulator-transition-midpoint-interrupt'));

    expect(duplicate).toHaveBeenCalledWith('content.select', { position: 1 });
    expect(deliberate).toHaveBeenCalledWith('content.select', { position: 1 });
    expect(invalid).toHaveBeenCalledOnce();
    expect(unknown).toHaveBeenCalledOnce();
    expect(rapid).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledOnce();
    expect(getByText('SC-006 simulator coverage')).toBeVisible();
    expect(
      getByTestId('simulator-coverage').querySelectorAll('[data-available="true"]'),
    ).toHaveLength(18);
  });
});
