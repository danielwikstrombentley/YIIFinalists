import type { Category, Project } from '@yii/content-schema';
import type { ValidationIssue } from '../report.ts';

export function validateStructure(options: {
  categories: readonly Category[];
  projects: ReadonlyMap<string, Project>;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (options.categories.length !== 12) {
    issues.push({
      rule: 'structure.category-count',
      severity: 'error',
      path: 'categories.json',
      message: `Expected exactly 12 categories; found ${String(options.categories.length)}.`,
    });
  }

  const seenProjectIds = new Set<string>();
  for (const category of options.categories) {
    if (category.projectIds.length !== 3) {
      issues.push({
        rule: 'structure.projects-per-category',
        severity: 'error',
        path: `categories.json#${category.id}`,
        message: `Category "${category.id}" must reference exactly 3 projects.`,
      });
    }
    for (const projectId of category.projectIds) {
      if (seenProjectIds.has(projectId)) {
        issues.push({
          rule: 'structure.duplicate-project-reference',
          severity: 'error',
          path: `categories.json#${category.id}`,
          message: `Project "${projectId}" is referenced by more than one category.`,
        });
      }
      seenProjectIds.add(projectId);
      const project = options.projects.get(projectId);
      if (!project) {
        issues.push({
          rule: 'structure.project-reference',
          severity: 'error',
          path: `categories.json#${category.id}`,
          message: `Referenced project "${projectId}" has no readable project.json.`,
        });
        continue;
      }
      if (project.categoryId !== category.id) {
        issues.push({
          rule: 'structure.project-category-match',
          severity: 'error',
          path: `projects/${projectId}/project.json`,
          message: `Project categoryId "${project.categoryId}" does not match category "${category.id}".`,
        });
      }
    }
  }

  if (seenProjectIds.size !== 36) {
    issues.push({
      rule: 'structure.project-count',
      severity: 'error',
      path: 'categories.json',
      message: `Expected exactly 36 unique project references; found ${String(seenProjectIds.size)}.`,
    });
  }
  return issues;
}
