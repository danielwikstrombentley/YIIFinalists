# Code Review — phase/001-ph2-foundation → main

**Reviewer**: GPT-5.6 Sol (OpenAI) · **Implementer(s)**: Claude Sonnet 5 (Anthropic)
**Provider independence**: PASS
**Scope**: T006–T020 (PH2; round-1 findings + commit 401e56e) · **Files reviewed**: 17 · **Round**: 2 · **Date**: 2026-08-05

## Verdict: REQUEST CHANGES

Provider provenance remains consistent across the task registry and PR declaration. Commit 401e56e fixes the 12×3 seed shape, reverse-handover generation handling, and malformed kiosk-path handling; the seeded kiosk-served production build reaches `idle`, frozen install and `pnpm run verify` are green (177 passed; 4 skipped), and Playwright passes (1 smoke test). Two round-1 acceptance gaps remain: explicit project refs are validated against the release globally rather than the active category, allowing a cross-category preview, and the exact documented `pnpm --filter experience dev` setup still remains in `boot` because React StrictMode stops and then attempts to restart the same XState actor. The latter is production-runtime-neutral and may be converted to a tracked follow-up with explicit user acceptance, but no such deferral exists yet. The unrecoverable historical red-first evidence gap is accepted as a consciously documented process limitation.

## Findings

| # | Severity | File:Line | Issue | Suggested fix |
|---|----------|-----------|-------|---------------|
| 1 | MAJOR | [apps/experience/src/input/validate.ts:45](apps/experience/src/input/validate.ts#L45), [apps/experience/src/input/boundary.ts:125](apps/experience/src/input/boundary.ts#L125), [apps/experience/src/app/App.tsx:35](apps/experience/src/app/App.tsx#L35) | Round-1 finding 2 is only partially fixed. `hasProject()` accepts a project found in any release category, and the boundary mirrors only `selectedProjectId`, not `activeCategoryId`. After selecting `cat-1`, `preview.hover { projectId: "cat2-a" }` is therefore accepted and the machine previews a finalist outside the active category; direct reproduction returned `accepted: true`. This violates the active-category invariant and leaves the untrusted-input guard incomplete. The added tests cover globally known/unknown IDs but not category membership. | Mirror the machine's active category into the boundary, validate explicit project refs against that category's `projectIds`, clear/update it on navigation, and add runtime-wiring tests that reject a known project from another category while accepting one in the active category. |
| 2 | MAJOR | [apps/experience/src/app/MachineProvider.tsx:31](apps/experience/src/app/MachineProvider.tsx#L31), [apps/experience/src/app/App.tsx:16](apps/experience/src/app/App.tsx#L16), [specs/001-yii-led-experience/quickstart.md:25](specs/001-yii-led-experience/quickstart.md#L25), [apps/content-pipeline/tests/seed.test.ts:13](apps/content-pipeline/tests/seed.test.ts#L13) | Round-1 finding 1's seed-schema mismatch is fixed, and the production kiosk path reaches `idle`, but the T018/T019/T020 acceptance command still does not: the exact `pnpm --filter experience dev` path remains at `boot`. In React development StrictMode, `MachineProvider` stops the actor during the effect probe and then reuses the stopped actor, while `BootOrchestrator` suppresses a second bootstrap. The seed test still does not call the real `ContentLoader`, and Playwright starts app-only preview without the kiosk and asserts only that `#stage` exists, so no required automated test detects this. | Make the actor/bootstrap lifecycle StrictMode-safe and add an integration test that generates the sample, starts the documented app+kiosk path, and asserts `boot → idle`. Because production kiosk operation is unaffected and this predates 401e56e, alternatively append a concrete follow-up task covering both the dev lifecycle and missing integration test, then obtain explicit user acceptance of that deferral. |

## Constitution check

| Principle/Gate | Status | Note |
|---|---|---|
| I. Deterministic state and interruption safety | PASS | Finding 3 is fixed: pending-category updates preserve the active reverse-handover generation, while stale completions remain rejected. |
| II. Motion and sequence orchestration | PASS | No motion ownership changes; the prior orchestrator/ticker evidence remains green. |
| III. Protocol-independent semantic input | FAIL | Production wiring now uses a release-backed validator, but explicit project refs are not scoped to the active category (finding 1). |
| IV. Local-first event reliability | FAIL | The production kiosk path and malformed-path handling pass, but the documented local dev startup does not reach its required known idle state (finding 2). |
| V. Content-driven reusable architecture | PASS | The seed now satisfies the same exact-12 shared schema used by the runtime; project content remains data-driven. |
| VI. Cinematic, console-owned public surface | PASS | Production boot reached `idle` with an empty public stage text surface; no menus, instructions, or diagnostics were introduced. |
| VII. Human authority and content traceability | PASS | No publishing or approval-boundary changes were introduced. |
| VIII. Resource ownership and cleanup | PASS | The new actor subscription has an unsubscribe path; no RAF loop, ticker, or per-frame React state was added. |
| IX. Verification, observability, and secure operation | FAIL | A known but context-invalid project ref crosses the input boundary, and the required seed/loader/dev integration is not automated. |
| Local verification | FAIL | Frozen install, `pnpm run verify` (177 passed, 4 skipped), Playwright (1 passed), and seeded production kiosk boot pass; the exact quickstart dev command was reproduced stuck at `boot`. |
| Registry hygiene | PASS | T006–T020 remain `[R]` with consistent Owner/Branch/PR fields; the phase header correctly records the round-1 verdict and awaits the user's round-2 verdict update. |
| Red-first process evidence | ACCEPTED LIMITATION | No historical red run can be recreated for T006/T007/T010/T012/T015. The gap is documented in commit 401e56e with a prospective discipline commitment; no runtime behavior is affected. |

## Required before merge

1. Scope explicit project-reference validation to the machine's active category and add the missing cross-category rejection coverage.
2. Either fix and test the documented Vite dev `boot → idle` path now, or append a concrete follow-up task and have the user explicitly accept this production-neutral deferral.
3. After a later APPROVE verdict, update the PH2 header's `Review model / Verdict` line in `tasks.md` before merging.
