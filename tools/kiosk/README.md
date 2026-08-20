# Kiosk sidecar

Local sidecar for the YII 2026 experience: serves the built app + active content release,
bridges a dev WebSocket input relay, and appends telemetry to local JSONL files. See
[research.md R12](../../specs/001-yii-led-experience/research.md) and
[contracts/analytics-events.md](../../specs/001-yii-led-experience/contracts/analytics-events.md).

## Dev usage

From the repo root:

```bash
pnpm --filter content-pipeline seed:sample   # generate a sample content release (once, or after changes)
pnpm --filter experience dev                 # runs this sidecar + Vite together
```

### Local Google Photorealistic 3D Tiles

The default sample release deliberately uses the offline-safe `safe-composition` tier, so a
token alone does not cause network tiles to load. For a persistent local photorealistic demo:

```bash
cp .env.example .env.local                    # once; .env.local is ignored by git
# Edit .env.local with the long Cesium ion token and the positive numeric ion asset ID.
pnpm --filter content-pipeline seed:sample    # regenerates sample projects as configured
pnpm --filter experience dev                  # kiosk loads root .env.local automatically
```

Set `YII_SAMPLE_TILE_TIER=photorealistic` in `.env.local` to opt the generated sample projects
into streamed tiles. `ION_GOOGLE_TILES_ASSET_ID` is the **numeric Cesium ion asset ID**, not a
token; `ION_ACCESS_TOKEN` is the long credential string. Shell-exported values take precedence
over `.env.local`. Regenerate the sample after changing the tier, then restart the dev server.

For a one-off profile without editing `.env.local`:

```bash
pnpm --filter content-pipeline seed:sample -- --tile-tier photorealistic
```

When credentials are absent, invalid, unavailable, or a project is intentionally configured for
another tier, the stage retains the approved local/safe fallback instead of showing a blank frame.

`pnpm --filter experience dev` starts both the kiosk sidecar (this package) and Vite concurrently.
Vite's dev server proxies `/content`, `/telemetry`, and `/ws` to the sidecar (see
`apps/experience/vite.config.ts`) so app code always uses the same relative paths in dev and
production. To run only the sidecar (e.g. to serve a production build):

```bash
pnpm --filter experience build   # produces apps/experience/dist
pnpm --filter kiosk dev          # serves dist/ + content + ws + telemetry on one port
```

For an event-style production launch, build the experience and use the supervised launcher. It
starts the sidecar, starts the watchdog, and lets the watchdog launch Chromium:

```bash
pnpm --filter experience build
./tools/kiosk/launch/start.sh
```

The launcher uses `KIOSK_PORT=4174` for the sidecar and `KIOSK_WATCHDOG_PORT=4175` for the
loopback-only watchdog control endpoint. Set `KIOSK_CHROMIUM` when the browser executable is not
on the expected platform path, and set `KIOSK_URL` only when the served kiosk URL is intentionally
different. The watchdog passes `--kiosk`, `--autoplay-policy=no-user-gesture-required`,
`--disable-session-crashed-bubble`, `--noerrdialogs`, and the documented event-hardware GPU
placeholders as argument-array entries (not a shell command).

OS login templates are in [launch/autostart.md](launch/autostart.md); the operator recovery guide
is [runbook.md](runbook.md).

## Configuration (environment variables)

