# Quickstart & Validation Guide: YII 2026 Interactive LED Experience

**Branch**: `001-yii-led-experience` | **Plan**: [plan.md](./plan.md)

Runnable scenarios proving the feature end-to-end. Contracts referenced, not duplicated:
[semantic-input](./contracts/semantic-input.md), [content-package](./contracts/content-package.md),
[operator-diagnostics](./contracts/operator-diagnostics.md),
[analytics-events](./contracts/analytics-events.md), [llm-drafting](./contracts/llm-drafting.md).

## Prerequisites

- Node.js 22 LTS, pnpm ≥ 9, Chromium-based browser.
- Cesium ion access token + Google Photorealistic 3D Tiles asset id (kiosk/dev env config:
  `ION_ACCESS_TOKEN`, `ION_GOOGLE_TILES_ASSET_ID`) — see research R4. Never committed.
- For pipeline scenarios: one LLM provider key (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY` or
  `GOOGLE_API_KEY`) *or* a GitHub Copilot session for the agent driver; optional
  `CLICKUP_API_TOKEN`.

## Setup

```bash
pnpm install
pnpm -r build                      # packages → apps
pnpm --filter content-pipeline seed:sample   # generates a valid sample release (12 categories × 3 projects, staging channel)
pnpm --filter experience dev                 # serves app + kiosk sidecar (static, ws transport, telemetry sink)
```

Expected: browser opens full-screen stage, `boot → idle` with the cinematic globe and all sample
markers; no menus/instructions visible; console shows zero public-facing errors.

## Scenario 1 — Category → preview → wheel navigation (US1 / SC-001)

1. Open the hidden simulator (concealed activation sequence — dev default documented in
   `tools/kiosk/README`, never on-screen).
2. Emit `category.select`; verify route-through-idle, marker filtering to 3, first project
   auto-previewed with name/organisation/country.
3. Emit `preview.hover next/prev` repeatedly, including a rapid burst: globe retargets smoothly,
   never queues destinations; final previewed project matches last signal.

Automated: `pnpm --filter experience test:e2e -- --grep "US1"`.

## Scenario 2 — Confirm → concealed handover → landing (US2 / SC-003)

1. From preview, emit `project.select`.
2. Verify: atmospheric cover moment, no black frames, no visible tile loading, arrival at the
   project's approved landing framing (Google 3D Tiles or declared fallback tier), metadata only,
   no narration.
3. Mid-transition, emit `category.select`: transition cancels safely, new category previews.

Automated: `test:e2e -- --grep "US2"`; frame captures asserted non-black through handover.

## Scenario 3 — Content playback, hold, replay, switch (US3 / SC-004, SC-005)

1. At landing, emit `content.select {position: 1}`: sequence + voiceover start together.
2. Let it finish: final frame holds indefinitely.
3. Re-press within 1 s (burst): filtered, no restart. Re-press after 1 s: full replay from
   opening state (visuals, camera, media position, voiceover).
4. Press a different active position: clean switch. Press an inactive position: safely ignored.

Automated: `test:e2e -- --grep "US3"` + input-boundary unit tests (`test:unit -- input`).

## Scenario 4 — Interruption matrix & priorities (US4 / QR-001)

```bash
pnpm --filter experience test:state        # @xstate/graph legality + full interruption matrix
pnpm --filter experience test:e2e -- --grep "US4"
```

Expected: every state × {reset, idle, category, back} lands in the contracted destination with
idempotent cleanup; hours-idle check confirms no inactivity reset exists.

## Scenario 5 — Operator, diagnostics, failure & recovery (US5 / SC-006, SC-009)

1. Open the operator overlay; verify the full QR-008 diagnostics field set live-updates.
2. Simulate disconnect/reconnect: presentation uncorrupted; status + last-message time correct.
3. `forceMediaFailure` on the playing video: in-composition fallback, no blanking, failure logged.
4. `rendererRecover cesium` mid-landing: recovery to a known visual state; public never sees
   technical output.
5. Operator `reset` from every major state: deep cleanup to idle.

Automated: `test:e2e -- --grep "US5"`.

## Scenario 6 — Offline-critical run (SC-007)

1. Publish the sample release, then disconnect public internet (or block non-local hosts in the
   sidecar proxy config).
2. Drive idle → category → preview → confirm → every content option → back → idle.

Expected: all critical journeys complete from local content; Cesium stage degrades to the
project's declared fallback tier without blanking; degradation visible in diagnostics only.

## Scenario 7 — Pipeline: ingest → draft → review → validate → publish (US6, US7 / SC-011, SC-012)

```bash
pnpm --filter content-pipeline ingest -- --source clickup --list <listId>   # or --source folder ./samples/submission-01
pnpm --filter content-pipeline analyze -- --project p-001 --driver copilot-agent # default: draft in the GitHub Copilot workspace agent, then ingest-drafts p-001
# `--driver api-llm` remains the optional API-provider fallback.
pnpm --filter content-pipeline review -- --project p-001                    # approve/reject/edit via review CLI/UI
pnpm --filter content-pipeline validate -- --root <candidateRoot> --version <semver> # FR-036 rule set
pnpm --filter content-pipeline publish -- --root <contentRoot> --candidate-root <candidateRoot> --version <semver> --channel staging
pnpm --filter content-pipeline promote -- --root <contentRoot> --version <semver>
pnpm --filter content-pipeline rollback -- --root <contentRoot> --channel staging # returns to prior release
pnpm --filter content-pipeline freeze -- --root <contentRoot>                     # production write refused afterwards
```

Expected: drafts carry source-passage links and `producedBy` provenance; unapproved items can
never be published (validation blocks); deliberately broken fixtures (missing Overview, missing
voiceover, > 5 options, broken refs, unverified metrics) each fail with a specific report line;
rollback and freeze behave per the content-package contract.

## Scenario 8 — Performance & endurance (SC-002, SC-008)

```bash
pnpm --filter experience test:perf        # 250 ms first-response sampling per action class
pnpm --filter experience test:endurance   # scripted full-event-day soak (accelerated + full modes)
```

Expected: all sampled responses ≤ 250 ms on the measurement machine (release-blocking numbers are
re-measured on event hardware per research R14); soak shows stable heap, stable frame pacing,
stable listener/ticker counts. Reports land in `apps/experience/tests/endurance/reports/`.

## Release validation checklist (event build)

Run Scenarios 1–8 on the event playback PC at native LED resolution with the production release +
production ion token, plus: 36-project release checklist (SC-011), legibility review at viewing
distance (QR-006), startup/reset/recover/reconnect each under 2 minutes by an operator using only
`tools/kiosk/runbook.md` (SC-009), and a full pass with zero public-facing technical output
(SC-010).
