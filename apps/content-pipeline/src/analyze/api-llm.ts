import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import {
  draftAnalysisContentSchema,
  draftAnalysisEnvelopeSchema,
  proposedOptionContentsSchema,
  proposedOptionsEnvelopeSchema,
  textRevisionContentSchema,
  textRevisionEnvelopeSchema,
  type DraftAnalysisContent,
  type ProducedBy,
  type ProposedOptionContent,
  type TextRevisionContent,
} from '@yii/content-schema';
import { generateObject as vercelGenerateObject, type LanguageModel } from 'ai';
import { z } from 'zod';
import {
  apiKeyEnvironmentName,
  type PipelineDraftingConfig,
  type DraftingProviderName,
} from './config.ts';
import {
  assertSubmissionReferences,
  DraftValidationError,
  type Draft,
  type DraftingProvider,
  type RewriteRequest,
  type SubmissionBundle,
} from './provider.ts';

export const ANALYZE_PROMPT_VERSION = 'analyze.v1';
export const PROPOSE_PROMPT_VERSION = 'propose.v1';
export const REWRITE_PROMPT_VERSION = 'rewrite.v1';

export interface DraftPrompts {
  analyze: string;
  propose: string;
  rewrite: string;
}

interface GenerateRequest {
  model: LanguageModel;
  schema: z.ZodType;
  schemaName: string;
  system: string;
  prompt: string;
}

export type GenerateStructuredObject = (request: GenerateRequest) => Promise<{ object: unknown }>;

export interface DraftingLogger {
  error(event: {
    event: 'draft-validation-rejected';
    operation: 'analyze' | 'propose' | 'rewrite';
    submissionId: string;
    message: string;
  }): void;
}

const defaultLogger: DraftingLogger = {
  error(event) {
    console.error(`[content-pipeline] ${event.event}: ${JSON.stringify(event)}`);
  },
};

async function defaultGenerateObject(request: GenerateRequest): Promise<{ object: unknown }> {
  const result = await vercelGenerateObject({
    model: request.model,
    schema: request.schema,
    schemaName: request.schemaName,
    system: request.system,
    prompt: request.prompt,
  });
  return { object: result.object };
}

function requireApiKey(provider: DraftingProviderName, env: NodeJS.ProcessEnv): string {
  const variable = apiKeyEnvironmentName(provider);
  const value = env[variable];
  if (!value) throw new Error(`${variable} is required for the configured drafting provider.`);
  return value;
}

function createConfiguredModel(
  config: PipelineDraftingConfig,
  env: NodeJS.ProcessEnv,
): LanguageModel {
  const apiKey = requireApiKey(config.provider, env);
  switch (config.provider) {
    case 'openai':
      return createOpenAI({ apiKey })(config.model);
    case 'anthropic':
      return createAnthropic({ apiKey })(config.model);
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(config.model);
  }
}

function producedBy(config: PipelineDraftingConfig): ProducedBy {
  const provenance = `api-llm:${config.provider}:${config.model}`;
  if (!/^api-llm:[a-z0-9_-]+:[a-zA-Z0-9._-]+$/.test(provenance)) {
    throw new Error(
      `Configured model id "${config.model}" cannot be represented in draft provenance.`,
    );
  }
  return provenance as ProducedBy;
}

function submissionPrompt(input: SubmissionBundle): string {
  return JSON.stringify({ submission: input.submission }, null, 2);
}

function rejected(
  error: unknown,
  operation: 'analyze' | 'propose' | 'rewrite',
  submissionId: string,
  logger: DraftingLogger,
): never {
  const validationError =
    error instanceof DraftValidationError
      ? error
      : new DraftValidationError(`Invalid ${operation} draft output.`, error);
  logger.error({
    event: 'draft-validation-rejected',
    operation,
    submissionId,
    message: validationError.message,
  });
  throw validationError;
}

export class ApiLlmDraftingProvider implements DraftingProvider {
  readonly #config: PipelineDraftingConfig;
  readonly #generateObject: GenerateStructuredObject;
  readonly #model: LanguageModel;
  readonly #prompts: DraftPrompts;
  readonly #clock: () => Date;
  readonly #logger: DraftingLogger;

  constructor(options: {
    config: PipelineDraftingConfig;
    prompts: DraftPrompts;
    generateObject?: GenerateStructuredObject;
    model?: LanguageModel;
    env?: NodeJS.ProcessEnv;
    clock?: () => Date;
    logger?: DraftingLogger;
  }) {
    this.#config = options.config;
    this.#generateObject = options.generateObject ?? defaultGenerateObject;
    this.#model =
      options.model ??
      (options.generateObject
        ? (options.config.model as LanguageModel)
        : createConfiguredModel(options.config, options.env ?? process.env));
    this.#prompts = options.prompts;
    this.#clock = options.clock ?? (() => new Date());
    this.#logger = options.logger ?? defaultLogger;
  }

