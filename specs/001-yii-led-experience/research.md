# Phase 0 Research: YII 2026 Interactive LED Experience

**Branch**: `001-yii-led-experience` | **Date**: 2026-08-03 | **Plan**: [plan.md](./plan.md)

All technical unknowns from the plan's Technical Context are resolved below. Each entry records
Decision / Rationale / Alternatives considered. Boundaries the constitution requires to stay
replaceable are listed at the end under Open Dependencies.

---

## R1 — General-Purpose Animation Engine: GSAP v3 (Architecture Decision)

**Decision**: GSAP v3 (≥ 3.13) is the single default general-purpose animation engine, installed
from public npm (`npm install gsap`), with `@gsap/react`'s `useGSAP()` hook for React lifecycle
integration. All GSAP usage is confined to the application-owned `SequenceOrchestrator` and
timeline factories; feature code never creates free-standing tweens.

This entry is the constitution-required architecture decision (Principle II) with all mandated
fields:

- **Alternatives considered**:
  - *Motion (Framer Motion / motion.dev)* — excellent React ergonomics, but component-prop-driven
    animation couples motion to React render cycles, which Principle VIII discourages for
    per-frame work, and complex nested-timeline choreography (multi-beat stories with
    voiceover sync, seek, and replay) is weaker than GSAP timelines.
  - *Anime.js v4* — small and capable, but lacks GSAP's timeline nesting depth, `Timeline.seek()`
    ecosystem maturity, ticker control API, and battle-tested long-session stability evidence.
  - *Web Animations API (native)* — no dependency, but no nested timelines, weak orchestration
    primitives, and per-property WAAPI objects make centralized cancellation/replay significantly
    harder to guarantee.
  - *Theatre.js* — strong sequencing editor, but heavier authoring model, smaller community, and
    unnecessary studio tooling for a data-driven runtime.
- **React integration**: `@gsap/react` `useGSAP()` provides scoped context with automatic cleanup
  on unmount (kills scoped tweens/timelines). The orchestrator additionally owns explicit
  `kill()` on state exit, so React unmount is a backstop, not the primary cleanup path. Per-frame
  values are written to renderer/DOM targets directly (GSAP `quickTo`/`quickSetter`), never via
  React state.
- **Supported targets**: DOM/CSS, SVG, and — critical here — arbitrary JS object properties, which
  is how GSAP drives Three.js globe parameters (rotation, sun position, cloud opacity, marker
  emphasis) and handover uniforms without renderer-specific plugins.
- **Cancellation semantics**: `timeline.kill()` (full stop + eligible for GC), `pause()`,
  `progress(0)`, and tween-level `kill()` are synchronous and idempotent — repeated kill calls are
  no-ops, satisfying the idempotent-cancellation rule. `onInterrupt` callbacks give deterministic
  interruption hooks that report to the state machine.
- **Cleanup behaviour**: killed timelines release references; `gsap.context()` collects everything
  created in scope for one-call revert; `revert()` restores pre-animation inline values, which is
  the mechanism behind "replay restores the complete opening state".
- **Media synchronization**: content sequences with narration use the voiceover audio clock as the
  authoritative timebase; the orchestrator samples `audio.currentTime` and corrects timeline drift
  via `timeline.seek(t, false)` when outside the per-template tolerance declared in the content
  package. Sequences without narration use the GSAP timeline clock. Video beats are slaved the
  same way (`video.currentTime` monitored, timeline seeks video-dependent beats).
- **Performance evidence**: GSAP's single-ticker RAF model avoids duplicate loops; `quickSetter`
  paths avoid per-frame object churn. Release validation re-measures on event hardware per plan
  QR-007; the endurance suite asserts no timeline/ticker accumulation across repeated
  play/replay/cancel cycles.
- **License**: as of GSAP 3.13 (Webflow acquisition), GSAP and all plugins are free for commercial
  use under the standard GSAP license (source-available, not OSI). No paid Club membership
  required. The license permits bundled distribution in this installation. Recorded as a
  dependency fact in the plan's Complexity Tracking preamble.
- **Version policy**: pin exact version in the lockfile; allow patch/minor upgrades only after the
  motion regression suite passes; never upgrade during content freeze.
