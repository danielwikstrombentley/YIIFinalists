import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const DRAFTING_PROVIDERS = ['openai', 'anthropic', 'google'] as const;
export type DraftingProviderName = (typeof DRAFTING_PROVIDERS)[number];

export interface PipelineDraftingConfig {
  provider: DraftingProviderName;
  model: string;
}

interface PipelineConfigFile {
  drafting?: {
    provider?: unknown;
    models?: Partial<Record<DraftingProviderName, unknown>>;
  };
}

const DEFAULT_MODELS: Record<DraftingProviderName, string> = {
  openai: 'gpt-5-mini',
  anthropic: 'claude-sonnet-4-5',
  google: 'gemini-2.5-pro',
};

function isProvider(value: unknown): value is DraftingProviderName {
  return DRAFTING_PROVIDERS.includes(value as DraftingProviderName);
}

export function parsePipelineDraftingConfig(
  input: PipelineConfigFile = {},
  env: NodeJS.ProcessEnv = process.env,
): PipelineDraftingConfig {
  const configuredProvider = env.PIPELINE_LLM_PROVIDER ?? input.drafting?.provider ?? 'openai';
  if (!isProvider(configuredProvider)) {
    throw new Error(
      `Unsupported drafting provider "${String(configuredProvider)}". Expected ${DRAFTING_PROVIDERS.join(', ')}.`,
    );
  }
  const configuredModel =
    env.PIPELINE_LLM_MODEL ??
    input.drafting?.models?.[configuredProvider] ??
    DEFAULT_MODELS[configuredProvider];
  if (typeof configuredModel !== 'string' || configuredModel.trim() === '') {
    throw new Error(`No model is configured for drafting provider "${configuredProvider}".`);
  }
  return { provider: configuredProvider, model: configuredModel };
}

export async function loadPipelineDraftingConfig(
  options: {
    configFile?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<PipelineDraftingConfig> {
  const configFile = resolve(options.configFile ?? 'pipeline.config.json');
  let input: PipelineConfigFile = {};
  try {
    input = JSON.parse(await readFile(configFile, 'utf8')) as PipelineConfigFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return parsePipelineDraftingConfig(input, options.env);
}

export function apiKeyEnvironmentName(provider: DraftingProviderName): string {
  switch (provider) {
    case 'openai':
      return 'OPENAI_API_KEY';
    case 'anthropic':
      return 'ANTHROPIC_API_KEY';
    case 'google':
      return 'GOOGLE_GENERATIVE_AI_API_KEY';
  }
}
