# Implementation Plan: YII 2026 Interactive LED Experience

**Branch**: `001-yii-led-experience` | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-yii-led-experience/spec.md`

## Summary

A single-user, console-driven, full-screen LED wall experience presenting 12 YII award categories
and 36 finalist projects, plus a separate content-preparation pipeline. Technical approach:

- **React + TypeScript** application whose public navigation is owned exclusively by an **XState v5
  experience state machine** (deterministic states, guards, entry/exit cleanup, priority-aware
  interruption).
- **GSAP v3 (3.13+)** is the single general-purpose animation engine, wrapped in an
  application-owned **Sequence Orchestrator** (architecture decision recorded in
  [research.md](./research.md) R1).
- **Custom Three.js cinematic globe** for idle / category / project-preview presentation;
  **CesiumJS with Google Photorealistic 3D Tiles loaded from a Cesium ion asset (asset id +
  access token)** for project landing and story presentation; a **HandoverController** performs the
  concealed transitions between the two renderers.
- **Protocol-independent semantic input** boundary with validation, 1-second deduplication,
  explicit priority, connection monitoring, a dev WebSocket transport, and a hidden simulator —
  the physical console transport remains a preserved open decision.
- **Local-first content packages**: versioned, validated, approved JSON + media bundles are the
  only content source for the public runtime; publishing supports staging/production, project-level
  update, rollback, and freeze.
- **Provider-agnostic LLM drafting** (OpenAI / Claude / Gemini via one adapter interface, or a
  GitHub Copilot agent workflow) in the prep-time pipeline only, with human approval gating and
  source traceability; **voiceover is pre-generated** and shipped as local audio.
- **Hidden operator interface** (concealed activation) with full diagnostics, recovery controls,
  and the simulator; **non-blocking JSONL analytics** via a kiosk sidecar.

## Technical Context

**Language/Version**: TypeScript 5.x (strict) throughout; Node.js 22 LTS for tooling and the
content pipeline; browser runtime is Chromium in full-screen kiosk mode.

**Primary Dependencies**: React 19; XState v5 (experience state machine); GSAP 3.13+ with
`@gsap/react` (single general-purpose animation engine — architecture decision in research.md R1);
CesiumJS ≥ 1.124 with Google Photorealistic 3D Tiles streamed from a Cesium ion asset (configurable
asset id + access token — research.md R4); Three.js (custom cinematic globe — research.md R3); Zod
(contract validation); Vite + pnpm workspaces (build — research.md R16). Content pipeline: Vercel
AI SDK (`ai` + `@ai-sdk/openai` / `@ai-sdk/anthropic` / `@ai-sdk/google`) behind a
provider-agnostic drafting interface with an alternate GitHub Copilot agent-workflow driver
(research.md R9); ClickUp API v2 client (research.md R10); TTS provider adapter for pre-generated
voiceover only (research.md R11).

**Storage**: No runtime database. Versioned file-based content packages (JSON manifest + media +
audio) produced by the pipeline and stored in git (+ LFS for media) with staging/production release
channels; analytics as append-only local JSONL written by the kiosk sidecar; operator logs on local
disk. Backend/content-storage service remains a replaceable boundary.

**Testing**: Vitest + React Testing Library (unit); @xstate/graph path/model tests (state-machine
legality and interruption matrix); Playwright driving the simulator (integration/E2E); Zod/JSON
Schema contract tests; scripted full-event-day endurance soak with memory/frame-time capture;
documented repeatable manual procedures for visual, geographic, and legibility validation.

**Target Platform**: Dedicated playback PC (OS finalised by event operations) driving the LED wall
at native resolution through Chromium kiosk mode on an event-local network; critical journeys never
depend on public internet.

**Project Type**: Web-application monorepo — public runtime app (`apps/experience`), content
pipeline app (`apps/content-pipeline`), shared contract packages, and kiosk tooling.

**Playback Environment**: LED resolution and playback hardware are an external open dependency
(owner: event operations — spec Open Decisions). Working assumption for design: up to 4K-class
pixel count on a discrete-GPU playback PC at 60 Hz. All compositions are resolution-independent;
budgets are re-validated on event hardware before release (research.md R14).

**Input Boundary**: All input arrives as validated semantic actions per
[contracts/semantic-input.md](./contracts/semantic-input.md) through replaceable transport adapters
(dev WebSocket + hidden simulator now; final console transport is a preserved open decision).
Validation, the 1 s dedup window, priority enforcement, ordering policy, and connection monitoring
live only at this boundary. The simulator uses the identical semantic interface.

**Offline/Event-Local Strategy**: All critical content (project data, display text, voiceover,
images, video, fonts, motion assets, fallback geographic backdrops) ships inside the local content
package. Google Photorealistic 3D Tiles are streamed (licensing prohibits offline caching) with a
documented three-tier fallback and availability assumptions (research.md R4). Low-touch startup,
soft reset, reload, restart, media/renderer recovery, and console reconnect are defined in
research.md R12 and validated via [quickstart.md](./quickstart.md).

**Observability & Recovery**: Hidden operator overlay opened only by a concealed input sequence,
exposing the full QR-008 diagnostics set and recovery controls
([contracts/operator-diagnostics.md](./contracts/operator-diagnostics.md)); buffered non-blocking
JSONL analytics ([contracts/analytics-events.md](./contracts/analytics-events.md)); per-state
failure destinations in [data-model.md](./data-model.md) §Experience State Model.

**Performance Goals**: 60 fps target with stable frame pacing; hard release-blocking 250 ms
first-visible-response to every console action; zero black/stale frames during renderer handovers;
no progressive memory growth or frame degradation across a full-event-day soak.

**Resource & Asset Budgets**: Per-asset budgets and fallback quality levels in research.md R14
(globe texture set, per-project media, concurrent video, tile-cache ceiling, JS heap stability),
enforced by pre-publish validation and release measurement on event hardware.

**Accessibility & Presentation**: Large-format legibility at event viewing distance verified per
QR-006; essential meaning never depends on colour alone or motion alone; no rapid flashing;
consistent motion language; every sequence declares a visually complete held final frame; the
public surface is console-operable only with zero menus, instructions, or diagnostics.

**Constraints**: Interruption-safe from every state per the FR-019 priority order; exactly one
general-purpose animation engine; no live generative AI or live TTS in the public runtime; the
production runtime consumes only validated, approved, versioned content; transport-specific
messages terminate at the input adapter boundary.

**Scale/Scope**: 12 categories × 3 finalists (36 projects), ≤ 5 content options each (≤ 180
stories), single concurrent user, one LED output, full event-day continuous operation.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

For every row, record `PASS`, `FAIL`, or `N/A`. `PASS` requires a concrete design decision and a
planned evidence location; `N/A` requires a feature-specific rationale. An unexplained `FAIL`
blocks planning and production release. Re-evaluate the table after design artifacts are complete.

*Evaluated before Phase 0 research and re-checked after Phase 1 design (2026-08-03): all gates
remain PASS; no design artifact introduced a violation.*

| Gate | Status | Plan Evidence / Release Evidence Location |
|------|--------|-------------------------------------------|
| Deterministic state ownership, legal transitions, priorities, interruption destinations, and idempotent cleanup | PASS | XState v5 machine is the sole navigation authority; full state/transition table with success/interruption/failure destinations and cleanup in [data-model.md](./data-model.md) §Experience State Model; @xstate/graph legality tests + interruption-matrix tests in `apps/experience/tests/state/` |
| Application-owned sequence orchestration with opening/final/failure states, cancellation, replay, reset, timing, and media synchronization | PASS | SequenceOrchestrator wraps GSAP timelines (§Architecture below; research.md R1, R6); sequence/beat schema with opening state, final frame, timing model, and sync tolerance in [contracts/content-package.md](./contracts/content-package.md); replay/reset/cancel tests in `apps/experience/tests/orchestration/` |
| Cancellable renderer and camera adapters with no competing camera writers, tickers, render loops, or stale callbacks | PASS | GlobeRendererAdapter, CesiumStageAdapter (native flyTo with complete/cancel), HandoverController (§Architecture); single-ticker policy research.md R6; generation-token stale-callback rejection; integration evidence in `apps/experience/tests/renderers/` |
| Protocol-independent semantic input, validation, ordering, deduplication, connection handling, and simulator coverage | PASS | [contracts/semantic-input.md](./contracts/semantic-input.md); transports behind adapters (research.md R7); dedup/priority/validation boundary tests + simulator coverage matrix in `apps/experience/tests/input/` |
| Local or event-local critical operation, external-dependency fallbacks, operator startup, reset, and recovery | PASS | Content package fully local (research.md R8); Google-tiles availability assumptions + three-tier fallback (research.md R4); kiosk startup/reset/recovery runbook (research.md R12) validated through [quickstart.md](./quickstart.md) offline scenario |
| Reusable validated content, production-boundary approval, source traceability, rights, versioning, and rollback | PASS | [contracts/content-package.md](./contracts/content-package.md) enforces 12×3, mandatory Overview, ≤ 5 options, explicit inactive positions; pipeline approval/traceability model in [data-model.md](./data-model.md) §Editorial Lifecycle; staging/production, rollback, freeze in research.md R8; validation tests in `apps/content-pipeline/tests/` |
| Large-format legibility, non-colour-dependent meaning, safe/reduced motion, console ownership, and final-frame hold | PASS | QR-006 criteria bound to design tokens and the content-format library; final frame is a mandatory sequence field ([contracts/content-package.md](./contracts/content-package.md)); documented legibility/motion review procedure in quickstart validation scenarios |
| Measured performance, asset budgets, resource ownership and cleanup, repeated-use stability, and full-day endurance | PASS | Budgets + fallback quality levels research.md R14; resource-ownership map §Architecture; preload/reuse strategy per FR-030; profiling + full-day soak harness in `apps/experience/tests/endurance/` |
| Operator observability, public/operator separation, untrusted-input validation, credential protection, and non-blocking analytics | PASS | [contracts/operator-diagnostics.md](./contracts/operator-diagnostics.md) (concealed activation, QR-008 field set); both console actions and content packages validated as untrusted input; tokens confined to build-time env/kiosk config; non-blocking telemetry design research.md R15 with failure-injection tests |
| Every affected acceptance criterion has automated or documented repeatable verification | PASS | Verification strategy research.md R13; quickstart scenarios map to SC-001…SC-012; requirements-to-evidence matrix completed at /speckit.tasks with per-task evidence locations |

### Open-Decision Discipline

- **Decided in this plan (researched in [research.md](./research.md))**: animation engine (GSAP —
  R1, full architecture decision recorded), state machine (XState v5 — R2), custom globe renderer
  (Three.js — R3), geographic renderer (CesiumJS + Google Photorealistic 3D Tiles via ion asset
  id/token — R4), renderer handover technique (R5), ticker ownership (R6), content package &
  publishing model (R8), LLM drafting abstraction (R9), ClickUp ingestion (R10), voiceover
  pre-generation (R11), kiosk & startup (R12), analytics sink (R15), build tooling (R16).
- **Preserved replaceable boundaries (intentionally undecided)**: physical console input transport
  (behind transport adapters); backend/content-storage service (file-based packages now; loader
  boundary allows swap); deployment/playback-PC OS; long-term analytics storage; TTS vendor and
  voice selection; per-project geographic tile suitability. Owners and required-by dates are listed
  in the spec's Open Decisions and research.md §Open Dependencies.
- **Animation-library architecture decision**: research.md R1 contains all constitution-required
  fields (alternatives, React integration, cancellation, cleanup, synchronization, performance,
  license, versioning, rollback).
- **Exceptions**: none required — Complexity Tracking is empty.

## Architecture, Ownership & Failure Handling

**Boundaries and owners** (each replaceable behind its interface):

1. **Experience State Machine (XState v5)** — sole authority for public navigation state; consumes
   validated semantic actions only; entry/exit actions start and cancel all state-scoped work.
   React components render from machine snapshots and never own navigation state.
2. **Sequence Orchestrator (GSAP-owned)** — the single motion boundary. Builds timelines from
   data-driven sequence definitions; exposes `play / pause / cancel / replay / reset / seek`;
   reports progress and completion to the machine; never initiates state transitions itself.
3. **Renderer adapters**:
   - `GlobeRendererAdapter` (Three.js): idle loop, marker filtering, preview retargeting that
     cancels/retargets without queuing obsolete destinations; owns its scene, textures, and GPU
     resources.
   - `CesiumStageAdapter`: ion-asset tileset lifecycle (`Cesium3DTileset.fromIonAssetId` with the
     configured Google 3D Tiles asset id + token), camera flights via native `flyTo` wrapped with
     completion/cancellation; GSAP never mutates the Cesium camera during a native flight;
     preload/warm-up API for the previewed project's target.
   - `HandoverController`: owns the concealed transition choreography in both directions;
     guarantees no black/stale frames; both renderers render simultaneously only inside the
     handover window it controls.
4. **Input boundary** — transport adapters (WebSocket dev, simulator; final console TBD) →
   schema validation → 1 s dedup → priority gate → state machine. The connection monitor feeds
   diagnostics only and never mutates experience state.
5. **Content boundary** — the runtime loader accepts only schema-valid, approved, versioned
   packages; the preload manager implements FR-030 (previewed project's geographic target and
   landing assets; all active options after selection; decode-once reuse).
6. **Media adapters** — `VoiceoverPlayer` and `VideoSurface` expose start/stop/seek/dispose. The
   authoritative timebase is the voiceover clock when narration is present, otherwise the GSAP
   timeline clock; drift is corrected by seeking the timeline within the per-template tolerance
   declared in the content package.
7. **Operator & telemetry** — `DiagnosticsStore` is a read model fed by all boundaries; operator
   commands enter through the same semantic-input boundary at operator priority; `TelemetryLogger`
   is buffered, drop-on-overflow, and never awaited on interaction paths.

**Cancellation & cleanup policy**: every adapter operation returns a cancellable handle; state exit
actions cancel owned handles idempotently; asynchronous completions carry generation tokens and are
discarded when stale; repeated cancellation is a no-op by contract.

**Resource ownership**: each renderer adapter owns and disposes its GPU/DOM resources; media
adapters own media elements and object URLs; the orchestrator owns timelines and their ticker
registrations; the machine owns subscriptions and timers. A single ownership map is maintained in
code next to the adapters and verified by leak assertions in the endurance suite.

**Failure destinations**: media failure → in-composition fallback (no blanking); project-load
failure → safe project landing or preview; renderer failure → HandoverController reset to idle via
the `recovering` state; every public-facing error is suppressed while the operator is notified —
per-state destinations are tabulated in [data-model.md](./data-model.md).

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
apps/
├── experience/                    # Public LED runtime + hidden operator tools
│   ├── src/
│   │   ├── app/                   # React shell, kiosk bootstrap, public stage + operator overlay mount
│   │   ├── state/                 # XState experience machine, guards, entry/exit cleanup, priority gate
│   │   ├── input/                 # Semantic boundary: validation, dedup, transports (ws, simulator), connection monitor
│   │   ├── orchestration/         # GSAP-owned SequenceOrchestrator, timeline factories, motion tokens
│   │   ├── renderers/
│   │   │   ├── globe/             # Three.js custom cinematic globe adapter (idle/preview)
│   │   │   ├── cesium/            # CesiumJS stage adapter, ion tileset mgmt, camera flight adapter
│   │   │   └── handover/          # Concealed transition controller (both directions)
│   │   ├── content/               # Package loader, runtime validation, preload/reuse cache
│   │   ├── media/                 # VoiceoverPlayer, VideoSurface adapters
│   │   ├── formats/               # Reusable content-format library (FR-014 compositions)
│   │   ├── operator/              # Hidden operator UI, DiagnosticsStore, simulator UI
│   │   ├── telemetry/             # Non-blocking interaction/system event logger
│   │   └── ui/                    # Public overlay components (metadata, typography, design tokens)
│   ├── public/                    # Cesium static assets, fonts, globe textures
│   └── tests/
│       ├── state/                 # Machine legality + interruption matrix (@xstate/graph, vitest)
│       ├── input/                 # Dedup, priority, validation, simulator coverage
│       ├── orchestration/         # Sequence open/final/replay/cancel/cleanup
│       ├── renderers/             # Adapter + handover integration
│       ├── e2e/                   # Playwright journeys via simulator
│       └── endurance/             # Full-day soak, memory/frame-time capture
├── content-pipeline/              # Prep-time tooling (never bundled into public runtime)
│   ├── src/
│   │   ├── ingest/                # ClickUp API v2 + manual-export ingestion
│   │   ├── analyze/               # Provider-agnostic LLM drafting (api-llm + copilot-agent drivers)
│   │   ├── review/                # Review/approval state, traceability, editorial exports
│   │   ├── voiceover/             # Pre-generation of narration audio (TTS provider adapter)
│   │   ├── validate/              # Pre-publish validation (FR-036 rule set)
│   │   └── publish/               # Release bundling, staging/production, rollback, freeze
│   └── tests/
packages/
├── content-schema/                # Zod schemas + JSON Schema export for the content package
└── semantic-actions/              # Semantic action types, priority classes, dedup identity
tools/
└── kiosk/                         # Local static + log-sink server, launch scripts, operator runbooks
```

**Structure Decision**: pnpm-workspace monorepo separating the two operational concerns required
by the constitution — the public runtime (`apps/experience`) and content preparation/publishing
(`apps/content-pipeline`) — with the shared contracts they must agree on
(`packages/content-schema`, `packages/semantic-actions`) extracted so neither app depends on the
other. `tools/kiosk` holds the event-machine startup/server/runbook assets so operational recovery
is versioned with the code.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitutional exceptions are required. Two dependency facts are recorded for transparency (they
are compliant, not waivers): (1) Google Photorealistic 3D Tiles cannot be cached offline under
Google Maps Platform terms — handled via the Principle IV documented availability assumptions and
approved fallback tiers in research.md R4; (2) GSAP 3.13+ ships under the free-for-commercial-use
standard GSAP license (not an OSI license) — purpose, maintenance, license, version policy, and
removal strategy are documented in research.md R1 as required by the Development and Review Rules.

| Rule or Gate | Why Needed / Alternatives Rejected | Owner & Approval | Risks, Mitigations & Recovery | Expiry & Remediation |
|--------------|------------------------------------|------------------|-------------------------------|----------------------|
| — | — | — | — | — |
