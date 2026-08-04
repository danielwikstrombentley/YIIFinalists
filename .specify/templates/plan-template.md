# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]

**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command; its definition describes the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]

**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]

**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]

**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]

**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]

**Project Type**: [e.g., library/cli/web-service/mobile-app/compiler/desktop-app or NEEDS CLARIFICATION]

**Playback Environment**: [target LED resolution and representative playback hardware, or N/A with rationale]

**Input Boundary**: [semantic actions, adapter boundary, validation, priority, deduplication, and simulator impact, or N/A with rationale]

**Offline/Event-Local Strategy**: [critical local assets, external dependencies, fallbacks, and recovery assumptions, or N/A with rationale]

**Observability & Recovery**: [operator diagnostics, logs, reset/restart paths, and failure destinations, or N/A with rationale]

**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]

**Resource & Asset Budgets**: [frame-time, memory, media/3D asset, network, and fallback-quality budgets, or N/A with rationale]

**Accessibility & Presentation**: [viewing distance, legibility, contrast, safe/reduced motion, final-frame, and console-only operation criteria, or N/A with rationale]

**Constraints**: [domain-specific, e.g., <200ms p95, offline-capable, interruption-safe, or NEEDS CLARIFICATION]

**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

For every row, record `PASS`, `FAIL`, or `N/A`. `PASS` requires a concrete design decision and a
planned evidence location; `N/A` requires a feature-specific rationale. An unexplained `FAIL`
blocks planning and production release. Re-evaluate the table after design artifacts are complete.

| Gate | Status | Plan Evidence / Release Evidence Location |
|------|--------|-------------------------------------------|
| Deterministic state ownership, legal transitions, priorities, interruption destinations, and idempotent cleanup | [PASS/FAIL/N/A] | [state model, transition table, tests] |
| Application-owned sequence orchestration with opening/final/failure states, cancellation, replay, reset, timing, and media synchronization | [PASS/FAIL/N/A] | [sequence contract, timing model, tests] |
| Cancellable renderer and camera adapters with no competing camera writers, tickers, render loops, or stale callbacks | [PASS/FAIL/N/A] | [adapter design, ownership map, integration evidence] |
| Protocol-independent semantic input, validation, ordering, deduplication, connection handling, and simulator coverage | [PASS/FAIL/N/A] | [semantic contract, adapter design, tests] |
| Local or event-local critical operation, external-dependency fallbacks, operator startup, reset, and recovery | [PASS/FAIL/N/A] | [dependency inventory, fallback design, runbook tests] |
| Reusable validated content, production-boundary approval, source traceability, rights, versioning, and rollback | [PASS/FAIL/N/A] | [content contract, validation and approval evidence] |
| Large-format legibility, non-colour-dependent meaning, safe/reduced motion, console ownership, and final-frame hold | [PASS/FAIL/N/A] | [design criteria, accessibility and presentation tests] |
| Measured performance, asset budgets, resource ownership and cleanup, repeated-use stability, and full-day endurance | [PASS/FAIL/N/A] | [budgets, ownership map, profiling and endurance plan] |
| Operator observability, public/operator separation, untrusted-input validation, credential protection, and non-blocking analytics | [PASS/FAIL/N/A] | [diagnostic contract, security review, failure tests] |
| Every affected acceptance criterion has automated or documented repeatable verification | [PASS/FAIL/N/A] | [requirements-to-evidence matrix] |

### Open-Decision Discipline

- Preserve replaceable boundaries for renderer implementation, animation engine, input transport,
  backend, content storage, publishing, analytics storage, and deployment until each is separately
  researched and decided.
- If this plan selects an animation library, include an architecture decision covering alternatives,
  React integration, supported targets, cancellation and cleanup, media synchronization,
  representative-hardware performance, license, version policy, and rollback.
- Record every constitutional exception in Complexity Tracking with its approval, expiry, fallback,
  and remediation plan. An undocumented exception is a gate failure.

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
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Rule or Gate | Why Needed / Alternatives Rejected | Owner & Approval | Risks, Mitigations & Recovery | Expiry & Remediation |
|--------------|------------------------------------|------------------|-------------------------------|----------------------|
| [exact constitutional rule] | [business/technical rationale and alternatives] | [owner and approval authority] | [affected requirements, user impact, fallback] | [review date and removal plan] |
