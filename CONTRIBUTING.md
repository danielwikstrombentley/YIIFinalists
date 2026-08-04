# Contributing

This repo is built from a single source of truth: **[specs/001-yii-led-experience/tasks.md](specs/001-yii-led-experience/tasks.md)**.
Read its §1–§3 (Task Registry Protocol, Phase Dependency Graph, Code Review Protocol) before
starting any work — this document summarizes and operationalizes that protocol; `tasks.md` wins
if the two ever disagree.

## Prerequisites

- Node.js 22 LTS, pnpm ≥ 9 (`corepack enable && corepack use pnpm@9`), git-lfs (`git lfs install`).
- `gh` (GitHub CLI) if you'll open PRs from the command line.

```bash
pnpm install
pnpm run verify   # typecheck + lint + format check + unit tests + build
```

## No hosted CI — run verification locally

This project deliberately runs **no GitHub Actions workflows** (or any other hosted CI runner) to
avoid consuming Actions budget. There is no automated status check blocking a PR. Instead:

- Before opening **or approving** any PR, run:
  - `pnpm run verify` — typecheck, lint, Prettier format check, unit tests, build across every
    workspace package.
  - `pnpm --filter experience run test:e2e` — Playwright, when the change touches `apps/experience`.
  - Any task-specific test command listed in that task's **Tests** field in `tasks.md`.
- Paste the result in the PR description (the PR template has a checklist + output block for
  this). Reviewers may re-run any of these commands themselves if a result looks stale or
  suspicious — trust but verify.
- Wherever `tasks.md` or older docs say "green CI", read it as **green local verification** per
  this section.

If hosted CI is reintroduced later (e.g. once Actions budget is available), re-add a workflow and
update this section plus `tasks.md` §1 accordingly — don't silently reintroduce it.

## Branch & PR model

- `main` — protected; only **phase branches** merge into it, and only after the cross-provider
  review gate below.
- **Phase branches**: `phase/001-phN-<slug>` (one per phase, named in each phase header in
  `tasks.md`). Created from `main` when the phase starts.
- **Task branches**: `task/001-T0XX-<slug>` (one per task, pre-filled in each task's Meta line).
  PR target is the task's phase branch.
  - _Solo-bootstrap exception_: Phase 1 (PH1, T001–T005) was implemented directly on
    `phase/001-ph1-setup` without individual task branches, since one contributor authored all of
    it in one sitting and per-task self-review adds no signal. This is recorded explicitly in each
    task's Meta line; it is not the default going forward — use task branches once more than one
    contributor/agent is active on a phase.
- **Task PR**: task branch → phase branch. Requires green local verification + one review (human
  or agent).
- **Phase PR**: phase branch → `main`. Requires all phase tasks `[x]` (or explicitly deferred with
  a recorded reason), green local verification, and an **APPROVE verdict from the `code-review`
  agent run on a model from a different provider than every implementer of the phase's tasks**
  (see below).

## Claiming and updating a task

1. Pull latest `main`.
2. Set the task's status to `[~]` in `tasks.md`, fill **Owner** (`your name` or
   `agent:<Model Name (Provider)>`) and **Branch**, commit that `tasks.md` change before writing
   any code.
3. When you open a PR, set status `[R]` and record **PR**.
4. If blocked, set `[?]` and fill **Blockers**.
5. After merge, set `[x]`. A task is **never** `[x]` before it has actually been merged — writing
   code alone never completes a task (`tasks.md` §1 Definition of Done).

## Code review (mandatory gate)

The review agent lives at [.github/agents/code-review.agent.md](.github/agents/code-review.agent.md).

- **Task PRs**: a normal review (human or agent) plus green local verification.
- **Phase PRs into `main`**: MUST be reviewed by running the `code-review` agent on a model from a
  **different provider** than every implementer of that phase's tasks (providers: OpenAI /
  Anthropic / Google / other). Example: a phase implemented by `agent:GPT-5.6 Sol (OpenAI)` must
  be reviewed with a Claude (Anthropic) or Gemini (Google) model — never another OpenAI model.
  Human-implemented phases may be reviewed by any provider.
- The agent's Step 0 refuses to review (and reviews nothing) if it detects a provider match, or if
  implementer provenance can't be determined from `tasks.md` Owner fields / commit history —
  always keep Owner fields accurate for this reason.
- Verdict `REQUEST CHANGES` → fix on the phase branch, re-run the same review rule.
  Verdict `APPROVE` → the phase PR may be merged.
- Review reports are attached to the PR when PR-commenting tooling is available, otherwise saved
  to `specs/001-yii-led-experience/evidence/reviews/<branch-slug>-<date>.md`.
- Every phase header in `tasks.md` carries a tracking line —
  `Phase PR: — · Implementer model(s): — · Review model: — · Verdict: —` — keep it current.

## Branch protection (GitHub settings)

Since there is no hosted CI status check to require, configure branch protection on `main` and
`phase/**` using **PR-review-based** rules only:

- Require a pull request before merging (no direct pushes).
- Require at least one approving review before merge.
- Require conversation resolution before merge.
- Do **not** add "required status checks" (there are none — see the no-hosted-CI section above).

## Implementer model declaration

Every PR description declares who implemented the change (human name, or
`agent:<Model Name (Provider)>`) via the PR template. This is how the code-review agent's
provider-independence gate determines whether a review is allowed to proceed.

## Constitution

Every PR that touches a constitution-relevant area must check the matching box in the PR template
and briefly note how the gate is satisfied. See
[.specify/memory/constitution.md](.specify/memory/constitution.md) for the full principle text and
[specs/001-yii-led-experience/tasks.md](specs/001-yii-led-experience/tasks.md) §4 for the
requirement-to-task traceability matrix.
