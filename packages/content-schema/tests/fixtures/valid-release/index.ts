import type {
  Category,
  ContentOption,
  ContentSequence,
  DraftAnalysis,
  EditorialOption,
  MediaAsset,
  Project,
  Release,
  Submission,
  VoiceoverAsset,
} from '../../../src/index.js';

// Builder functions for a fully schema-valid release (T007 "valid full-release fixture").
// Programmatic builders (rather than 36 hand-authored JSON files) keep the fixture DRY while
// still exercising every nested schema at full depth; T018 owns the real on-disk sample release.

export function createValidMediaAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'media-hero-image',
    kind: 'image',
    file: 'projects/proj-01/media/hero.jpg',
    rights: { holder: 'YII Programme', status: 'approved' },
    aiGenerated: false,
    ...overrides,
  };
}

export function createValidVoiceover(overrides: Partial<VoiceoverAsset> = {}): VoiceoverAsset {
  return {
    file: 'projects/proj-01/voiceover/overview.opus',
    scriptVersion: 'v1',
    voiceId: 'voice-01',
    durationMs: 30000,
    captionText: [{ type: 'paragraph', text: 'Overview narration caption.' }],
    ...overrides,
  };
}

export function createValidSequence(overrides: Partial<ContentSequence> = {}): ContentSequence {
  return {
    openingState: { id: 'opening', elements: [{ target: 'hero', properties: { opacity: 1 } }] },
    timebase: 'voiceover',
    syncToleranceMs: 200,
    beats: [
      { type: 'text', startTime: 0, duration: 4000 },
      { type: 'media', startTime: 4000, duration: 8000, target: 'media-hero-image' },
    ],
    finalFrame: { id: 'final', elements: [{ target: 'hero', properties: { opacity: 1 } }] },
    interruptionExit: 'fade-out',
    ...overrides,
  };
}

export function createValidContentOption(
  position: 1 | 2 | 3 | 4 | 5,
  overrides: Partial<ContentOption> = {},
): ContentOption {
  return {
    position,
    title: position === 1 ? 'Overview' : `Option ${position}`,
    formats: ['overview-hero'],
    sequence: createValidSequence(),
    displayText: [{ type: 'paragraph', text: 'Display text.' }],
    voiceover: createValidVoiceover(),
    mediaRefs: [createValidMediaAsset()],
    available: true,
    ...overrides,
  };
}

export function createValidProject(
  id: string,
  categoryId: string,
  overrides: Partial<Project> = {},
): Project {
  return {
    id,
    name: `Project ${id}`,
    organisation: 'Example Org',
    country: 'Wonderland',
    location: 'Capital City',
    categoryId,
    marker: { lat: 10, lon: 20 },
    geographicFraming: {
      scopeType: 'city',
      landingCamera: {
        destination: { lat: 10, lon: 20, height: 500 },
        orientation: { heading: 0, pitch: -30, roll: 0 },
        range: 1000,
      },
      previewEmphasis: { markerScale: 1.5 },
      tileTier: 'photorealistic',
      canvasTreatment: { darken: 0.2 },
    },
    contentOptions: [createValidContentOption(1)],
    inactivePositions: [2, 3, 4, 5],
    ...overrides,
  };
}

export function createValidCategory(
  id: string,
  order: number,
  projectIds: [string, string, string],
  overrides: Partial<Category> = {},
): Category {
  return {
    id,
    name: `Category ${order}`,
    order,
    projectIds,
    ...overrides,
  };
}

/** A full 12-category × 3-project release (data-model.md §4 invariant 1 / QR-005). */
export function createValidRelease(): Release {
  const categories: Category[] = [];
  for (let i = 1; i <= 12; i += 1) {
    const projectIds: [string, string, string] = [
      `cat${i}-proj-a`,
      `cat${i}-proj-b`,
      `cat${i}-proj-c`,
    ];
    categories.push(createValidCategory(`cat-${i}`, i, projectIds));
  }
  return {
    schemaVersion: 1,
    version: '1.0.0',
    contentHash: 'sha256-fixture',
    createdAt: '2026-08-03T12:00:00.000Z',
    approvedBy: 'editor@example.com',
    frozen: false,
    categories,
  };
}

/** One fully-populated project per category-1's first project id, for project-schema tests. */
export function createValidReleaseProjects(release: Release): Project[] {
  return release.categories.flatMap((category) =>
    category.projectIds.map((projectId) => createValidProject(projectId, category.id)),
  );
}

export function createValidSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: 'submission-01',
    rawFields: { name: 'Project X' },
    passages: [{ id: 'p1', field: 'description', text: 'Reduced flooding by 40%.' }],
    attachments: [],
    ingestedAt: '2026-08-03T12:00:00.000Z',
    revision: 1,
    ...overrides,
  };
}

export function createValidDraftAnalysis(overrides: Partial<DraftAnalysis> = {}): DraftAnalysis {
  const sourceLinks = [{ submissionId: 'submission-01', passageId: 'p1' }];
  return {
    submissionId: 'submission-01',
    summary: { text: 'Summary.', sourceLinks },
    purpose: { text: 'Purpose.', sourceLinks },
    geographicScope: { text: 'City-wide.', sourceLinks },
    challenges: [{ text: 'Challenge.', sourceLinks }],
    approaches: [{ text: 'Approach.', sourceLinks }],
    outcomes: [{ text: 'Outcome.', sourceLinks }],
    quantResults: [{ label: 'Flood reduction', value: '40%', verified: true, sourceLinks }],
    themes: [{ text: 'Resilience.', sourceLinks }],
    needsVerification: [],
    missingInfo: [],
    producedBy: 'api-llm:openai:gpt-5',
    status: 'draft',
    ...overrides,
  };
}

export function createValidEditorialOption(
  overrides: Partial<EditorialOption> = {},
): EditorialOption {
  const sourceLinks = [{ submissionId: 'submission-01', passageId: 'p1' }];
  return {
    projectId: 'cat1-proj-a',
    position: 1,
    title: 'Overview',
    rationale: 'Strong candidate for the overview slot.',
    sourceLinks,
    draftDisplayText: 'Draft display text.',
    draftVoiceoverText: 'Draft voiceover script.',
    mediaRecommendations: [],
    missingAssets: [],
    reviewState: 'approved',
    audit: [],
    ...overrides,
  };
}
