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

## Configuration (environment variables)

All configuration is env-based (never committed — see `.gitignore`'s `.env` rule):

| Variable | Default | Purpose |
|---|---|---|
| `KIOSK_PORT` | `4174` | HTTP/WS port |
| `KIOSK_STATIC_ROOT` | `apps/experience/dist` | Built app to serve at `/` |
| `KIOSK_CONTENT_ROOT` | `apps/content-pipeline/assets/sample` | Active content release tree, served at `/content` |
| `KIOSK_LOG_DIR` | `tools/kiosk/logs` | Telemetry JSONL output directory (gitignored) |
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

## Recovery ladder (research.md R12)

Operator-facing startup/recovery runbook (soft reset → renderer recovery → reload → full
restart) lives in the hidden operator interface once built (PH7); this sidecar's only
responsibility in that ladder is staying up and serving static content/telemetry independent of
the app's own state.
