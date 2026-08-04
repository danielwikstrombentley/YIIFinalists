// Validation (contract boundary rule 1): schema-check happens via @yii/semantic-actions'
// `parseSemanticEnvelope`; this module adds the second half — checking payload refs against the
// active release data (unknown category/project/position => reject). The runtime release isn't
// wired to the boundary until T017/T020 land, so this is an injectable interface; a permissive
// default (skip the check) is used when no validator is supplied, documented at the call site.

export interface ReleaseRefValidator {
  hasCategory(categoryId: string): boolean;
  hasProject(projectId: string): boolean;
  hasContentPosition(projectId: string, position: number): boolean;
}

/** Accepts every ref — used until a real release is wired in (T017/T020). */
export const PERMISSIVE_RELEASE_VALIDATOR: ReleaseRefValidator = {
  hasCategory: () => true,
  hasProject: () => true,
  hasContentPosition: () => true,
};
