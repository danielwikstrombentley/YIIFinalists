# Contract: Semantic Console Input

**Boundary**: transport adapters → input boundary → experience state machine.
Transport-specific messages MUST terminate at the adapter; everything below this line is
transport-independent (Principle III). Runtime types live in `packages/semantic-actions`.

## Action set

| Action | Payload | Priority | Public? |
|---|---|---|---|
| `category.select` | `{ categoryId }` | 5 | yes |
| `preview.hover` | `{ direction: next \| prev }` or `{ projectId }` | 1 (lowest) | yes |
| `project.select` | `{}` (confirms current preview) | 3 | yes |
| `content.select` | `{ position: 1..5 }` | 2 | yes |
| `nav.back` | `{}` | 4 | yes |
| `nav.idle` | `{}` | 6 | yes |
| `operator.reset` | `{}` | 7 (highest) | **no — operator only** |
| `operator.command` | `{ command, params }` | 7 | no |
| `connection.status` | `{ connected, transportId }` | n/a (diagnostics only) | no |

Higher priority pre-empts lower during any transition or sequence (FR-019). `connection.status`
never reaches the state machine; it feeds the DiagnosticsStore only.

## Wire format (dev WebSocket transport; other transports map to the same object)

```json
{
  "v": 1,
  "type": "content.select",
  "payload": { "position": 2 },
  "source": "console",
  "msgId": "optional-transport-id",
  "sentAt": "2026-08-03T12:00:00.000Z"
}
```

## Boundary rules (all enforced before the state machine sees anything)

1. **Validation**: schema-check the envelope; verify payload refs against the active release
   (unknown category/project/position ⇒ reject, log, no public effect). Untrusted input per QR-008.
2. **Deduplication**: identical `(type, payload)` within **1000 ms** of the previously *accepted*
   identical action is dropped (FR-020). After 1000 ms an identical action is deliberate:
   `content.select` on the active position ⇒ replay; `category.select` on the active category ⇒
   category re-entry.
3. **Priority gate**: when an action arrives while a lower-or-equal-priority activity holds an
   exclusive window (e.g. very short transition sections), only lower-priority actions may be
   rejected; higher-priority actions always pass (spec Edge Cases).
4. **Ordering**: actions are processed in arrival order per source; a newer `preview.hover`
   supersedes an unprocessed older one (retarget, never queue).
5. **Operator gating**: `operator.*` actions are accepted only from the simulator/operator source
   after concealed activation; a visitor transport can never emit them (FR-018).
6. **Connection monitoring**: each transport reports liveness; loss ⇒ diagnostics only, never a
   state change; reconnect resumes input handling with dedup state reset.

## Simulator obligation

The hidden simulator MUST emit every action above through this same contract, plus failure
injections: duplicate bursts (< 1 s), deliberate repeats (> 1 s), invalid ids, unknown types,
rapid hover streams, disconnect/reconnect, and interruption timing targeted at transition
midpoints (SC-006).
