import { access, constants } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Project } from '@yii/content-schema';
import type { ValidationIssue } from '../report.ts';

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function validateProjectAssets(options: {
  releaseRoot: string;
  project: Project;
}): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  for (const option of options.project.contentOptions) {
    const optionPath = `projects/${options.project.id}/project.json#option-${String(option.position)}`;
    const voiceoverPath = resolve(options.releaseRoot, option.voiceover.file);
    if (!(await fileExists(voiceoverPath))) {
      issues.push({
        rule: 'voiceover.asset-reference',
        severity: 'error',
        path: optionPath,
        message: `Voiceover file "${option.voiceover.file}" is missing or unreadable.`,
      });
    }
    for (const asset of option.mediaRefs) {
      const assetPath = resolve(options.releaseRoot, asset.file);
      if (!(await fileExists(assetPath))) {
        issues.push({
          rule: 'media.asset-reference',
          severity: 'error',
          path: optionPath,
          message: `Media asset "${asset.file}" is missing or unreadable.`,
        });
      }
    }
  }
  return issues;
}