- **Rollback strategy**: all GSAP calls live behind the `SequenceOrchestrator` and timeline
  factories (`orchestration/`). Rolling back to a previous GSAP version is a lockfile change;
  replacing the engine entirely means re-implementing the orchestrator interface
  (`play/pause/cancel/replay/reset/seek/onProgress/onComplete`), which no feature code bypasses.

**Rationale**: user-directed choice, and independently the strongest fit: deep nested timelines,
deterministic seek/replay, idempotent kill semantics, framework-agnostic targets covering DOM +
Three.js + handover uniforms, and a single controllable ticker — the exact properties Principle II
demands.

## R2 — Experience State Machine: XState v5

**Decision**: model the public experience as an XState v5 state machine (`state/` module) — the
sole authority for navigation state. States: `boot → idle → categoryActive.preview →
transitionToProject → projectLanding → contentPlaying → contentFinalHold` plus
`transitionToPreview` (reverse) and `recovering`. Semantic actions are machine events; guards
enforce legality; entry/exit actions start/cancel owned work via adapter handles; `invoke`d actors
wrap transitions and sequences so cancellation is structural.

**Rationale**: Principle I requires named states, validated events, legal transitions, guards, and
deterministic entry/exit. XState v5 gives this declaratively, plus `@xstate/graph` for exhaustive
path/legality testing of the interruption matrix (every state × every priority action), which is
the plan's primary state-gate evidence. Actors give each transition/sequence an owned lifetime, so
leaving a state structurally cancels its work.

**Alternatives considered**: hand-rolled reducer FSM (no model-based testing, easy to grow illegal
transitions); Redux + middleware (state ownership diffuses into middleware chains); Zustand
(store, not a state machine — no transition legality). XState's learning curve is accepted; the
machine is the core of the product.

## R3 — Custom Cinematic Globe: Three.js

**Decision**: build the idle/preview globe as a custom Three.js scene behind
`GlobeRendererAdapter`: high-resolution earth textures with day/night blending driven by a sun
uniform, animated cloud layer, atmospheric rim shader, 36 instanced markers with category
filtering and emphasis, and a camera rig whose preview movements are GSAP-driven parameter
animations (orbit angles, framing offsets) so retargeting is a tween retarget — never a queued
flight.

**Rationale**: the constitution fixes a custom non-Cesium globe for idle/preview. Three.js is the
de-facto WebGL scene library (MIT, huge ecosystem, custom-shader-friendly) and integrates cleanly
with GSAP object-property animation. Driving the camera by tweened rig parameters makes "cancel or
retarget smoothly without queuing obsolete destinations" (FR-006) a native property of the design.

**Alternatives considered**: react-three-fiber (adds a React reconciler between the machine and
the scene — per-frame React involvement conflicts with Principle VIII; plain Three.js in an
adapter keeps ownership explicit); Babylon.js (equally capable, heavier, no team advantage);
reusing Cesium for idle too (rejected by constitution; also poor fit for stylised cinematic
treatment); pre-rendered video loop for idle (rejected: markers/category filtering must be live).

## R4 — Geographic Stage: CesiumJS + Google Photorealistic 3D Tiles via Cesium ion Asset

**Decision**: `CesiumStageAdapter` owns a CesiumJS (≥ 1.124) viewer configured with `globe: false`
and default UI disabled. Google Photorealistic 3D Tiles load as a `Cesium3DTileset` from a Cesium
ion asset using a configurable **asset id + ion access token**
(`Cesium3DTileset.fromIonAssetId(assetId)` with `Ion.defaultAccessToken` set from kiosk-local
config; equivalent to `createGooglePhotorealistic3DTileset()` which targets the Google tiles ion
asset). Camera movement uses native `camera.flyTo` wrapped in a promise-based adapter exposing
`complete`/`cancel`; GSAP never writes the Cesium camera while a native flight is active.
Per-project `GeographicFraming` data selects destination, orientation, scale, and tile-treatment
(darken/soften/highlight overlays rendered as Cesium primitives/post-process, per FR-024).

**Availability assumptions & fallback (Principle IV)**: Google tiles are streamed and **may not be
cached offline** under Google Maps Platform terms — this is the documented external dependency.
Assumption: event-local network provides internet egress to Google/ion endpoints with monitored
health. Three approved fallback tiers per project: (1) full photorealistic tiles; (2) locally
hosted per-project fallback backdrop (pre-approved imagery/terrain scene or curated static
composition shipped in the content package); (3) safe project landing composition with no 3D
context. Tile-load failure or latency beyond threshold triggers tier degradation without blanking;
the operator sees the degradation event. Per-project tile suitability review remains an open
dependency (spec Open Decisions).

