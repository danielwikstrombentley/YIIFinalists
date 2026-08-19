import type {
  DraftAnalysisContent,
  EditorialOption,
  ProposedOptionContent,
  Submission,
} from '@yii/content-schema';

export const FIXED_NOW = '2026-08-19T10:00:00.000Z';
export const SOURCE_LINK = { submissionId: 'project-one', passageId: 'description-p-1' } as const;

export function createSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: 'project-one',
    rawFields: {
      name: 'River Commons',
      organisation: 'Example Studio',
      category: 'Urban Design',
      country: 'Sweden',
      location: 'Gothenburg',
    },
    passages: [
      {
        id: SOURCE_LINK.passageId,
        field: 'description',
        text: 'The project reconnects three neighbourhoods along the river.',
      },
    ],
    attachments: [],
    ingestedAt: FIXED_NOW,
    revision: 1,
    ...overrides,
  };
}

export function createAnalysisContent(
  overrides: Partial<DraftAnalysisContent> = {},
): DraftAnalysisContent {
  const sourced = (text: string) => ({ text, sourceLinks: [SOURCE_LINK] });
  return {
    submissionId: 'project-one',
    summary: sourced('A riverfront public-realm project.'),
    purpose: sourced('Reconnect neighbourhoods.'),
    geographicScope: sourced('Three riverfront neighbourhoods.'),
    challenges: [sourced('The river divides the district.')],
    approaches: [sourced('A connected public-realm network.')],
    outcomes: [sourced('Continuous walking routes.')],
    quantResults: [],
    themes: [sourced('Connectivity')],
    needsVerification: [],
    missingInfo: ['Confirm final completion date.'],
    ...overrides,
  };
}

export function createOptionContent(
  overrides: Partial<ProposedOptionContent> = {},
): ProposedOptionContent {
  const sourced = (text: string) => ({ text, sourceLinks: [SOURCE_LINK] });
  return {
    projectId: 'project-one',
    position: 1,
    title: sourced('Project Overview'),
    rationale: sourced('Introduces the project and its purpose.'),
    draftDisplayText: sourced('Three neighbourhoods, reconnected.'),
    draftVoiceoverText: sourced('Along the river, three neighbourhoods reconnect.'),
    formatRecommendation: 'text-image',
    mediaRecommendations: [sourced('Use the submitted riverfront overview image.')],
    missingAssets: [{ description: 'High-resolution riverfront overview image.' }],
    ...overrides,
  };
}

export function createEditorialOption(overrides: Partial<EditorialOption> = {}): EditorialOption {
  const option = createOptionContent();
  return {
    ...option,
    sourceLinks: [SOURCE_LINK],
    displayTextVersion: 1,
    voiceoverTextVersion: 1,
    reviewState: 'draft',
    producedBy: 'api-llm:openai:gpt-5.5',
    promptVersion: 'propose.v1',
    audit: [],
    ...overrides,
  };
}
