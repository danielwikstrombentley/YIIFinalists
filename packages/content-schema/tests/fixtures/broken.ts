import type { ContentOption, EditorialOption, Project, Release } from '../../src/index.js';
import {
  createValidCategory,
  createValidContentOption,
  createValidDraftAnalysis,
  createValidEditorialOption,
  createValidMediaAsset,
  createValidProject,
  createValidRelease,
} from './valid-release/index.js';

// One broken fixture per FR-036 defect class named in contracts/content-package.md producer
// obligations (T007 Accept criterion). Each function returns a value that MUST fail validation
// against the corresponding content-schema schema/helper.

/** Shallow-omits one key, used to build "missing required field" fixtures without an unused var. */
function omit<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const clone: Partial<T> = { ...value };
  delete clone[key];
  return clone as Omit<T, K>;
}

/** 1. missing Overview — no content option at position 1. */
export function missingOverview(): Project {
  return createValidProject('proj-x', 'cat-1', { contentOptions: [createValidContentOption(2)] });
}

/** 2. >5 options — six content options on one project. */
export function tooManyOptions(): Project {
  const options: ContentOption[] = [1, 2, 3, 4, 5].map((p) =>
    createValidContentOption(p as 1 | 2 | 3 | 4 | 5),
  );
  return createValidProject('proj-x', 'cat-1', {
    // Cast through unknown: the valid type only allows 5 positions: 1-5; this fixture
    // deliberately violates the max(5) array bound by duplicating position 5 as a 6th entry.
    contentOptions: [...options, createValidContentOption(5)],
  });
}

/** 3. missing metadata — required project fields (organisation) absent. */
export function missingMetadata(): unknown {
  return omit(createValidProject('proj-x', 'cat-1'), 'organisation');
}

/** 4. missing framing — geographicFraming absent. */
export function missingFraming(): unknown {
  return omit(createValidProject('proj-x', 'cat-1'), 'geographicFraming');
}

/** 5. missing media — a video asset without the fallback data-model.md requires. */
export function missingMediaFallback(): Project {
  return createValidProject('proj-x', 'cat-1', {
    contentOptions: [
      createValidContentOption(1, {
        mediaRefs: [createValidMediaAsset({ id: 'clip', kind: 'video', file: 'clip.mp4' })],
      }),
    ],
  });
}

/** 6. missing voiceover — content option without a voiceover asset. */
export function missingVoiceover(): unknown {
  const withoutVoiceover = omit(createValidContentOption(1), 'voiceover');
  return createValidProject('proj-x', 'cat-1', {
    contentOptions: [withoutVoiceover as unknown as ContentOption],
  });
}

/** 7. missing display text — content option with an empty displayText array. */
export function missingDisplayText(): Project {
  return createValidProject('proj-x', 'cat-1', {
    contentOptions: [createValidContentOption(1, { displayText: [] })],
  });
}

/** 8. broken refs — a media fallback id that does not resolve within the option's mediaRefs. */
export function brokenMediaRef(): Project {
  return createValidProject('proj-x', 'cat-1', {
    contentOptions: [
      createValidContentOption(1, {
        mediaRefs: [
          createValidMediaAsset({
            id: 'clip',
            kind: 'video',
            file: 'clip.mp4',
            fallback: 'does-not-exist',
          }),
        ],
      }),
    ],
  });
}

/** 9. unsupported formats — a format id outside the known format-library registry. */
export function unsupportedFormat(): Project {
  return createValidProject('proj-x', 'cat-1', {
    contentOptions: [
      createValidContentOption(1, {
        formats: ['not-a-real-format' as ContentOption['formats'][number]],
      }),
    ],
  });
}

/** 10. invalid sequence — a negative syncTolerance and out-of-order beats. */
export function invalidSequence(): Project {
  return createValidProject('proj-x', 'cat-1', {
    contentOptions: [
      createValidContentOption(1, {
        sequence: {
          openingState: { id: 'opening', elements: [{ target: 'hero', properties: {} }] },
          timebase: 'timeline',
          syncToleranceMs: -50,
          beats: [
            { type: 'text', startTime: 5000, duration: 1000 },
            { type: 'media', startTime: 1000, duration: 1000 },
          ],
          finalFrame: { id: 'final', elements: [{ target: 'hero', properties: {} }] },
          interruptionExit: 'fade-out',
        },
      }),
    ],
  });
}

/** 11. missing final frame — sequence without a finalFrame. */
export function missingFinalFrame(): unknown {
  const option = createValidContentOption(1);
  const sequenceWithoutFinalFrame = omit(option.sequence, 'finalFrame');
  return createValidProject('proj-x', 'cat-1', {
    contentOptions: [
      { ...option, sequence: sequenceWithoutFinalFrame as unknown as typeof option.sequence },
    ],
  });
}

/** 12. duplicate project refs — the same project id referenced by two categories. */
export function duplicateProjectRefs(): Release {
  const release = createValidRelease();
  const duplicatedId = release.categories[0]!.projectIds[0]!;
  release.categories[1] = createValidCategory('cat-2', 2, [
    duplicatedId,
    'cat2-proj-b',
    'cat2-proj-c',
  ]);
  return release;
}

/** 13. unapproved content — an editorial option still in review, not approved. */
export function unapprovedContent(): EditorialOption {
  return createValidEditorialOption({ reviewState: 'in-review' });
}

/** 14. unverified metrics — a draft analysis quantitative claim not yet verified. */
export function unverifiedMetrics() {
  return createValidDraftAnalysis({
    quantResults: [
      {
        label: 'Flood reduction',
        value: '40%',
        verified: false,
        sourceLinks: [{ submissionId: 'submission-01', passageId: 'p1' }],
      },
    ],
  });
}

/** 15. missing rights — a media asset without a rights record. */
export function missingRights(): unknown {
  const withoutRights = omit(createValidMediaAsset(), 'rights');
  return createValidProject('proj-x', 'cat-1', {
    contentOptions: [createValidContentOption(1, { mediaRefs: [withoutRights as never] })],
  });
}
