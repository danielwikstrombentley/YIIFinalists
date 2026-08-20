import type { EditorialOption, MetricClaim } from '@yii/content-schema';
import type { ValidationIssue } from '../report.ts';

export interface PublishedEditorialRecord {
  options: Array<Pick<EditorialOption, 'position' | 'reviewState' | 'producedBy'>>;
  metrics: Array<Pick<MetricClaim, 'label' | 'value' | 'verified'>>;
}

export function validateEditorialRecord(projectId: string, raw: unknown): ValidationIssue[] {
  const path = `projects/${projectId}/editorial.json`;
  if (!raw || typeof raw !== 'object') {
    return [
      {
        rule: 'editorial.record',
        severity: 'error',
        path,
        message: 'Published project is missing its editorial approval record.',
      },
    ];
  }
  const record = raw as Partial<PublishedEditorialRecord>;
  const options = Array.isArray(record.options) ? record.options : [];
  const metrics = Array.isArray(record.metrics) ? record.metrics : [];
  const issues: ValidationIssue[] = [];
  if (options.length === 0) {
    issues.push({
      rule: 'editorial.approval',
      severity: 'error',
      path,
      message: 'Published project has no approved editorial options.',
    });
  }
  for (const option of options) {
    if (
      option.reviewState !== 'approved' ||
      (option.producedBy !== undefined && option.reviewState !== 'approved')
    ) {
      issues.push({
        rule: 'editorial.approval',
        severity: 'error',
        path,
        message: `Editorial option at position ${String(option.position)} is not human-approved.`,
      });
    }
  }
  for (const metric of metrics) {
    if (metric.verified !== true) {
      issues.push({
        rule: 'metrics.verified',
        severity: 'error',
        path,
        message: `Metric "${String(metric.label)}" is unverified and cannot publish.`,
      });
    }
  }
  return issues;
}
