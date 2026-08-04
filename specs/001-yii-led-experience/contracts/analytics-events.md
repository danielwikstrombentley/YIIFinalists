# Contract: Analytics & Interaction Events

**Boundary**: runtime `TelemetryLogger` (producer, fire-and-forget) → kiosk sidecar HTTP sink →
append-only local JSONL (one file per day). Telemetry MUST never block or fail navigation,
rendering, media, reset, or recovery (Principle IV; FR-038) — send is non-awaited, buffered,
drop-oldest on overflow.

## Event envelope (JSONL, one object per line)

```json
{
  "v": 1,
  "ts": "2026-10-14T09:30:12.345Z",
  "sessionId": "boot-uuid",
  "seq": 4211,
  "kind": "content",
  "stateBefore": "projectLanding",
  "stateAfter": "contentPlaying",
  "refs": { "categoryId": "roads", "projectId": "p-017", "position": 2 },
  "latencyMs": 87,
  "detail": {}
}
```

## Event kinds (FR-038 minimum set)

| kind | Emitted when | Notable fields |
|---|---|---|
| `start` | app boot complete, idle entered | app version, release version, contentHash |
| `reset` | operator reset executed | initiator |
| `connect` / `disconnect` | console transport liveness change | transportId |
| `category` | category activated (incl. re-entry) | categoryId, reentry: bool |
| `preview` | preview changed | projectId, direction |
| `select` | project confirmed | projectId |
| `content` | content option started | position, optionTitleId |
| `replay` | deliberate replay honoured | position |
| `interrupt` | higher-priority action cancelled activity | cancelledKind, byAction |
| `return` | back or idle navigation | target |
| `mediaFailure` / `assetFailure` / `rendererFailure` | failure with fallback applied | assetId/renderer, fallbackTier |
| `recovery` | recovery action completed | ladder rung, durationMs |

`latencyMs` = action receipt → first visible response, sampled for SC-002 evidence.

## Sink behaviour

- `POST /telemetry` accepts batched arrays; sidecar appends to `logs/telemetry-YYYY-MM-DD.jsonl`.
- Sink unavailable ⇒ client buffers (ring, 5k events) and retries with backoff; overflow drops
  oldest silently; a `telemetryDropped` counter is visible in operator diagnostics only.
- No PII is collected: sessions are boot-scoped UUIDs; there are no user identifiers (single
  anonymous public console).
- Retention/export policy for post-event analysis is an operations decision (research R15);
  files are plain JSONL for arbitrary later import.
