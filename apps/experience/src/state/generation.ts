// Generation-token utility (architecture rule: "asynchronous completions carry generation tokens
// and are discarded when stale"). Each state-scoped async operation (handover, sequence) captures
// the context generation at start; its completion event echoes that number, and a guard rejects
// the event if the machine has since moved on (generation bumped by an interrupting transition).

export function nextGeneration(current: number): number {
  return current + 1;
}

export function isStaleGeneration(contextGeneration: number, eventGeneration: number): boolean {
  return eventGeneration !== contextGeneration;
}