All configuration is env-based (never committed — see `.gitignore`'s `.env` rule):

| Variable | Default | Purpose |
|---|---|---|
| `KIOSK_PORT` | `4174` | HTTP/WS port |
| `KIOSK_STATIC_ROOT` | `apps/experience/dist` | Built app to serve at `/` |
| `KIOSK_CONTENT_ROOT` | `apps/content-pipeline/assets/sample` | Active content release tree, served at `/content` |
| `KIOSK_CONTENT_CHANNEL` | `staging` | Local release channel resolved by the runtime; use `production` only for the event build |
| `KIOSK_LOG_DIR` | `tools/kiosk/logs` | Telemetry JSONL output directory (gitignored) |
| `KIOSK_WATCHDOG_PORT` | — (sidecar reload is inert) | Loopback port of the separate watchdog process |
| `YII_OPERATOR_ACTIVATION_SOURCES` | `operator` | Comma-separated dedicated local sources allowed to evaluate the concealed gesture; leave at the safe default unless event hardware requires another source |
| `KIOSK_CHROMIUM` | platform default | Chromium/Chrome executable used by the watchdog |
| `KIOSK_URL` | `http://127.0.0.1:4174/` | URL opened by Chromium |
| `ION_ACCESS_TOKEN` | — | Cesium ion access token (research.md R4), passed through to kiosk config only |
| `ION_GOOGLE_TILES_ASSET_ID` | — | Positive numeric Cesium ion asset ID for Google Photorealistic 3D Tiles |
| `YII_SAMPLE_TILE_TIER` | `safe-composition` | Sample release tier: `photorealistic`, `local-fallback-scene`, or `safe-composition` |

## Endpoints

- `GET /` — the built app (SPA fallback to `index.html` for unknown paths).
- `GET /content/*` — the active content release tree, resolved package-relative (path traversal
  outside `KIOSK_CONTENT_ROOT` is rejected).
- `POST /telemetry` — accepts a JSON array of telemetry events
  ([contract](../../specs/001-yii-led-experience/contracts/analytics-events.md)); malformed
  entries are dropped individually and reported in the response body — this endpoint never
  returns a 5xx for bad input, so a broken client can never affect the public runtime
  (Principle IV).
- `ws://.../ws` — a plain broadcast relay: any connected client's message is relayed to every
  other connected client. Zero navigation logic — the app's `WebSocketTransport` and an external
  dev/console tool both connect here.
- `POST /watchdog/reload` — validates a bounded local request and signals the separate watchdog's
  loopback control endpoint. It returns a handled response when the watchdog is absent; it never
  reloads the sidecar or returns a 5xx just because the watchdog is not running.

## Recovery ladder (research.md R12)

Operator-facing startup/recovery procedures (soft reset → media/renderer recovery → reload → full
restart → console reconnect) are documented in [runbook.md](runbook.md). The sidecar remains
independent of the app's state and keeps serving static content/telemetry while the watchdog
replaces the browser.

## Staging preview without the physical console (FR-035)

Use this procedure **before approving** editorial content. It intentionally keeps the public
runtime on the locally served `staging` channel and drives every journey through the same hidden
`SimulatorTransport` path as the physical console; it never adds public UI controls.

1. Build or publish the approved candidate to the local content root's `staging` channel. Leave
  `KIOSK_CONTENT_CHANNEL` unset (it defaults to `staging`) and set `KIOSK_CONTENT_ROOT` to that
  root. Do not point this procedure at `production`.
2. Start the development stack with the content root selected, then open the stage. Wait for the
  globe idle state; record the release version and content hash from the hidden operator overlay.
3. Open the hidden operator overlay using the configured concealed activation sequence. Use its
  simulator controls only — never send events directly to the browser actor.
4. For **each category**: select it, confirm its first finalist previews with correct metadata,
  move through all three finalists, and verify a rapid preview burst ends on the last selected
  project without queued motion.
5. For **each finalist**: confirm the project; inspect the globe→geographic transition and
  landing metadata; then select each active content position. Verify local voiceover starts with
  the sequence, media/fallbacks are correct, and the declared final frame remains held.
6. For **every active option**: deliberately replay it after the dedup window, then use back to
  return through the reverse handover. Test a category change while content is active and a
  return to idle. The public surface must show no technical text or menus at any point.
7. Record every checked category/project/position plus observed fallback, voiceover, final-frame,
  replay, back, and category-change outcomes in
  [preview-procedure-run.md](../../specs/001-yii-led-experience/evidence/preview-procedure-run.md).
  Any failure returns the item to editorial review; only a clean recorded run may proceed to
  approval/publish.

For a production rehearsal, set `KIOSK_CONTENT_CHANNEL=production` explicitly and repeat the
same checklist. This does not replace the required staging review run.
