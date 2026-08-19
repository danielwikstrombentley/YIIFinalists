import { describe, expect, it, vi } from 'vitest';
import { draftAnalysisEnvelopeSchema, proposedOptionsEnvelopeSchema } from '@yii/content-schema';
import { ApiLlmDraftingProvider } from '../src/analyze/api-llm.ts';
import { parsePipelineDraftingConfig } from '../src/analyze/config.ts';
import { DraftValidationError } from '../src/analyze/provider.ts';
import {
  createAnalysisContent,
  createOptionContent,
  createSubmission,
  FIXED_NOW,
} from './fixtures/editorial.ts';

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

  it('switches providers and models by configuration only', () => {
    expect(
      parsePipelineDraftingConfig(
        {
          drafting: {
            provider: 'anthropic',
            models: { anthropic: 'claude-sonnet-4-5' },
          },
        },
        {},
      ),
    ).toEqual({ provider: 'anthropic', model: 'claude-sonnet-4-5' });
    expect(
      parsePipelineDraftingConfig(
        { drafting: { provider: 'openai', models: { openai: 'gpt-5-mini' } } },
        { PIPELINE_LLM_PROVIDER: 'google', PIPELINE_LLM_MODEL: 'gemini-test' },
      ),
    ).toEqual({ provider: 'google', model: 'gemini-test' });
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

  it('requires the first proposal to be the Project Overview at position 1', () => {
    expect(
      proposedOptionsEnvelopeSchema.safeParse({
        data: [createOptionContent({ position: 2 })],
        producedBy: 'copilot-agent',
        promptVersion: 'propose.v1',
        createdAt: FIXED_NOW,
        status: 'draft',
      }).success,
    ).toBe(false);
  });

  it('returns valid analysis and options as draft-only API records with missing-asset requests', async () => {
    const generateObject = vi
      .fn()
      .mockResolvedValueOnce({ object: createAnalysisContent() })
      .mockResolvedValueOnce({ object: [createOptionContent()] });
    const provider = new ApiLlmDraftingProvider({
      config: { provider: 'google', model: 'gemini-test' },
      generateObject,
      prompts: { analyze: 'Analyze.', propose: 'Propose.', rewrite: 'Rewrite.' },
      clock: () => new Date(FIXED_NOW),
    });

    const analysis = await provider.analyzeSubmission({ submission });
    const options = await provider.proposeOptions({ submission, analysis: analysis.data });

    expect(analysis).toMatchObject({
      producedBy: 'api-llm:google:gemini-test',
      model: 'gemini-test',
      promptVersion: 'analyze.v1',
      status: 'draft',
    });
    expect(options.data[0]?.missingAssets).toEqual([
      { description: 'High-resolution riverfront overview image.' },
    ]);
    expect(options.status).toBe('draft');
  });

  it('rejects malformed structured model output and logs the rejection', async () => {
    const logger = { error: vi.fn() };
    const provider = new ApiLlmDraftingProvider({
      config: { provider: 'openai', model: 'gpt-5.5' },
      generateObject: vi.fn().mockResolvedValue({ object: { summary: 'not structured' } }),
      prompts: { analyze: 'Analyze.', propose: 'Propose.', rewrite: 'Rewrite.' },
      clock: () => new Date(FIXED_NOW),
      logger,
    });

    await expect(provider.analyzeSubmission({ submission })).rejects.toThrow(DraftValidationError);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'draft-validation-rejected', operation: 'analyze' }),
    );
  });

  it('rejects syntactically valid references that do not exist in the source submission', async () => {
    const logger = { error: vi.fn() };
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
      logger,
    });
    const analysis = await provider.analyzeSubmission({ submission });

    await expect(provider.proposeOptions({ submission, analysis: analysis.data })).rejects.toThrow(
      DraftValidationError,
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'draft-validation-rejected', operation: 'propose' }),
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

  it('supports editor-invoked source-traceable rewrites without crossing fields', async () => {
    const generateObject = vi.fn().mockResolvedValue({
      object: {
        field: 'displayText',
        text: {
          text: 'A concise riverfront line.',
          sourceLinks: [{ submissionId: 'project-one', passageId: 'description-p-1' }],
        },
      },
    });
    const provider = new ApiLlmDraftingProvider({
      config: { provider: 'anthropic', model: 'claude-test' },
      generateObject,
      prompts: { analyze: 'Analyze.', propose: 'Propose.', rewrite: 'Rewrite.' },
      clock: () => new Date(FIXED_NOW),
    });

    await expect(
      provider.assistRewrite({
        submission,
        field: 'displayText',
        text: 'Original line.',
        instruction: 'Make concise.',
      }),
    ).resolves.toMatchObject({
      producedBy: 'api-llm:anthropic:claude-test',
      promptVersion: 'rewrite.v1',
      status: 'draft',
    });
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
