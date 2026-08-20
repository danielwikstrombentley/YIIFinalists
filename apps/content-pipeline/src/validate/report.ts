export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  rule: string;
  severity: ValidationSeverity;
  path: string;
  message: string;
}

export interface ValidationReport {
  schemaVersion: 1;
  generatedAt: string;
  candidateVersion: string;
  valid: boolean;
  issues: ValidationIssue[];
}

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
  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    candidateVersion: options.candidateVersion,
    valid: !issues.some((issue) => issue.severity === 'error'),
    issues,
  };
}
