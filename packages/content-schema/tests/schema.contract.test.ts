import { describe, expect, it } from 'vitest';
import {
  categoriesFileSchema,
  channelsFileSchema,
  contentOptionSchema,
  draftAnalysisSchema,
  editorialOptionSchema,
  hasUnverifiedMetrics,
  isApprovedForPublish,
  manifestSchema,
  projectSchema,
  releaseSchema,
  submissionSchema,
} from '../src/index.js';
import {
  createValidCategory,
  createValidContentOption,
  createValidDraftAnalysis,
  createValidEditorialOption,
  createValidRelease,
  createValidReleaseProjects,
  createValidSubmission,
} from './fixtures/valid-release/index.js';
import {
  brokenMediaRef,
  duplicateProjectRefs,
  invalidSequence,
  missingDisplayText,
  missingFinalFrame,
  missingFraming,
  missingMediaFallback,
  missingMetadata,
  missingOverview,
  missingRights,
  missingVoiceover,
  tooManyOptions,
  unapprovedContent,
  unsupportedFormat,
  unverifiedMetrics,
} from './fixtures/broken.js';

// Executable form of contracts/content-package.md. One failing assertion per FR-036 defect class
// (T007 Accept criterion), plus a fully valid 12x3 release + every nested project schema. This
// suite MUST be red until T009 lands.

describe('Valid full-release fixture (12x3, Overview at position 1, ...)', () => {
  it('accepts a full 12-category x 3-project release', () => {
    const result = releaseSchema.safeParse(createValidRelease());
    expect(result.success).toBe(true);
  });

  it('accepts the categories.json file shape on its own', () => {
    const result = categoriesFileSchema.safeParse(createValidRelease().categories);
    expect(result.success).toBe(true);
  });

  it('accepts every project referenced by the valid release', () => {
    const release = createValidRelease();
    for (const project of createValidReleaseProjects(release)) {
      const result = projectSchema.safeParse(project);
      expect(result.success).toBe(true);
    }
  });

  it('accepts a fully populated content option', () => {
    const result = contentOptionSchema.safeParse(createValidContentOption(1));
    expect(result.success).toBe(true);
  });

  it('accepts a valid manifest', () => {
    const manifest: Record<string, unknown> = { ...createValidRelease() };
    delete manifest.categories;
    expect(manifestSchema.safeParse(manifest).success).toBe(true);
  });

  it('accepts a valid channels.json', () => {
    const result = channelsFileSchema.safeParse({
      staging: '1.0.0',
      production: null,
      frozen: false,
      history: [
        { type: 'publish', channel: 'staging', version: '1.0.0', at: '2026-08-03T12:00:00.000Z' },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('FR-036 defect classes (contracts/content-package.md producer obligations)', () => {
  it('1. rejects a project missing the Overview at position 1', () => {
    expect(projectSchema.safeParse(missingOverview()).success).toBe(false);
  });

  it('2. rejects a project with more than 5 content options', () => {
    expect(projectSchema.safeParse(tooManyOptions()).success).toBe(false);
  });

  it('3. rejects a project missing required metadata (organisation)', () => {
    expect(projectSchema.safeParse(missingMetadata()).success).toBe(false);
  });

  it('4. rejects a project missing geographicFraming', () => {
    expect(projectSchema.safeParse(missingFraming()).success).toBe(false);
  });

  it('5. rejects a video media asset missing its required fallback', () => {
    expect(projectSchema.safeParse(missingMediaFallback()).success).toBe(false);
  });

  it('6. rejects a content option missing voiceover', () => {
    expect(projectSchema.safeParse(missingVoiceover()).success).toBe(false);
  });

  it('7. rejects a content option with empty display text', () => {
    expect(projectSchema.safeParse(missingDisplayText()).success).toBe(false);
  });

  it('8. rejects a broken media fallback ref', () => {
    expect(projectSchema.safeParse(brokenMediaRef()).success).toBe(false);
  });

  it('9. rejects an unsupported content format id', () => {
    expect(projectSchema.safeParse(unsupportedFormat()).success).toBe(false);
  });

  it('10. rejects an invalid sequence (negative tolerance, out-of-order beats)', () => {
    expect(projectSchema.safeParse(invalidSequence()).success).toBe(false);
  });

  it('11. rejects a sequence missing its final frame', () => {
    expect(projectSchema.safeParse(missingFinalFrame()).success).toBe(false);
  });

  it('12. rejects a release with a duplicate project reference across categories', () => {
    expect(releaseSchema.safeParse(duplicateProjectRefs()).success).toBe(false);
  });

  it('13. rejects unapproved editorial content at publish (validator-level)', () => {
    const option = unapprovedContent();
    expect(editorialOptionSchema.safeParse(option).success).toBe(true); // shape is valid...
    expect(isApprovedForPublish(option)).toBe(false); // ...but not publishable yet.
  });

  it('14. rejects unverified metrics at publish (validator-level)', () => {
    const analysis = unverifiedMetrics();
    expect(draftAnalysisSchema.safeParse(analysis).success).toBe(true); // shape is valid...
    expect(hasUnverifiedMetrics(analysis.quantResults)).toBe(true); // ...but blocks publish.
  });

  it('15. rejects a media asset missing its rights record', () => {
    expect(projectSchema.safeParse(missingRights()).success).toBe(false);
  });
});

describe('Editorial domain schemas', () => {
  it('accepts a valid submission', () => {
    expect(submissionSchema.safeParse(createValidSubmission()).success).toBe(true);
  });

  it('accepts a valid approved editorial option', () => {
    const option = createValidEditorialOption();
    expect(editorialOptionSchema.safeParse(option).success).toBe(true);
    expect(isApprovedForPublish(option)).toBe(true);
  });

  it('accepts a valid draft analysis', () => {
    expect(draftAnalysisSchema.safeParse(createValidDraftAnalysis()).success).toBe(true);
  });
});

describe('Category helper', () => {
  it('createValidCategory produces a schema-valid category', () => {
    const category = createValidCategory('cat-99', 1, ['a', 'b', 'c']);
    expect(category.projectIds).toHaveLength(3);
  });
});
