import {
  KNOWN_FORMAT_IDS,
  isRightsApproved,
  type Project,
} from '@yii/content-schema';
import type { ValidationIssue } from '../report.ts';

export function validateProjectRules(project: Project): ValidationIssue[] {
  const path = `projects/${project.id}/project.json`;
  const issues: ValidationIssue[] = [];
  const positions = project.contentOptions.map((option) => option.position);
  const activePositions = new Set(project.contentOptions.map((option) => option.position));
  const inactivePositions = new Set(project.inactivePositions);

  if (!positions.includes(1)) {
    issues.push({
      rule: 'overview.position-one',
      severity: 'error',
      path,
      message: 'Project Overview must exist at position 1.',
    });
  }
  if (project.contentOptions.length > 5) {
    issues.push({
      rule: 'option.maximum-count',
      severity: 'error',
      path,
      message: `Project contains ${String(project.contentOptions.length)} options; maximum is 5.`,
    });
  }
  if (new Set(positions).size !== positions.length || new Set(project.inactivePositions).size !== project.inactivePositions.length) {
    issues.push({
      rule: 'positions.unique-and-complete',
      severity: 'error',
      path,
      message: 'Content-option and inactive positions must be unique.',
    });
  }
  for (const position of [1, 2, 3, 4, 5] as const) {
    if (!activePositions.has(position) && !inactivePositions.has(position)) {
      issues.push({
        rule: 'positions.unique-and-complete',
        severity: 'error',
        path,
        message: `Position ${String(position)} must be active or explicitly inactive.`,
      });
    }
  }

  for (const option of project.contentOptions) {
    const optionPath = `${path}#option-${String(option.position)}`;
    if (option.displayText.length === 0) {
      issues.push({
        rule: 'option.display-text',
        severity: 'error',
        path: optionPath,
        message: 'Display text is required for every content option.',
      });
    }
    if (!option.voiceover.file) {
      issues.push({
        rule: 'option.voiceover',
        severity: 'error',
        path: optionPath,
        message: 'A pre-generated voiceover file is required for every content option.',
      });
    }
    if (option.formats.some((format) => !(KNOWN_FORMAT_IDS as readonly string[]).includes(format))) {
      issues.push({
        rule: 'option.unsupported-format',
        severity: 'error',
        path: optionPath,
        message: 'Option contains a format that is not in the reusable format library.',
      });
    }
    if (
      !option.sequence.openingState ||
      !option.sequence.timebase ||
      option.sequence.syncToleranceMs === undefined ||
      !option.sequence.finalFrame
    ) {
      issues.push({
        rule: 'sequence.required-fields',
        severity: 'error',
        path: optionPath,
        message: 'Sequence must include openingState, timebase, syncToleranceMs, and finalFrame.',
      });
    }
    for (const asset of option.mediaRefs) {
      if (!isRightsApproved(asset.rights)) {
        issues.push({
          rule: 'media.rights-approved',
          severity: 'error',
          path: optionPath,
          message: `Media asset "${asset.id}" lacks approved rights.`,
        });
      }
      if (asset.aiGenerated === undefined) {
        issues.push({
          rule: 'media.ai-flag',
          severity: 'error',
          path: optionPath,
          message: `Media asset "${asset.id}" must explicitly state aiGenerated.`,
        });
      }
    }
  }
  return issues;
}
