import type { OperatorCommandPayload } from '@yii/semantic-actions';

export type RecoveryRenderer = 'globe' | 'cesium';

export type ParsedOperatorCommand =
  | { readonly kind: 'forceMediaFailure' }
  | { readonly kind: 'rendererRecover'; readonly renderer: RecoveryRenderer }
  | { readonly kind: 'reloadApp' }
  | { readonly kind: 'clearPreloadCache' }
  | { readonly kind: 'setLogLevel'; readonly level: 'debug' | 'info' | 'warn' | 'error' }
  | { readonly kind: 'exportDiagnostics' };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Validates the finite local recovery command vocabulary. A command can never carry an arbitrary
 * URL, local path, credential, or eval-style instruction; unknown values return `null` and are
 * intentionally inert at the machine boundary.
 */
export function parseOperatorCommand(
  payload: OperatorCommandPayload | unknown,
): ParsedOperatorCommand | null {
  const commandPayload = record(payload);
  const command = commandPayload?.command;
  if (typeof command !== 'string') return null;

  if (command === 'forceMediaFailure') return { kind: 'forceMediaFailure' };
  if (command === 'reloadApp') return { kind: 'reloadApp' };
  if (command === 'clearPreloadCache') return { kind: 'clearPreloadCache' };
  if (command === 'exportDiagnostics') return { kind: 'exportDiagnostics' };
  if (command === 'rendererRecover') {
    const renderer = record(commandPayload?.params)?.renderer;
    return renderer === 'globe' || renderer === 'cesium'
      ? { kind: 'rendererRecover', renderer }
      : null;
  }
  if (command === 'setLogLevel') {
    const level = record(commandPayload?.params)?.level;
    return level === 'debug' || level === 'info' || level === 'warn' || level === 'error'
      ? { kind: 'setLogLevel', level }
      : null;
  }
  return null;
}
