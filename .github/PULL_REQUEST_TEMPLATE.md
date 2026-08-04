## Summary

<!-- What does this PR do and why? Link the feature spec section(s) if relevant. -->

## Task(s)

- Task ID(s): T0XX
- Phase: PH#
- Branch type: task | phase

## Implementer declaration (required)

- Implemented by: <name, or `agent:<Model Name (Provider)>`>
- Model provider family: OpenAI | Anthropic | Google | Human | Other: \_\_\_

> Phase PRs into `main` are reviewed by the `code-review` agent run on a **different provider**
> than every implementer listed above (see [CONTRIBUTING.md](../CONTRIBUTING.md)).

## Local verification (required — this project runs no hosted CI)

This repo intentionally has no GitHub Actions / hosted CI (avoids consuming Actions budget). Run
these locally and paste the result:

- [ ] `pnpm run verify` (typecheck + lint + format check + unit tests + build) — green
- [ ] `pnpm --filter experience run test:e2e` (Playwright) — green, if this PR touches `apps/experience`
- [ ] Any task-specific tests listed in the task's **Tests** field in `tasks.md` — green

```text
<paste relevant command output or summary here>
```

## Constitution gates touched

- [ ] I. State legality, priority, interruption, recovery
- [ ] II. Sequence orchestration (opening/final/cancel/replay/reset/timing/media sync)
- [ ] III. Animation/Cesium integration — no competing writers/tickers/stale callbacks
- [ ] IV. Protocol independence, validation, dedup, simulator coverage
- [ ] V. Offline/event-local operation + external-dependency fallbacks
- [ ] VI. Content validation, approval, traceability, rights, versioning, rollback
- [ ] VII. Legibility, non-colour meaning, safe motion, final-frame behaviour
- [ ] VIII. Performance budgets, memory stability, cleanup, endurance
- [ ] IX. Operator diagnostics, public/operator separation, secure inputs, non-blocking analytics
- [ ] X. Verification evidence for every affected acceptance criterion
- [ ] N/A — infra/tooling only, no constitution gate applies (explain why below)

<!-- If any gate above is touched, briefly say how it's satisfied and where the evidence lives. -->

## tasks.md registry updated?

- [ ] Owner / Branch / PR / status fields updated for every task in scope
- [ ] Phase header's `Phase PR / Implementer model(s) / Review model / Verdict` line updated (phase PRs only)

## Review requirements

- **Task PR**: green local verification (above) + one review (human or agent).
- **Phase PR into `main`**: green local verification + **APPROVE verdict from the `code-review`
  agent run on a model from a different provider than every implementer of the phase's tasks**.