  async analyzeSubmission(input: SubmissionBundle): Promise<Draft<DraftAnalysisContent>> {
    try {
      const result = await this.#generateObject({
        model: this.#model,
        schema: draftAnalysisContentSchema,
        schemaName: 'yii_draft_analysis',
        system: this.#prompts.analyze,
        prompt: submissionPrompt(input),
      });
      const data = draftAnalysisContentSchema.parse(result.object);
      if (data.submissionId !== input.submission.id) {
        throw new DraftValidationError('Draft analysis references the wrong submission.');
      }
      assertSubmissionReferences(data, input.submission);
      return draftAnalysisEnvelopeSchema.parse({
        data,
        producedBy: producedBy(this.#config),
        model: this.#config.model,
        promptVersion: ANALYZE_PROMPT_VERSION,
        createdAt: this.#clock().toISOString(),
        status: 'draft',
      });
    } catch (error) {
      return rejected(error, 'analyze', input.submission.id, this.#logger);
    }
  }

  async proposeOptions(
    input: SubmissionBundle & { analysis: DraftAnalysisContent },
  ): Promise<Draft<ProposedOptionContent[]>> {
    try {
      const schema = proposedOptionContentsSchema;
      const result = await this.#generateObject({
        model: this.#model,
        schema,
        schemaName: 'yii_proposed_options',
        system: this.#prompts.propose,
        prompt: JSON.stringify({ submission: input.submission, analysis: input.analysis }, null, 2),
      });
      const data = schema.parse(result.object);
      if (data.some((option) => option.projectId !== input.submission.id)) {
        throw new DraftValidationError('Proposed options reference the wrong project.');
      }
      assertSubmissionReferences(data, input.submission);
      return proposedOptionsEnvelopeSchema.parse({
        data,
        producedBy: producedBy(this.#config),
        model: this.#config.model,
        promptVersion: PROPOSE_PROMPT_VERSION,
        createdAt: this.#clock().toISOString(),
        status: 'draft',
      });
    } catch (error) {
      return rejected(error, 'propose', input.submission.id, this.#logger);
    }
  }

  async assistRewrite(input: RewriteRequest): Promise<Draft<TextRevisionContent>> {
    try {
      const result = await this.#generateObject({
        model: this.#model,
        schema: textRevisionContentSchema,
        schemaName: 'yii_text_revision',
        system: this.#prompts.rewrite,
        prompt: JSON.stringify(
          {
            submission: input.submission,
            rewrite: { field: input.field, text: input.text, instruction: input.instruction },
          },
          null,
          2,
        ),
      });
      const data = textRevisionContentSchema.parse(result.object);
      if (data.field !== input.field) {
        throw new DraftValidationError('Rewrite output changed the requested editorial field.');
      }
      assertSubmissionReferences(data, input.submission);
      return textRevisionEnvelopeSchema.parse({
        data,
        producedBy: producedBy(this.#config),
        model: this.#config.model,
        promptVersion: REWRITE_PROMPT_VERSION,
        createdAt: this.#clock().toISOString(),
        status: 'draft',
      });
    } catch (error) {
      return rejected(error, 'rewrite', input.submission.id, this.#logger);
    }
  }
}

export async function loadDraftPrompts(): Promise<DraftPrompts> {
  const promptsDir = join(dirname(fileURLToPath(import.meta.url)), 'prompts');
  const [analyze, propose, rewrite] = await Promise.all([
    readFile(join(promptsDir, `${ANALYZE_PROMPT_VERSION}.md`), 'utf8'),
    readFile(join(promptsDir, `${PROPOSE_PROMPT_VERSION}.md`), 'utf8'),
    readFile(join(promptsDir, `${REWRITE_PROMPT_VERSION}.md`), 'utf8'),
  ]);
  return { analyze, propose, rewrite };
}

export async function createApiLlmDraftingProvider(options: {
  config: PipelineDraftingConfig;
  env?: NodeJS.ProcessEnv;
  logger?: DraftingLogger;
}): Promise<ApiLlmDraftingProvider> {
  return new ApiLlmDraftingProvider({
    config: options.config,
    prompts: await loadDraftPrompts(),
    env: options.env,
    logger: options.logger,
  });
}
