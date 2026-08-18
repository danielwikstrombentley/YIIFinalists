#!/usr/bin/env bash
set -Eeuo pipefail

# Production/event launch entrypoint. The watchdog owns Chromium; this script owns the sidecar
# and the two long-lived helper processes. Chromium arguments are assembled in watchdog.ts and
# are never passed through a shell string.

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
KIOSK_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd -- "$KIOSK_ROOT/../.." && pwd)"
cd "$REPO_ROOT"

: "${KIOSK_PORT:=4174}"
: "${KIOSK_WATCHDOG_PORT:=4175}"
: "${KIOSK_URL:=http://127.0.0.1:${KIOSK_PORT}/}"
: "${KIOSK_LOG_DIR:=$KIOSK_ROOT/logs}"
: "${KIOSK_STATIC_ROOT:=$REPO_ROOT/apps/experience/dist}"
: "${KIOSK_CONTENT_ROOT:=$REPO_ROOT/apps/content-pipeline/assets/sample}"
export KIOSK_PORT KIOSK_WATCHDOG_PORT KIOSK_URL KIOSK_LOG_DIR KIOSK_STATIC_ROOT KIOSK_CONTENT_ROOT

if [[ ! -f "$KIOSK_STATIC_ROOT/index.html" ]]; then
  printf 'Kiosk app is not built: %s/index.html\n' "$KIOSK_STATIC_ROOT" >&2
  printf 'Build the experience first, then run this launcher again.\n' >&2
  exit 1
fi
if [[ ! -d "$KIOSK_CONTENT_ROOT" ]]; then
  printf 'Kiosk content root does not exist: %s\n' "$KIOSK_CONTENT_ROOT" >&2
  exit 1
fi

mkdir -p "$KIOSK_LOG_DIR"
sidecar_pid=''
watchdog_pid=''

stop_processes() {
  local exit_code=$?
  trap - EXIT INT TERM
  if [[ -n "$watchdog_pid" ]] && kill -0 "$watchdog_pid" 2>/dev/null; then
    kill -TERM "$watchdog_pid" 2>/dev/null || true
  fi
  if [[ -n "$sidecar_pid" ]] && kill -0 "$sidecar_pid" 2>/dev/null; then
    kill -TERM "$sidecar_pid" 2>/dev/null || true
  fi
  [[ -z "$watchdog_pid" ]] || wait "$watchdog_pid" 2>/dev/null || true
  [[ -z "$sidecar_pid" ]] || wait "$sidecar_pid" 2>/dev/null || true
  exit "$exit_code"
}
trap stop_processes EXIT INT TERM

pnpm --filter kiosk dev >"$KIOSK_LOG_DIR/sidecar.log" 2>&1 &
sidecar_pid=$!

printf 'Waiting for kiosk sidecar on %s\n' "$KIOSK_URL"
for _ in {1..30}; do
  if ! kill -0 "$sidecar_pid" 2>/dev/null; then
    printf 'Kiosk sidecar exited; see %s/sidecar.log\n' "$KIOSK_LOG_DIR" >&2
    exit 1
  fi
  if curl --fail --silent --show-error --max-time 1 "$KIOSK_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! curl --fail --silent --show-error --max-time 1 "$KIOSK_URL" >/dev/null 2>&1; then
  printf 'Kiosk sidecar did not become ready; see %s/sidecar.log\n' "$KIOSK_LOG_DIR" >&2
  exit 1
fi

pnpm --filter kiosk watchdog >"$KIOSK_LOG_DIR/watchdog.log" 2>&1 &
watchdog_pid=$!
printf 'Kiosk sidecar and Chromium watchdog are running.\n'

while kill -0 "$sidecar_pid" 2>/dev/null && kill -0 "$watchdog_pid" 2>/dev/null; do
  sleep 1
done

printf 'A kiosk service stopped; shutting down the remaining kiosk processes.\n' >&2
exit 1