**Rationale**: user-directed (CesiumJS + Google 3D Tiles from an ion asset id/token). ion asset
indirection keeps credentials in kiosk config (never in the public bundle repo), lets staging and
production use separate tokens, and keeps the tile source swappable per project.

**Alternatives considered**: Google tiles direct from Google Maps Platform API key (equivalent
capability; ion chosen for account consolidation and the user's direction); Cesium World Terrain +
Bing/Sentinel imagery (usable as a fallback aesthetic, not photorealistic 3D); offline 3D Tiles of
project sites (kept as an option for tier-2 fallback assets where rights allow).

## R5 — Concealed Renderer Handover

**Decision**: both renderers draw into stacked full-screen canvases managed by
`HandoverController`. The concealed transition is a GSAP-choreographed sequence: (1) pre-warm —
Cesium stage loads the project's framing target off-screen until first meaningful tiles are
resolved (preloaded at preview time per FR-030); (2) approach — the Three.js globe zooms toward
the project point into an atmospheric/cloud treatment that fully covers the frame (opaque cover
moment); (3) swap — canvas z-order/opacity flips during full cover, Cesium already rendering; (4)
reveal — atmospheric treatment dissolves outward to the landing framing. Reverse handover mirrors
the same choreography. A watchdog enforces a maximum cover duration; if the Cesium stage misses
readiness, the transition exits to the R4 fallback tier instead of holding or blanking.
Interruption at any beat routes through the controller's cancel path (both renderers returned to
a known state, stale completions discarded via generation tokens).

**Rationale**: an opaque atmospheric cover moment is the only technique that guarantees "no black
frames, no visibly unloaded geographic content, no obvious renderer switch" (FR-008) while
swapping GL contexts, and it naturally preserves perceived direction. Readiness-gated swap plus a
watchdog gives the required failure destination.

**Alternatives considered**: cross-fade between live canvases (risks showing unloaded tiles —
rejected as primary, retained inside the reveal beat once readiness is confirmed); single shared
WebGL context (Cesium and Three.js cannot safely share one context/scene graph); rendering the
globe inside Cesium (rejected by constitution and creative direction).

## R6 — Ticker & Render-Loop Ownership

**Decision**: exactly one RAF driver — the GSAP ticker. Cesium's default render loop is disabled
(`useDefaultRenderLoop: false`); a `gsap.ticker` callback calls `viewer.render()` when the Cesium
stage is active and the Three.js `renderer.render()` when the globe is active (both only during
the handover window). `requestRenderMode` stays off during active stages for LED-smooth motion but
render calls stop entirely for whichever renderer is inactive. No component ever starts its own
RAF loop; the endurance suite asserts ticker-callback count stability.

**Rationale**: Principle VIII prohibits duplicate RAF loops and competing tickers; Principle II
prohibits competing camera writers. One ticker gives deterministic frame ordering (input → machine
→ orchestrator → renderers) and makes "renderer renders only when owned" enforceable in one place.

**Alternatives considered**: independent loops per renderer with visibility flags (two tickers,
drift, double work during handover); Cesium clock as master (couples non-Cesium states to Cesium
lifecycle).

## R7 — Development Input Transport & Simulator

**Decision**: two transport adapters now, both terminating at the semantic boundary defined in
[contracts/semantic-input.md](./contracts/semantic-input.md): (1) `SimulatorTransport` — the
hidden operator simulator UI emitting semantic actions in-process, able to inject duplicates,
bursts, invalid actions, rapid wheel streams, disconnect/reconnect; (2) `WebSocketTransport` — a
dev-time JSON-over-WebSocket adapter (served by the kiosk sidecar) so external scripts/hardware
prototypes can drive the app. The physical console transport (MIDI/OSC/MQTT/serial/WebSocket) is
an open decision; whichever is chosen becomes a third adapter with zero navigation logic inside.

**Rationale**: Principle III requires the simulator to use the identical semantic interface and
requires transports to be replaceable. A WS dev adapter proves protocol independence early
(two real transports before the console exists) and gives hardware integrators a reference.

