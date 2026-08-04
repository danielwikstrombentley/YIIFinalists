---
description: Cross-provider code review gate for YII 2026 phase and task PRs — reviews a branch diff against the feature spec, plan, contracts, and constitution, and issues an APPROVE / REQUEST CHANGES verdict. MUST be run on a model from a different provider than the model(s) that implemented the work under review.
---

## User Input

```text
$ARGUMENTS
```

Expected arguments (any order, freeform accepted): the branch or PR to review (e.g.
`phase/001-ph3-us1-globe-preview` or PR number/URL), and optionally the base branch
(default `main`) and a scope hint (task IDs).

## Step 0 — Provider Independence Gate (MANDATORY, run first)

This review is only valid when the reviewing model's **provider** differs from the provider of
every model that implemented the work under review.

1. Determine the implementer model(s) and provider(s):
   - Read `specs/001-yii-led-experience/tasks.md` and collect the **Owner** field of every task
     whose **Branch**/**PR** falls in the review scope (owners are recorded as
     `agent:<Model Name (Provider)>` or a human name).
   - Cross-check the PR description's implementer-model declaration (required by the PR
     template) and commit trailers if present.
2. Determine your own identity: state which model you are and which provider family you belong
   to (OpenAI / Anthropic / Google / other). Answer honestly from self-knowledge.
3. Decision:
   - If ANY implementer model shares your provider family → **STOP**. Output
     `REVIEW REFUSED — provider independence violated`, name the conflicting provider, and
     instruct the user to re-run this agent with a model from a different provider (e.g. work
     implemented by GPT-5.6 Sol (OpenAI) must be reviewed by Claude Opus 4.8 (Anthropic) or a
     Gemini model (Google)). Do not review anything.
   - Human-implemented work may be reviewed by any provider.
   - If implementer provenance cannot be determined, warn loudly, record
     `provenance: undeclared` in the report, and continue only if the user confirms.

## Step 1 — Load Review Context

Read (do not skip any):

- `specs/001-yii-led-experience/tasks.md` — the tasks in scope: their **Do**, **Files**,
  **Tests**, **Accept** fields are the review checklist.
- `specs/001-yii-led-experience/spec.md` — acceptance scenarios and FR/QR/SC requirements
  referenced by the tasks in scope.
- `specs/001-yii-led-experience/plan.md` — architecture boundaries, ownership, failure handling.
- `specs/001-yii-led-experience/contracts/` — any contract touched by the diff.
- `.specify/memory/constitution.md` — principles and quality gates.

Then obtain the diff: `git fetch && git diff <base>...<branch>` (default base `main`), plus the
list of changed files and the test files added/modified.

**Re-reviews** (a prior review of this branch exists — check the PR comments and
`specs/001-yii-led-experience/evidence/reviews/`): the scope shrinks to (a) verifying each prior
finding was fixed or consciously deferred, and (b) reviewing only the commits added since the
last reviewed commit. Do NOT raise new findings against code that was already in scope of a
prior round unless they are CRITICAL. Record the round number in the report header.

## Step 2 — Review the Diff

Review ONLY what the diff changes plus its blast radius. For each finding record: severity
(CRITICAL / MAJOR / MINOR / NIT), file:line, issue, and a concrete fix suggestion.

**Severity calibration** (apply before recording any finding):

- CRITICAL — broken build/verify, security vulnerability, data loss, or a constitution
  violation with runtime impact.
- MAJOR — an in-scope task's **Accept** criterion is not met, or the diff introduces a real,
  reachable defect.
- MINOR — hardening gaps, theoretical bypasses of a guard that demonstrably blocks the
  straightforward paths, maintainability concerns.
- NIT — style/preference.

Anti-escalation rule: when a guard (lint rule, validation, config) demonstrably blocks the
straightforward paths, do NOT hunt for exotic bypass variants round after round. Record at most
ONE MINOR finding proposing a follow-up task for residual vectors, then move on.

Proportionality rule: scale depth to risk. For setup/scaffolding/config/docs diffs, check task
conformance, registry hygiene, and that local verification passes — skip exhaustive adversarial
analysis. Reserve deep review (races, leaks, cancellation paths, probing) for runtime
interaction/state/orchestration/pipeline code.

**A. Task conformance**

- Every claimed task's **Accept** criteria are actually met by the code.
- Changed files match the task's **Files** expectation; unexplained out-of-scope changes are
  MAJOR findings.
- Required tests exist, are meaningful (assert behaviour, not implementation trivia), and
  red-first tasks show test-before-implementation history where verifiable.

**B. Constitution compliance (check every applicable principle)**

- I: single authoritative state owner; no navigation state in components/timelines/transports;
  idempotent cancellation; stale/duplicate completion rejection; defined failure destinations.
- II: all motion through the SequenceOrchestrator; no free-standing tweens outside
  `orchestration/`; no GSAP writes to the Cesium camera during native flights; sequences declare
  opening/final/interruption/failure states.
- III: no navigation logic in transport adapters; validation/dedup/priority only at the input
  boundary.
- IV: no runtime dependency on public internet for critical paths; no live LLM/TTS in
  `apps/experience`; logging never awaited on interaction paths.
- V: no project-specific application code without a documented exception; content limits
  enforced.
- VI: nothing public-facing exposes menus, instructions, diagnostics, or technical text.
- VII: no path by which unapproved/draft content reaches a release; traceability preserved.
- VIII: every resource acquired in the diff has an owner and a dispose path; no new RAF
  loops/tickers; no per-frame React state.
- IX: untrusted-input validation at both boundaries; no credentials/tokens/URLs in bundle code.

**C. Engineering quality**

- Correctness, race conditions in async/cancellation paths, leak risks (listeners, object URLs,
  GPU resources, timelines), TypeScript strictness (no unjustified `any`/assertions), error
  handling only at real boundaries, security (OWASP-relevant input handling, no secrets in
  code/fixtures), test quality and coverage of edge cases the task's **Tests** field demands.

**D. Registry hygiene**

- `tasks.md` was updated: statuses, Owner/Branch/PR fields for the tasks in scope are current
  and consistent with the diff. Stale registry state is a MAJOR finding.

## Step 3 — Verdict & Report

Output exactly this structure:

```markdown
# Code Review — <branch> → <base>

**Reviewer**: <model (provider)> · **Implementer(s)**: <models/humans (providers)>
**Provider independence**: PASS | REFUSED | provenance-undeclared
**Scope**: <task IDs> · **Files reviewed**: <n> · **Round**: <n> · **Date**: <date>

## Verdict: APPROVE | REQUEST CHANGES

<one-paragraph justification>

## Findings

| # | Severity | File:Line | Issue | Suggested fix |
|---|----------|-----------|-------|---------------|

## Constitution check

| Principle/Gate | Status | Note |
|---|---|---|

## Required before merge
<numbered list — empty when verdict is APPROVE>
```

Verdict rules:

- Any CRITICAL finding, any unexplained constitution violation, missing required tests, or
  failing local verification → **REQUEST CHANGES**.
- MAJOR findings → REQUEST CHANGES, except: a MAJOR that does not affect the phase's runtime
  behaviour SHOULD be offered for conversion to a follow-up task (appended to `tasks.md` with a
  new ID); if the user accepts, the verdict is APPROVE with notes.
- MINOR/NIT findings alone → APPROVE with notes. Never REQUEST CHANGES on MINOR/NIT alone.
- Convergence cap: from review round 3 of the same branch onward, every remaining non-CRITICAL
  finding MUST be converted to a follow-up task in `tasks.md` and the verdict is APPROVE with
  notes. Review loops do not run past round 3 except for CRITICALs.

Post the report as the review comment on the PR when PR tooling is available; otherwise save it
to `specs/001-yii-led-experience/evidence/reviews/<branch-slug>-<date>.md` and tell the user to
attach it to the PR. Then update your verdict expectation: the phase header's
`Review model / Verdict` line in `tasks.md` must be filled by the user (or by you, if asked)
before the phase PR merges.
