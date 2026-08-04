# Contract: Operator Diagnostics & Recovery Interface

**Boundary**: runtime internals → `DiagnosticsStore` (read model) → hidden operator overlay.
Operator commands flow back through the semantic input boundary at operator priority — the
overlay has no privileged side channel into the state machine (Principle IX).

## Activation

- Concealed input sequence only (per spec clarification): a defined multi-press combination /
  ordered sequence evaluated inside the input boundary; rate-limited; no credential.
- Never hinted, rendered, or discoverable on the public surface (SC-010). Overlay renders in a
  separate DOM layer above the public stage; closing it restores untouched public presentation.
- The exact sequence is configuration (kiosk config), not code, so it can change per event.

## DiagnosticsSnapshot (read model — QR-008 complete field set)

| Group | Fields |
|---|---|
| State | machine state path; active category; previewed project; selected project; active content position; sequence progress (beat, %, elapsed) |
| Media | voiceover status (playing/stopped, position, asset); video status (playing/paused/error, asset) |
| Console | connection status per transport; last message time; last interpreted semantic action; dedup drops count |
| Renderers | globe status; cesium stage status (tileset ready/tier); handover state; last handover duration |
| Performance | current fps; frame-time p95; JS heap trend; ticker callback count |
| Assets | recent asset failures ring buffer (asset id, error, fallback applied); active release version + contentHash |
| Errors | last runtime errors (operator-visible only, never public) |

Snapshot updates are push-based (store subscription) and read-only; rendering the overlay MUST
NOT alter experience state or timing-sensitive rendering (verified in performance tests).

## Operator commands (via semantic input, `operator.command`)

| Command | Effect | Maps to |
|---|---|---|
| `reset` | emergency reset: cancel everything, deep cleanup, route to idle | `operator.reset` action (priority 7) |
| `simulate <action>` | inject any public semantic action or failure scenario | simulator transport (SC-006) |
| `forceMediaFailure <assetId>` | test fallback path | failure injection |
| `rendererRecover <globe\|cesium>` | rebuild adapter in place | recovery ladder rung 2 (research R12) |
| `reloadApp` | request watchdog-managed reload | ladder rung 3 |
| `clearPreloadCache` | drop preload/decode caches | resource control |
| `setLogLevel`, `exportDiagnostics` | support/debug aids | local-only output |

Rules: commands are validated like all untrusted input; unknown commands are rejected safely;
every command and its outcome is logged to telemetry; no command exposes credentials, arbitrary
file paths, or arbitrary URLs.