**Alternatives considered**: keyboard-shortcut dev input (retained only as a thin wrapper that
emits semantic actions through the simulator path); committing early to MIDI (premature — owner
decision pending).

## R8 — Content Package, Publishing, Staging & Rollback

**Decision**: the unit of publication is a **content package**: a versioned directory tree with a
root `manifest.json` (semver release version, content hash, freeze flag), per-project JSON
(identity, framing, options, sequences, beats) and per-project media/audio folders — schema in
[contracts/content-package.md](./contracts/content-package.md), authored/validated by the
pipeline, loaded read-only by the runtime. Publishing = producing an immutable release directory
`releases/<version>/` plus updating a `channels.json` pointer (`staging` / `production`).
Rollback = pointing the channel at a previous release (previous releases are retained).
Project-level update = new release differing in one project's subtree (content-hash dedupe keeps
media shared). Freeze = flag in the production channel that the pipeline refuses to overwrite.
Runtime revalidates the package (Zod) at load and refuses unapproved/malformed content.

**Rationale**: Principle V requires staging/production separation, project-level updates,
rollback, freeze, and reproducible builds *without prescribing infrastructure*. Immutable
file-based releases + channel pointers deliver all of it with zero backend, work fully offline at
the event, are diffable/auditable in git, and keep the backend/content-storage boundary
replaceable (a future service only needs to produce the same package).

**Alternatives considered**: headless CMS (Strapi/Sanity/Payload — live service dependency in an
offline-first runtime, deferred backend decision violated); SQLite bundle (opaque diffs, no
per-file media streaming); git-only versioning without manifest channels (no explicit
staging/production or freeze semantics).

## R9 — Provider-Agnostic LLM Drafting (Content Pipeline Only)

**Decision**: define a narrow internal `DraftingProvider` interface (analyze submission → draft
analysis; propose options → draft options; rewrite/assist → text drafts) with **two drivers**:
(1) `api-llm` driver using the **Vercel AI SDK** (`ai` core with `@ai-sdk/openai`,
`@ai-sdk/anthropic`, `@ai-sdk/google`) — one structured-output code path
(`generateObject` + Zod schemas shared with `packages/content-schema`), provider switched by
config/env; (2) `copilot-agent` driver — prompt files + JSON output conventions so a GitHub
Copilot agent session (using available Copilot credits) can perform the same drafting into the
same schema-validated draft files, which the pipeline then ingests exactly as if produced by the
API driver. All output lands as **draft-status** records with mandatory source-passage links;
nothing the drivers produce can enter a release without human approval (Principle VII). The
public runtime has no LLM dependency whatsoever.

**Rationale**: user directive — LLM API must be agnostic across OpenAI/Claude/Gemini, with the
Copilot-agent option to use existing credits. The AI SDK is the maintained cross-provider
abstraction with first-class structured output against Zod, which the pipeline already uses for
validation; schema-validated outputs make the two drivers interchangeable and keep traceability
machine-checkable.

**Alternatives considered**: LangChain.js (heavier abstraction, unneeded orchestration surface);
direct per-provider SDKs behind a hand-rolled interface (three integrations to maintain, no
structured-output convergence); LiteLLM proxy (extra service to run); Copilot-agent-only
(rejected as sole path — batch-processing 36 submissions wants a scriptable API path; kept as
co-equal driver).

## R10 — ClickUp Ingestion

**Decision**: `ingest/` module using the ClickUp REST API v2 with a personal API token
(pipeline-side env config): enumerate tasks in the configured YII submissions list, pull task
name, description (markdown), custom fields (organisation, category, country, location, links),
comments, and attachments; download attachments to local source storage; normalise everything
into a `Submission` record (data-model.md) with stable source-passage identifiers
(field/paragraph anchors) used by all downstream traceability. Ingestion is idempotent and
re-runnable (re-ingest updates the submission, preserving existing passage ids where text is
unchanged). A manual-import fallback (folder of markdown + attachments) covers submissions that
arrive outside ClickUp.

**Rationale**: FR-031 names ClickUp as the primary source; API ingestion with stable passage
anchors is what makes claim-level traceability (FR-034, SC-012) implementable rather than
aspirational. The manual fallback keeps the pipeline usable if ClickUp access lags.

**Alternatives considered**: ClickUp CSV/manual export only (loses attachments and comment
context, unstable anchors); ClickUp webhooks (unneeded — batch prep-time workflow, not live sync).

