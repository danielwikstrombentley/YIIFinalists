import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import App from './App';

// Smoke test only — proves the Vite + React + Vitest pipeline (T002). Real behavioural coverage
// is added alongside the app shell (T020) and each user-story phase.
describe('App (toolchain smoke test)', () => {
  it('renders the full-screen stage mount point', () => {
    const { container } = render(<App />);
    const stage = container.querySelector('#stage');
    expect(stage).toBeInTheDocument();
  });
});
