import { KNOWN_FORMAT_IDS } from '@yii/content-schema';
import type { ValidationIssue } from '../report.ts';

function optionsOf(raw: unknown): unknown[] {
  if (!raw || typeof raw !== 'object') return [];
  const options = (raw as { contentOptions?: unknown }).contentOptions;
  return Array.isArray(options) ? options : [];
}

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function validateRawProjectRules(raw: unknown, path: string): ValidationIssue[] {
  if (!raw || typeof raw !== 'object') return [];
  const project = raw as Record<string, unknown>;
  const options = optionsOf(raw);
  const issues: ValidationIssue[] = [];

  if (options.length > 5) {
    issues.push({
      rule: 'option.maximum-count',
      severity: 'error',
      path,
      message: `Project contains ${String(options.length)} content options; maximum is 5.`,
    });
  }
  for (const field of ['name', 'organisation', 'country', 'location']) {
    if (typeof project[field] !== 'string' || project[field].trim().length === 0) {
      issues.push({
        rule: 'project.required-metadata',
        severity: 'error',
        path,
        message: `Project is missing required ${field} metadata.`,
      });
    }
  }
  if (!hasOwn(project, 'geographicFraming') || !project.geographicFraming) {
    issues.push({
      rule: 'project.geographic-framing',
      severity: 'error',
      path,
      message: 'Project is missing required geographic framing.',
    });
  }

  for (const [index, optionRaw] of options.entries()) {
    if (!optionRaw || typeof optionRaw !== 'object') continue;
    const option = optionRaw as Record<string, unknown>;
    const optionPath = `${path}#option-${String(index + 1)}`;
    if (!Array.isArray(option.displayText) || option.displayText.length === 0) {
      issues.push({
        rule: 'option.display-text',
        severity: 'error',
        path: optionPath,
        message: 'Display text is required for every content option.',
      });
    }
    if (!option.voiceover || typeof option.voiceover !== 'object') {
      issues.push({
        rule: 'option.voiceover',
        severity: 'error',
        path: optionPath,
        message: 'A pre-generated voiceover asset is required for every content option.',
      });
    }
    if (
      !Array.isArray(option.formats) ||
      option.formats.some(
        (format) => typeof format !== 'string' || !(KNOWN_FORMAT_IDS as readonly string[]).includes(format),
      )
    ) {
      issues.push({
        rule: 'option.unsupported-format',
        severity: 'error',
        path: optionPath,
        message: 'Option uses a format outside the reusable format library.',
      });
    }
    const sequence = option.sequence;
    if (
      !sequence ||
      typeof sequence !== 'object' ||
      !hasOwn(sequence, 'openingState') ||
      !hasOwn(sequence, 'timebase') ||
      !hasOwn(sequence, 'syncToleranceMs') ||
      !hasOwn(sequence, 'finalFrame')
    ) {
      issues.push({
        rule: 'sequence.required-fields',
        severity: 'error',
        path: optionPath,
        message: 'Sequence must include openingState, timebase, syncToleranceMs, and finalFrame.',
      });
    }
  }
  return issues;
}