## R11 — Voiceover Pre-Generation

**Decision**: `voiceover/` module generates narration **at prep time only** from the approved
voiceover script of each content option, through a thin TTS provider adapter (ElevenLabs as the
leading candidate per constitution note; provider + voice selection remains an open editorial
decision). Output: mastered audio files (WAV master → AAC/Opus delivery) stored in the content
package next to their option, each with script version, voice id, generation parameters, duration,
and approval status. Regeneration is triggered by script changes and re-enters review. The
runtime only ever plays these local files (FR-025); caption text fields are carried in the schema
so captions can be added later without redesign.

**Rationale**: Principle IV prohibits live generative audio in the public runtime and prefers
local audio; separating script (editorial asset) from audio (generated asset) with versioned
linkage satisfies FR-025 and keeps voice-vendor choice replaceable.

**Alternatives considered**: live TTS at runtime (prohibited); human-recorded narration (kept
open as an editorial option — the package format is agnostic to how audio was produced).

## R12 — Kiosk Startup, Recovery & Operator Access

**Decision**: `tools/kiosk` provides (1) a local static server serving the built app + active
content release on the playback PC; (2) OS-level autostart launching Chromium with `--kiosk
--autoplay-policy=no-user-gesture-required --disable-session-crashed-bubble --noerrdialogs` (plus
GPU flags tuned on event hardware); (3) a watchdog that relaunches the browser if the process
dies; (4) the log/analytics sink endpoint (R15) and the dev WebSocket transport (R7). The app
boots directly into `idle` after asset verification (`boot` state preloads critical assets and
verifies console connectivity without blocking entry to idle beyond the readiness checklist).
Recovery ladder exposed to operators (hidden interface + runbook): soft reset (machine event →
idle with full cleanup) → renderer recovery (rebuild failed renderer adapter in place) → reload
(browser refresh via watchdog) → full restart (relaunch script). Operator interface activation:
concealed input sequence only (per clarification), evaluated inside the input boundary, rate-
limited, never hinted on the public surface.

**Rationale**: FR-027/FR-028 and SC-009 demand low-touch startup and sub-2-minute
operator-executable recovery; a watchdog + ladder pattern is the standard museum/event kiosk
approach and each rung maps to a tested procedure in [quickstart.md](./quickstart.md).

**Alternatives considered**: Electron shell (more control, but adds a runtime to maintain and the
PRD frames a browser app; revisit only if Chromium kiosk flags prove insufficient on event
hardware — boundary: everything above the browser is in `tools/kiosk`); OS-level digital-signage
managers (opaque, less scriptable).

## R13 — Verification Strategy

**Decision**: four evidence layers, mapped to gates in plan.md: (1) **unit/contract** — Vitest for
input boundary (dedup window, priority, validation), orchestrator semantics (open/final/replay/
cancel idempotency), schema validation (Zod fixtures including every FR-036 defect class); (2)
**state-model** — @xstate/graph exhaustive transition legality + scripted interruption matrix
(every major state × every action class, asserting destination and cleanup); (3) **integration/
E2E** — Playwright driving the app through the simulator for all SC-001…SC-007 journeys,
including disconnect/reconnect and forced media failure, with screenshot assertions for
no-blank-frame checks; (4) **endurance/performance** — scripted full-event-day soak (randomised
realistic action traces at worst-case content), sampling `performance.memory`, frame times, and
listener/ticker counts; plus documented manual procedures for legibility review, geographic
framing approval, and on-hardware 250 ms response measurement (release-blocking per SC-002).

**Rationale**: Principle IX demands automated tests for state/input/sequence logic and documented
repeatable procedures where automation is impractical (visual legibility, event hardware).

**Alternatives considered**: Cypress (Playwright's multi-context + tracing fits kiosk debugging
better); fully manual endurance testing (not repeatable, rejected).

## R14 — Performance & Asset Budgets (Initial, Hardware-Pending)

**Decision**: initial budgets, re-validated on event hardware once LED resolution and the playback
PC are confirmed (open dependency):

