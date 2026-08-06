# Code Review — T081: Local Tiles Configuration (task/001-T081-local-tiles-config → main)

**Reviewer**: Claude Haiku 4.5 (Anthropic) · **Implementer**: GPT-5.6 Terra (OpenAI)
**Provider independence**: PASS
**Scope**: T081 only · **Files reviewed**: 14 · **Round**: 1 · **Date**: 2026-08-06

## Verdict: REQUEST CHANGES

The implementation correctly addresses most of the T081 requirements: `.env.local` loading, tile-tier opt-in, shell-variable precedence, secret safety, and configuration validation. However, a **CRITICAL regression** in the E2E test suite must be resolved before merge. The async wait for kiosk config in `createCesiumPresentation` breaks the US2 scenario 1 handover test (first frame too dark), which passes on main. This timing-sensitive change requires either a different architectural approach or careful validation that the race condition it's designed to prevent is actually covered by state-machine guards.

## Findings

| # | Severity | File:Line | Issue | Suggested fix |
|---|----------|-----------|-------|---------------|
| 1 | CRITICAL | apps/experience/src/app/cesium-presentation.ts:71–80 | Async wait for kiosk config in `createCesiumPresentation` breaks US2 scenario 1 E2E test (frame 1 litPixelRatio 0.0015 < 0.005). Test passes on main; fails on T081. The await during presenter initialization delays Cesium scene readiness and causes the handover's first captured frame to be too dark. Requirement #4 ("Cesium readiness waits for runtime config so early valid confirmation does not race to fallback") is interpreted as delaying the presentation object itself, but this introduces a render-timing race with the handover choreography. | Do NOT await `configureFromKiosk()` in `createCesiumPresentation()`. Instead, keep the presentation sync and let the config fetch proceed in the background. The state machine's `cesiumReady` promise should resolve when config has arrived (or timed out), not when the presentation is created. Move the "wait for config before scene ready" guard to the machine action that invokes handover (e.g., before `startForwardHandover()` awaits cesium availability). Verify that this closes the race where an early `project.select` could pick a fallback tier before config arrives. |
| 2 | MAJOR | apps/experience/src/app/StageMount.tsx:50–62 | The async/await pattern for presentation creation is necessary to handle disposal correctly, but it compounds the timing issue in F1. The check `if (disposed)` after await is appropriate for cleanup, but the underlying timing problem must be fixed in cesium-presentation.ts first. | Fix finding #1; this change is then acceptable. |
| 3 | MINOR | apps/experience/tests/e2e/us2-confirm-handover.spec.ts:62–66 | New check for `data-preview-motion='settled'` waits for globe motion but not for Cesium readiness. This is a partial mitigation but insufficient to cover the async wait delay. | After fixing #1, re-run E2E suite to confirm all 12 tests pass. If flakiness persists, add an explicit wait for cesium readiness (e.g., via a `data-cesium-ready` attribute or a helper that polls for it). |

## Constitution Check

| Principle/Gate | Status | Note |
|---|---|---|
| Untrusted input (IX) | PASS | `parseSampleTileTier()` validates enum membership and rejects non-string values cleanly. `isPositiveIonAssetId()` rejects non-numeric and non-positive values. |
| No secrets in bundle | PASS | `.env.example` contains only placeholder values (empty strings). `ION_ACCESS_TOKEN` and `ION_GOOGLE_TILES_ASSET_ID` are never embedded in JavaScript; they flow only through Node/kiosk config at development time. |
| No secrets logged/printed | PASS | `getKioskCesiumConfigurationWarning()` reports diagnostic text without including the configured token or asset ID values (e.g., "ION_ACCESS_TOKEN is missing" not "ION_ACCESS_TOKEN=xyz"). |
| Single state owner (I) | PASS | Cesium config is owned by the kiosk sidecar and passed via `/runtime-config.json`. Experience app does not initiate or mutate config state. |
| Fallback tier retained on config failure | PASS | `configureFromKiosk()` silently returns on fetch failure or invalid config; `CesiumStageAdapter` defaults to approved fallback tiers. |
| Shell precedence over `.env.local` | PASS | `process.loadEnvFile()` (Node 20.10+) only sets values not already in `process.env`. Tests validate this behavior. |

## Task Acceptance Checklist

- [x] Sample generator accepts `photorealistic` and rejects invalid tiers (test in seed.test.ts ✓)
- [x] Kiosk local-env loader preserves shell precedence (test in config.test.ts ✓)
- [x] E2E fixture seed explicitly remains `safe-composition` (playwright.config.ts hardcoded ✓)
- [ ] ❌ After filling `.env.local` with credentials + `YII_SAMPLE_TILE_TIER=photorealistic`, handover transitions stream tiles with visible lit frames — **FAILS** (E2E US2 scenario 1 broken)
- [x] Absent/invalid credentials retain approved fallback without secrets logged ✓
- [x] `.env.example` tracked and documented ✓
- [x] Kiosk README updated with local photorealistic setup instructions ✓

## Local Verification (on main branch)

```
✓ pnpm run verify — 182 unit tests/4 skipped, typecheck/lint/format/build all pass
✓ pnpm --filter experience run test:e2e — 12/12 pass
```

## Local Verification (on task/001-T081-local-tiles-config branch)

```
✓ pnpm run verify — 182 unit tests/4 skipped, typecheck/lint/format/build all pass
✗ pnpm --filter experience run test:e2e — 11/12 pass
  ✗ US2 scenario 1: confirm samples no black or stale frames — Frame 1 litPixelRatio 0.0015 < 0.005
```

## Required Before Merge

1. **CRITICAL**: Fix the async timing regression in `createCesiumPresentation()` by not awaiting `configureFromKiosk()` until after the presentation is returned to the caller. Move the "wait for config" guard to the state machine action (e.g., before handover initiation) to close the race without breaking render timing.
2. Re-run `pnpm --filter experience run test:e2e` and confirm all 12 tests pass, including US2 scenario 1.
3. Local `pnpm run verify` continues passing after the fix.

## Notes

- PR #11 status: branch is marked `[R]` in tasks.md. Upon merge, update the task to `[x]` and record the review model / verdict in the phase PH4 header if not already done.
- Files match the task's **Files** expectation (14 files changed, no unexpected out-of-scope modifications).
- Test coverage for CLI, config loading, and sample generation is present and meaningful (not implementation trivia). The E2E failure indicates genuine runtime behavior that the test suite correctly catches.
- No credentials, API keys, or sensitive asset IDs are visible in the diff or committed files.
