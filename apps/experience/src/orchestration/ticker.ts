import gsap from 'gsap';

// The app's single RAF driver (research.md R6): exactly one ticker, shared by every renderer.
// Renderer adapters register a render callback instead of ever starting their own
// `requestAnimationFrame` loop; multiple renderers may be registered simultaneously only inside a
// handover window. `start()`/`stop()` are idempotent — repeated calls never create more than one
// underlying `gsap.ticker` registration.

export type RenderCallback = (deltaSeconds: number) => void;

export class Ticker {
  private readonly renderers = new Set<RenderCallback>();
  private started = false;
  private readonly tick = (_time: number, deltaTime: number): void => {
    const deltaSeconds = Math.max(0, deltaTime) / 1000;
    for (const render of this.renderers) render(deltaSeconds);
  };

  start(): void {
    if (this.started) return;
    gsap.ticker.add(this.tick);
    this.started = true;
  }

  stop(): void {
    if (!this.started) return;
    gsap.ticker.remove(this.tick);
    this.started = false;
  }

  /** Returns an unsubscribe function. Safe to call multiple times. */
  registerRenderer(render: RenderCallback): () => void {
    this.renderers.add(render);
    return () => this.renderers.delete(render);
  }

  get rendererCount(): number {
    return this.renderers.size;
  }
}

/** Shared app-wide ticker instance. Orchestrator instances default to this. */
export const sharedTicker = new Ticker();
