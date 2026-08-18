import type { ParsedOperatorCommand, RecoveryRenderer } from '../operator/commands.js';

export interface RecoveryRuntimeTargets {
  globe?: { rebuild?: () => void | Promise<void> } | null;
  cesium?: {
    rebuild?: () => void | Promise<void>;
    reset?: () => void;
    clearPreloadCache?: () => void;
  } | null;
  content?: {
    cancel?: () => void;
    forceMediaFailure?: () => boolean;
  } | null;
  clearPreloadCache?: () => void;
  /** Fire-and-forget message to the local watchdog; it must never block the public path. */
  requestReload?: () => void;
}

export interface RecoveryResult {
  readonly status: 'completed' | 'requested' | 'rejected' | 'fallback';
  readonly rung: 'media-recovery' | 'renderer-recovery' | 'cache-clear' | 'reload' | 'none';
}

function safely(callback: (() => void) | undefined): void {
  try {
    callback?.();
  } catch {
    // Recovery is deliberately re-runnable. A partially torn-down adapter must not prevent the
    // machine from reaching its safe idle fallback on a later rung.
  }
}

function clearPreloadCaches(runtime: RecoveryRuntimeTargets): void {
  safely(() => runtime.clearPreloadCache?.());
  if (runtime.cesium?.clearPreloadCache !== runtime.clearPreloadCache) {
    safely(() => runtime.cesium?.clearPreloadCache?.());
  }
}

async function rebuild(
  runtime: RecoveryRuntimeTargets,
  renderer: RecoveryRenderer,
): Promise<RecoveryResult> {
  const target = renderer === 'globe' ? runtime.globe : runtime.cesium;
  if (!target?.rebuild) return { status: 'fallback', rung: 'renderer-recovery' };
  try {
    await target.rebuild();
    return { status: 'completed', rung: 'renderer-recovery' };
  } catch {
    return { status: 'fallback', rung: 'renderer-recovery' };
  }
}

/** Performs a single validated operator command without sending a navigation event itself. */
export async function executeRecoveryCommand(
  runtime: RecoveryRuntimeTargets,
  command: ParsedOperatorCommand | null,
): Promise<RecoveryResult> {
  if (!command) return { status: 'rejected', rung: 'none' };

  if (command.kind === 'forceMediaFailure') {
    safely(() => runtime.content?.forceMediaFailure?.());
    return { status: 'completed', rung: 'media-recovery' };
  }
  if (command.kind === 'rendererRecover') return rebuild(runtime, command.renderer);
  if (command.kind === 'clearPreloadCache') {
    clearPreloadCaches(runtime);
    return { status: 'completed', rung: 'cache-clear' };
  }
  if (command.kind === 'reloadApp') {
    // Do not await a local HTTP round-trip: watchdog communication must never delay interaction,
    // rendering, reset, or fallback. The watchdog owns its own eventual acknowledgement/logging.
    safely(() => runtime.requestReload?.());
    return { status: 'requested', rung: 'reload' };
  }

  // `setLogLevel` / `exportDiagnostics` remain local support commands. They have no navigation
  // authority and intentionally do nothing until an operator log/export sink is configured.
  return { status: 'completed', rung: 'none' };
}

/**
 * Rung 1: idempotent deep cleanup. Public state is reset by the machine separately; this helper
 * only releases runtime-owned work so it is equally safe from playback, handover, or a failure.
 */
export function deepResetRuntime(runtime: RecoveryRuntimeTargets): void {
  safely(() => runtime.content?.cancel?.());
  clearPreloadCaches(runtime);
  safely(() => runtime.cesium?.reset?.());
}
