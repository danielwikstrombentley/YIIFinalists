# Contract: LLM Drafting Provider (Content Pipeline)

**Boundary**: pipeline `analyze/` stage → `DraftingProvider` interface → interchangeable drivers.
Prep-time only — the public runtime has no LLM dependency and no driver code is bundled into
`apps/experience` (Principle IV). All outputs are draft-status and schema-validated; nothing
reaches a release without human approval (Principle VII).

## Interface

```ts
interface DraftingProvider {
  analyzeSubmission(input: SubmissionBundle): Promise<Draft<DraftAnalysis>>;
  proposeOptions(input: SubmissionBundle & { analysis: DraftAnalysis }): Promise<Draft<ProposedOption[]>>; // ≤ 4 + Overview; fewer over filler (FR-032)
  assistRewrite(input: RewriteRequest): Promise<Draft<TextRevision>>; // editor-invoked only
}
// Draft<T> = { data: T; producedBy: string; model?: string; promptVersion: string; createdAt: string; status: "draft" }
```

Outputs are validated against Zod schemas shared with `packages/content-schema` (DraftAnalysis,
ProposedOption). Validation failure ⇒ the draft is rejected and logged; drivers never write
directly into editorial records.

## Driver 1: `api-llm` (Vercel AI SDK)

- Uses `generateObject` with the shared Zod schemas for structured output.
- Provider selected by config: `openai` (`@ai-sdk/openai`), `anthropic` (`@ai-sdk/anthropic`),
  `google` (`@ai-sdk/google`); model id per provider in `pipeline.config`.
- API keys via pipeline-side environment only; never committed, never present in any runtime
  bundle or content package.
- Prompts are versioned files in `analyze/prompts/`; `promptVersion` recorded on every draft.

## Driver 2: `copilot-agent` (GitHub Copilot workflow)

- The pipeline emits a self-contained **drafting workspace** per submission:
  `work/<projectId>/drafting/` containing the normalised submission, source passages with anchor
  ids, the JSON output schema, and an instructions file.
- A GitHub Copilot agent session (using available Copilot credits) is run against that folder and
  writes `analysis.draft.json` / `options.draft.json` per the schema.
- `pipeline ingest-drafts <projectId>` validates the files with the same Zod schemas and imports
  them with `producedBy: "copilot-agent"` — from that point the flow is identical to driver 1.

## Common obligations (both drivers)

1. Every claim, metric, and recommendation in output MUST reference source passage ids from the
   submission bundle; outputs with unreferenced claims fail validation (SC-012).
2. Drafts land in `reviewState: draft` and can only advance through the editorial lifecycle in
   [data-model.md](../data-model.md) §2 — approval is exclusively human.
3. Weak submissions: propose fewer, meaningful options; never pad to five (FR-032).
4. Provider/model/prompt provenance is retained on the draft for audit (FR-034).
5. Submission content is the only material sent to providers; no credentials, no unrelated
   project data in prompts.
