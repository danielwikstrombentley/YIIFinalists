import { describe, expect, it } from 'vitest';
import {
  createReleaseRefValidator,
  PERMISSIVE_RELEASE_VALIDATOR,
} from '../../src/input/validate.js';

// PH2 review round 1 finding #2: the production runtime never wired a real ReleaseRefValidator,
// so unknown category/project/content-position refs were silently accepted. These tests cover
// `createReleaseRefValidator` in isolation; apps/experience/tests/app/bootstrap.test.ts covers it
// wired into createRuntimeDependencies().

const RELEASE = {
  categories: [
    { id: 'cat-1', projectIds: ['cat1-a', 'cat1-b'] },
    { id: 'cat-2', projectIds: ['cat2-a'] },
  ],
};

describe('createReleaseRefValidator', () => {
  it('rejects everything before a release is available (fail-closed)', () => {
    const validator = createReleaseRefValidator(
      () => null,
      () => undefined,
    );
    expect(validator.hasCategory('cat-1')).toBe(false);
    expect(validator.hasProject('cat1-a')).toBe(false);
    expect(validator.hasContentPosition('cat1-a', 1)).toBe(false);
  });

  it('accepts known category/project ids and rejects unknown ones once a release is loaded', () => {
    const validator = createReleaseRefValidator(
      () => RELEASE,
      () => undefined,
    );
    expect(validator.hasCategory('cat-1')).toBe(true);
    expect(validator.hasCategory('does-not-exist')).toBe(false);
    expect(validator.hasProject('cat2-a')).toBe(true);
    expect(validator.hasProject('does-not-exist')).toBe(false);
  });

  it('checks content positions against the cached project, rejecting an uncached or mismatched project', () => {
    const validator = createReleaseRefValidator(
      () => RELEASE,
      (projectId) =>
        projectId === 'cat1-a' ? { contentOptions: [{ position: 1 }, { position: 3 }] } : undefined,
    );
    expect(validator.hasContentPosition('cat1-a', 1)).toBe(true);
    expect(validator.hasContentPosition('cat1-a', 2)).toBe(false);
    expect(validator.hasContentPosition('cat1-b', 1)).toBe(false); // known project, not cached yet
  });
});

describe('PERMISSIVE_RELEASE_VALIDATOR', () => {
  it('accepts every ref (documented escape hatch for tests/call sites that opt out)', () => {
    expect(PERMISSIVE_RELEASE_VALIDATOR.hasCategory('anything')).toBe(true);
    expect(PERMISSIVE_RELEASE_VALIDATOR.hasProject('anything')).toBe(true);
    expect(PERMISSIVE_RELEASE_VALIDATOR.hasContentPosition('anything', 1)).toBe(true);
  });
});