| Budget | Initial value | Fallback quality level |
|---|---|---|
| Frame rate / pacing | 60 fps target, no sustained drops below 50 fps; no visible hitch > 100 ms during transitions | reduce cloud-shader cost, marker glow, post-processing |
| Input → first visible response | ≤ 250 ms hard (SC-002) | pre-armed acknowledgement treatments per action class |
| JS heap | stable envelope over soak; no monotonic growth across repeated cycles | preload-cache eviction thresholds |
| Globe texture set | ≤ 512 MB GPU budget (day/night/clouds/normal/specular) | mip-capped 8k → 4k variants |
| Per-project media | ≤ 400 MB per project package; video ≤ 1080p60 or 4K30 (decided after hardware confirmation), H.264/H.265 hardware-decoded | per-asset declared fallback rendition |
| Concurrent video | 1 decoding surface active + 1 preloading, never more | posters + delayed start |
| Cesium tile cache | `maximumCacheOverflowBytes` tuned on hardware; cache trimmed on stage exit | fallback tiers per R4 |
| Voiceover audio | AAC/Opus ≤ 192 kbps, mastered loudness target set with editorial | n/a (small) |

Preload policy (FR-030): on preview — warm the previewed project's Cesium target and landing
assets; on landing — preload all active option media/voiceover; decode-once reuse via in-memory
caches owned by the content loader; eviction on category change.

**Rationale**: Principle VIII requires documented budgets with fallback levels even while final
hardware is pending; these bound design decisions now and become release-measured numbers later.

**Alternatives considered**: deferring all budgets to hardware confirmation (would leave asset
production and pipeline validation unbounded — rejected).

## R15 — Analytics & Logging Sink

**Decision**: `TelemetryLogger` in the runtime buffers interaction/system events (FR-038 event
set, schema in [contracts/analytics-events.md](./contracts/analytics-events.md)) in a ring buffer
and flushes them fire-and-forget over local HTTP to the kiosk sidecar, which appends JSONL files
per day. Buffer overflow drops oldest telemetry silently; sink unavailability never surfaces to
the public path (SC/QR: logging failures cannot affect operation). Operator diagnostics read from
the in-memory `DiagnosticsStore`, not from the sink. Post-event analysis consumes the JSONL files
(popularity, dwell time, paths, reliability); long-term analytics storage remains an open
operations decision.

**Rationale**: Principle IV/IX — never block navigation/rendering on logging; local JSONL is
crash-safe, offline-safe, and trivially importable later without prescribing analytics
infrastructure.

**Alternatives considered**: hosted analytics (internet dependency during event — rejected for
runtime; fine post-event); IndexedDB-only storage (survives poorly across browser resets and
complicates operator collection).

## R16 — Build Tooling & Workspace

**Decision**: pnpm workspaces monorepo; Vite for `apps/experience` (with `vite-plugin-cesium`-
style static asset handling for Cesium's workers/assets, `CESIUM_BASE_URL` pinned to local
files); Vitest shares the Vite pipeline; `apps/content-pipeline` is a Node CLI (tsx + small
command runner); shared `packages/*` are plain TS libraries consumed by both apps. Production
build outputs a fully static bundle served by the kiosk server — no SSR, no CDN dependency.

**Rationale**: Vite is the current standard for fast React + heavy-asset builds and handles
Cesium's static assets locally (offline requirement); pnpm workspaces give the two-app +
shared-contracts structure the constitution's separation demands with one lockfile.

**Alternatives considered**: Next.js (SSR/routing surface irrelevant to a single-screen kiosk);
webpack (slower, no benefit); Nx/Turborepo (build-graph tooling unnecessary at this repo size —
can be added later without restructuring).

---

## Open Dependencies (preserved boundaries — not blockers for Phase 1)

| Dependency | Owner | Needed before | Plan impact when resolved |
|---|---|---|---|
| Physical console transport + payloads | creative technology | hardware-integration testing | new transport adapter only (R7) |
| LED resolution + playback PC | event operations | budget finalisation, endurance runs | re-measure R14 budgets; tune kiosk flags |
| Final categories/finalists data | YII programme | content lock | content package data only |
| Complete ClickUp submissions + media rights | content/editorial | editorial production | pipeline inputs only |
| Voice selection, mastering, caption policy | editorial/UX | voiceover generation | R11 adapter config |
| Per-project tile suitability + licensing | creative tech + content | framing approval | per-project fallback tier (R4) |
| Analytics retention/privacy review | operations | event build | post-event consumption of R15 JSONL |
| Visual design system | UX/visual design | content-template production | design tokens + format-library skins |
