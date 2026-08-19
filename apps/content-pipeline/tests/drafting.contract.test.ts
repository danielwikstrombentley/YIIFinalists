import { describe, expect, it, vi } from 'vitest';
import {
  draftAnalysisEnvelopeSchema,
  proposedOptionsEnvelopeSchema,
} from '@yii/content-schema';
import { ApiLlmDraftingProvider } from '../src/analyze/api-llm.ts';
import { DraftValidationError } from '../src/analyze/provider.ts';
import { createAnalysisContent, createOptionContent, createSubmission, FIXED_NOW } from './fixtures/editorial.ts';

const submission = createSubmission();

describe('T056 LLM drafting contract', () => {
  it('requires draft status plus complete provider/model/prompt provenance', () => {
    const result = draftAnalysisEnvelopeSchema.safeParse({
      data: createAnalysisContent(),
      producedBy: 'api-llm:openai:gpt-5.5',
      model: 'gpt-5.5',
      promptVersion: 'analyze.v1',
      createdAt: FIXED_NOW,
      status: 'draft',
    });

    expect(result.success).toBe(true);
    expect(
      draftAnalysisEnvelopeSchema.safeParse({
        ...(result.success ? result.data : {}),
        status: 'approved',
      }).success,
    ).toBe(false);
    expect(
      draftAnalysisEnvelopeSchema.safeParse({
        ...(result.success ? result.data : {}),
        promptVersion: '',
      }).success,
    ).toBe(false);
  });

  it('rejects options with an unreferenced visitor-facing claim', () => {
    const option = createOptionContent({
      draftDisplayText: { text: 'Unsupported claim.', sourceLinks: [] },
    });
    expect(
      proposedOptionsEnvelopeSchema.safeParse({
        data: [option],
        producedBy: 'copilot-agent',
        promptVersion: 'propose.v1',
        createdAt: FIXED_NOW,
        status: 'draft',
      }).success,
    ).toBe(false);
  });

  it('rejects syntactically valid references that do not exist in the source submission', async () => {
    const generateObject = vi
      .fn()
      .mockResolvedValueOnce({ object: createAnalysisContent() })
      .mockResolvedValueOnce({
        object: [
          createOptionContent({
            title: {
              text: 'Unsupported title',
              sourceLinks: [{ submissionId: 'project-one', passageId: 'missing-passage' }],
            },
          }),
        ],
      });
    const provider = new ApiLlmDraftingProvider({
      config: { provider: 'openai', model: 'gpt-5.5' },
      generateObject,
      prompts: { analyze: 'Analyze.', propose: 'Propose.', rewrite: 'Rewrite.' },
      clock: () => new Date(FIXED_NOW),
    });
    const analysis = await provider.analyzeSubmission({ submission });

    await expect(provider.proposeOptions({ submission, analysis: analysis.data })).rejects.toThrow(
      DraftValidationError,
    );
  });

  it('allows a weak submission to return fewer options and rejects padding beyond five', async () => {
    const meaningful = createOptionContent();
    const generateObject = vi.fn().mockResolvedValue({ object: [meaningful] });
    const provider = new ApiLlmDraftingProvider({
      config: { provider: 'openai', model: 'gpt-5.5' },
      generateObject,
      prompts: { analyze: 'Analyze.', propose: 'Propose.', rewrite: 'Rewrite.' },
      clock: () => new Date(FIXED_NOW),
    });

    await expect(
      provider.proposeOptions({ submission, analysis: createAnalysisContent() }),
    ).resolves.toMatchObject({ data: [meaningful], status: 'draft' });

    generateObject.mockResolvedValueOnce({ object: Array.from({ length: 6 }, () => meaningful) });
    await expect(
      provider.proposeOptions({ submission, analysis: createAnalysisContent() }),
    ).rejects.toThrow(DraftValidationError);
  });

  it('sends only the normalized submission and task-specific analysis to the model', async () => {
    const generateObject = vi.fn().mockResolvedValue({ object: createAnalysisContent() });
    const provider = new ApiLlmDraftingProvider({
      config: { provider: 'openai', model: 'gpt-5.5' },
      generateObject,
      prompts: { analyze: 'Analyze.', propose: 'Propose.', rewrite: 'Rewrite.' },
      clock: () => new Date(FIXED_NOW),
    });
    await provider.analyzeSubmission({ submission });

    const call = generateObject.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain('River Commons');
    expect(call.prompt).not.toContain('OPENAI_API_KEY');
    expect(call.prompt).not.toContain(process.cwd());
  });
});