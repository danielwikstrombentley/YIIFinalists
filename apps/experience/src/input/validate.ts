// Validation (contract boundary rule 1): schema-check happens via @yii/semantic-actions'
// `parseSemanticEnvelope`; this module adds the second half — checking payload refs against the
// active release data (unknown category/project/position => reject). `createReleaseRefValidator`
// below is what T020's runtime wiring uses once the release is loaded; the permissive default is
// kept only for tests/call sites that intentionally skip release-ref checking.

export interface ReleaseRefValidator {
  hasCategory(categoryId: string): boolean;
  hasProject(projectId: string): boolean;
  /** `projectId` is null when the input boundary has no active project set yet. */
  hasContentPosition(projectId: string | null, position: number): boolean;
}

/** Accepts every ref — for tests/call sites that intentionally skip release-ref checking. */
export const PERMISSIVE_RELEASE_VALIDATOR: ReleaseRefValidator = {
  hasCategory: () => true,
  hasProject: () => true,
  hasContentPosition: () => true,
};

/** Minimal shape `createReleaseRefValidator` needs from a loaded release's categories. */
export interface ReleaseRefSource {
  categories: readonly { id: string; projectIds: readonly string[] }[];
}

/** Minimal shape needed from a cached project to answer `hasContentPosition`. */
export interface ContentPositionSource {
  contentOptions: readonly { position: number }[];
}

/**
 * Builds a real `ReleaseRefValidator` backed by live loader state. Reads through the provided
 * getters at call time (not captured once), so it can safely be constructed before the release
 * has finished loading — every check rejects (returns false) until data is available, fail-closed
 * rather than fail-open (contract boundary rule 1 / untrusted input, QR-008).
 */
export function createReleaseRefValidator(
  getRelease: () => ReleaseRefSource | null,
  getCachedProject: (projectId: string) => ContentPositionSource | undefined,
): ReleaseRefValidator {
  return {
    hasCategory(categoryId) {
      return getRelease()?.categories.some((category) => category.id === categoryId) ?? false;
    },
    hasProject(projectId) {
      return (
        getRelease()?.categories.some((category) => category.projectIds.includes(projectId)) ??
        false
      );
    },
    hasContentPosition(projectId, position) {
      if (projectId === null) return false;
      return (
        getCachedProject(projectId)?.contentOptions.some(
          (option) => option.position === position,
        ) ?? false
      );
    },
  };
}
