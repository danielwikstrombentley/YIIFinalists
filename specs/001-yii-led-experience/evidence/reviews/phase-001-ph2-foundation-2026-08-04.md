# Code Review — phase/001-ph2-foundation → main

**Reviewer**: GPT-5.6 Sol (OpenAI) · **Implementer(s)**: Claude Sonnet 5 (Anthropic)
**Provider independence**: PASS
**Scope**: T006–T020 (PH2) · **Files reviewed**: 93 · **Round**: 1 · **Date**: 2026-08-04

## Verdict: REQUEST CHANGES

Provider provenance is consistent across the task registry and PR declaration, and frozen install, the full local verification chain, Playwright, CLI/schema-export checks, and the production audit pass under Node 22.15.0. The phase is not merge-ready, however: the documented quickstart cannot boot the generated sample to idle, runtime input is left on the permissive validator and accepts unknown release references, a category press during reverse handover invalidates the only completion token and leaves the machine stuck, and malformed URL encoding can escape the kiosk request handler. The required red-first history is also not verifiable because every red test was first committed atomically with its paired implementation.

## Findings

| # | Severity | File:Line | Issue | Suggested fix |
|---|----------|-----------|-------|---------------|
| 1 | MAJOR | [apps/content-pipeline/src/seed/sample.ts:144](apps/content-pipeline/src/seed/sample.ts#L144), [apps/experience/src/content/revalidate.ts:17](apps/experience/src/content/revalidate.ts#L17) | T018/T020's documented quickstart is broken. `seed:sample` deliberately writes 2 categories, but the real `ContentLoader` validates `categories.json` with `categoriesFileSchema`, which requires 12. Running the exact setup produced `categories.json failed schema validation for release "0.1.0-sample"`; the stage never reached idle. The T018 test only validates each category independently and therefore does not perform its required “loader loads it” integration. | Make the seed artifact consumable by the same loader path used by the app—prefer a 12×3 schema-valid sample, or introduce an explicitly dev-only package/schema mode without weakening production validation. Add an integration test that writes the seed and calls the real `ContentLoader.load()`/`loadProject()`, plus an app test using that artifact, and verify the quickstart reaches idle. |
| 2 | MAJOR | [apps/experience/src/app/bootstrap.ts:62](apps/experience/src/app/bootstrap.ts#L62), [apps/experience/src/input/boundary.ts:107](apps/experience/src/input/boundary.ts#L107) | The production runtime constructs `InputBoundary` without a `ReleaseRefValidator`, so it uses the permissive fallback. Even after content loads, unknown category/project IDs are accepted; `content.select` positions are never checked at all despite `hasContentPosition()` existing. This fails T013, semantic-input boundary rule 1, and untrusted-input validation. | Build a release-backed validator from the loaded categories/projects and inject it before transports can dispatch actions; validate category IDs, project IDs in the active category, and content positions against the selected loaded project. Do not use the permissive validator in runtime wiring. Add integration tests proving unknown category/project/inactive position inputs are rejected by `createRuntimeDependencies()` after boot. |
| 3 | MAJOR | [apps/experience/src/state/machine.ts:154](apps/experience/src/state/machine.ts#L154), [apps/experience/src/state/actions.ts:117](apps/experience/src/state/actions.ts#L117) | A `category.select` received while `transitionToPreview` is active runs `requestCategorySwitch`, which increments `generation`, but it does not restart the handover. The in-flight completion still carries the previous generation and is rejected, leaving the machine in `transitionToPreview` indefinitely. A focused reproduction ended with `{state:"transitionToPreview", pending:"cat-2"}`. | Updating only the pending category must not invalidate the current handover token. Split pending-category assignment from async-operation generation, or cancel/restart the handover and issue a new completion token. Add a state test for one and repeated category selections mid-reverse-handover, including stale and current completion events. |
| 4 | MAJOR | [specs/001-yii-led-experience/tasks.md:232](specs/001-yii-led-experience/tasks.md#L232) | Strict red-first evidence is not verifiable for T006/T007/T010/T012/T015. Git history first adds each test in the exact same commit as its paired implementation (respectively T008/T009/T011/T013/T016), with no prior red commit or evidence artifact. The registry explicitly requires each suite to exist and fail before implementation. | Supply trustworthy pre-implementation evidence if it exists (for example, captured failing runs tied to pre-implementation worktree/commit hashes). Otherwise reset these task claims and redo each pair with a committed red test/evidence checkpoint before the green implementation commit; document the red command/output in the PR. |
| 5 | MAJOR | [tools/kiosk/src/server.ts:33](tools/kiosk/src/server.ts#L33), [tools/kiosk/src/server.ts:83](tools/kiosk/src/server.ts#L83) | `decodeURIComponent()` can throw on malformed URL encoding, and `createServer()` fire-and-forgets `handleRequest()` without catching rejected promises. A request such as `/%ZZ` therefore produces an unhandled rejection (and can terminate the sidecar under strict unhandled-rejection policy), violating the kiosk availability boundary. | Catch URI decoding errors in `safeJoin()` and return a 400; also attach a top-level `.catch()` around `handleRequest()` that sends a safe response when possible and prevents an unhandled rejection. Add malformed-path and unexpected static-I/O failure tests. |

## Constitution check

| Principle/Gate | Status | Note |
|---|---|---|
| I. Deterministic state and interruption safety | FAIL | Single XState ownership and cleanup registry are present, but reverse-handover category interruption can deadlock the machine (finding 3). |
| II. Motion and sequence orchestration | PASS | GSAP usage is confined to orchestration; cancel/replay/ticker tests pass. |
| III. Protocol-independent semantic input | FAIL | Adapters contain no navigation logic, but runtime release-reference validation is not wired (finding 2). |
| IV. Local-first event reliability | FAIL | Local dependencies are used, but the quickstart cannot load its sample and malformed paths can destabilize the sidecar (findings 1 and 5). |
| V. Content-driven reusable architecture | FAIL | Schemas and package boundaries are present; the generated dev package is incompatible with the runtime consumer contract (finding 1). |
| VI. Cinematic, console-owned public surface | PASS | The stage contains no public menus, instructions, errors, or operator controls. |
| VII. Human authority and content traceability | PASS | Draft/editorial schemas retain approval and source-link fields; no draft path into runtime was introduced. |
| VIII. Resource ownership and cleanup | PASS | Cleanup/ticker ownership is explicit for PH2 scope; no extra RAF loop or per-frame React state was introduced. |
| IX. Verification, observability, and secure operation | FAIL | Untrusted semantic references are accepted in real runtime wiring and kiosk malformed-path handling is unsafe (findings 2 and 5). |
| Local verification | PASS | Node 22.15.0: frozen install, `pnpm run verify` (166 passed; 4 skipped), Playwright (1 passed), CLI seed/help, JSON Schema export, and `pnpm audit --prod` all completed; quickstart integration itself failed as finding 1 records. |
| Registry hygiene | PASS | T006–T020 are `[R]` with consistent Owner/Branch/PR fields; phase header awaits reviewer/verdict update by the user. |

## Required before merge

1. Make the generated sample release load through the real runtime and prove `pnpm --filter experience dev` reaches idle.
2. Wire active-release reference/position validation into the runtime input boundary and add integration coverage.
3. Fix reverse-handover generation handling so category changes cannot strand the machine.
4. Resolve or provide auditable evidence for all five red-first task pairs.
5. Harden kiosk request handling against malformed URI encoding and rejected request promises.
