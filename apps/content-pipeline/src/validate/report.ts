import { releaseValidationReportSchema, type ReleaseValidationReport } from '@yii/content-schema';

export type ValidationIssue = ReleaseValidationReport['issues'][number];
export type ValidationReport = ReleaseValidationReport;

export function createValidationReport(options: {
  candidateVersion: string;
  issues: ValidationIssue[];
  generatedAt?: string;
}): ValidationReport {
  const issues = [...options.issues].sort((left, right) => {
    const leftKey = `${left.path}\u0000${left.rule}\u0000${left.message}`;
    const rightKey = `${right.path}\u0000${right.rule}\u0000${right.message}`;
    return leftKey.localeCompare(rightKey);
  });
  return releaseValidationReportSchema.parse({
    schemaVersion: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    candidateVersion: options.candidateVersion,
    valid: !issues.some((issue) => issue.severity === 'error'),
    issues,
  });
}
