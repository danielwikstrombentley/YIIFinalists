// Adapter-handle registry: the entry/exit actions' single mechanism for owning cancellable work.
// Real renderer/orchestrator adapters (Three.js globe, Cesium stage, HandoverController, GSAP
// orchestrator) register their handles here in later phases; PH2 wires the pattern with stub
// handles so the machine skeleton's cleanup contract is already load-bearing (architecture rule:
// "every adapter operation returns a cancellable handle; state exit actions cancel owned handles
// idempotently; repeated cancellation is a no-op by contract").

export type CleanupHandle = () => void;

export class CleanupRegistry {
  private readonly handles = new Map<string, CleanupHandle>();

  register(name: string, handle: CleanupHandle): void {
    this.handles.set(name, handle);
  }

  /** Idempotent: cancelling an unregistered or already-cancelled name is a safe no-op. */
  cancel(name: string): void {
    const handle = this.handles.get(name);
    this.handles.delete(name);
    handle?.();
  }

  /** Idempotent: calling this repeatedly (e.g. duplicate exit) never throws or double-fires. */
  cancelAll(): void {
    const handles = [...this.handles.values()];
    this.handles.clear();
    for (const handle of handles) {
      handle();
    }
  }

  get size(): number {
    return this.handles.size;
  }
}

export function createCleanupRegistry(): CleanupRegistry {
  return new CleanupRegistry();
}
