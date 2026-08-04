import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { categorySchema, manifestSchema, projectSchema, releaseSchema } from '../src/index.js';

// T009 Tests: "JSON Schema export snapshot test" — the copilot-agent drafting driver and other
// non-TypeScript consumers (research.md R9) depend on this shape staying stable/reviewable.

describe('JSON Schema export (z.toJSONSchema)', () => {
  it('exports a stable manifest JSON Schema', () => {
    const schema = z.toJSONSchema(manifestSchema, { unrepresentable: 'any' });
    expect(schema).toMatchSnapshot();
  });

  it('exports a stable category JSON Schema', () => {
    const schema = z.toJSONSchema(categorySchema, { unrepresentable: 'any' });
    expect(schema).toMatchSnapshot();
  });

  it('exports a project JSON Schema exposing every top-level required field', () => {
    const schema = z.toJSONSchema(projectSchema, { unrepresentable: 'any' }) as unknown as {
      type: string;
      required: string[];
    };
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(
      expect.arrayContaining([
        'id',
        'name',
        'organisation',
        'country',
        'location',
        'categoryId',
        'marker',
        'geographicFraming',
        'contentOptions',
        'inactivePositions',
      ]),
    );
  });

  it('exports a release JSON Schema requiring 12 categories', () => {
    const schema = z.toJSONSchema(releaseSchema, { unrepresentable: 'any' }) as unknown as {
      properties: { categories: { minItems: number; maxItems: number } };
    };
    expect(schema.properties.categories.minItems).toBe(12);
    expect(schema.properties.categories.maxItems).toBe(12);
  });

  it('does not throw for any exported top-level schema (unrepresentable checks tolerated)', () => {
    for (const schema of [manifestSchema, categorySchema, projectSchema, releaseSchema]) {
      expect(() => z.toJSONSchema(schema, { unrepresentable: 'any' })).not.toThrow();
    }
  });
});
