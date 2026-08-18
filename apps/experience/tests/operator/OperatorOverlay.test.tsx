import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DiagnosticsStore } from '../../src/operator/DiagnosticsStore.js';
import { OperatorOverlay } from '../../src/operator/OperatorOverlay.js';

describe('OperatorOverlay', () => {
  it('does not render technical diagnostics into the DOM while closed', () => {
    const diagnostics = new DiagnosticsStore();
    diagnostics.updateMachine({ statePath: 'contentPlaying' });
    const { container } = render(
      <OperatorOverlay
        diagnostics={diagnostics}
        onClose={vi.fn()}
        onCommand={vi.fn()}
        onReset={vi.fn()}
        open={false}
      />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(container.textContent).toBe('');
  });

  it('sends recovery controls through callbacks and allows an operator-only close', () => {
    const diagnostics = new DiagnosticsStore();
    const onClose = vi.fn();
    const onCommand = vi.fn();
    const onReset = vi.fn();
    const { getByTestId, getByText } = render(
      <OperatorOverlay
        diagnostics={diagnostics}
        onClose={onClose}
        onCommand={onCommand}
        onReset={onReset}
        open
      />,
    );

    fireEvent.click(getByTestId('recovery-reset'));
    fireEvent.click(getByTestId('recovery-renderer-cesium'));
    fireEvent.click(getByText('Request reload'));
    fireEvent.click(getByTestId('operator-overlay-close'));

    expect(onReset).toHaveBeenCalledOnce();
    expect(onCommand).toHaveBeenNthCalledWith(1, 'rendererRecover', { renderer: 'cesium' });
    expect(onCommand).toHaveBeenNthCalledWith(2, 'reloadApp');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
