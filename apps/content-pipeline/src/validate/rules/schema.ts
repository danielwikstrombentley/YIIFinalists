import {
  categoriesFileSchema,
  manifestSchema,
  projectSchema,
  type Category,
  type Manifest,
  type Project,
} from '@yii/content-schema';
import type { ValidationIssue } from '../report.ts';

export interface ParsedCandidateFiles {
  manifest?: Manifest;
  categories?: Category[];
  projects: Map<string, Project>;
  issues: ValidationIssue[];
}

export function parseManifest(
  raw: unknown,
  path: string,
): {
  manifest?: Manifest;
  issues: ValidationIssue[];
} {
  const result = manifestSchema.safeParse(raw);
  if (result.success) return { manifest: result.data, issues: [] };
  return {
    issues: result.error.issues.map((issue) => ({
      rule: 'manifest.schema',
      severity: 'error' as const,
      path,
      message: `Manifest is invalid: ${issue.message}.`,
    })),
  };
}

export function parseCategories(
  raw: unknown,
  path: string,
): {
  categories?: Category[];
  issues: ValidationIssue[];
} {
  const result = categoriesFileSchema.safeParse(raw);
  if (result.success) return { categories: result.data, issues: [] };
  return {
    issues: result.error.issues.map((issue) => ({
      rule: 'structure.category-count',
      severity: 'error' as const,
      path,
      message: `Release categories are invalid: ${issue.message}.`,
    })),
  };
}

export function parseProject(
  raw: unknown,
  path: string,
): {
  project?: Project;
  issues: ValidationIssue[];
} {
  const result = projectSchema.safeParse(raw);
  if (result.success) return { project: result.data, issues: [] };

  const issueText = result.error.issues.map((issue) => issue.message).join(' ');
  const issuePaths = result.error.issues.map((issue) => issue.path.join('.')).join(' ');
  const rawOptionCount =
    raw &&
    typeof raw === 'object' &&
    Array.isArray((raw as { contentOptions?: unknown }).contentOptions)
      ? (raw as { contentOptions: unknown[] }).contentOptions.length
      : undefined;
  const rule = /position 1/.test(issueText)
    ? 'overview.position-one'
    : rawOptionCount !== undefined && rawOptionCount > 5
      ? 'option.maximum-count'
      : /geographicFraming/.test(issueText) || /geographicFraming/.test(issuePaths)
        ? 'project.geographic-framing'
        : /organisation|country|location|name/.test(issueText) ||
            /organisation|country|location|name/.test(issuePaths)
          ? 'project.required-metadata'
          : /displayText/.test(issueText) || /displayText/.test(issuePaths)
            ? 'option.display-text'
            : /voiceover/.test(issueText) || /voiceover/.test(issuePaths)
              ? 'option.voiceover'
              : /formats/.test(issueText) || /formats/.test(issuePaths)
                ? 'option.unsupported-format'
                : /finalFrame|openingState|timebase|syncTolerance|beats/.test(issueText) ||
                    /finalFrame|openingState|timebase|syncTolerance|beats/.test(issuePaths)
                  ? 'sequence.required-fields'
                  : /contentOptions/.test(issuePaths)
                    ? 'option.maximum-count'
                    : /duplicate content-option position/.test(issueText)
                      ? 'positions.unique-and-complete'
                      : /rights/.test(issueText)
                        ? 'media.rights-record'
                        : 'project.schema';
  return {
    issues: result.error.issues.map((issue) => ({
      rule,
      severity: 'error' as const,
      path,
      message: `Project content is invalid: ${issue.message}.`,
    })),
  };
}
