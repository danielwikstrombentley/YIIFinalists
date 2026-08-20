import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Project } from '@yii/content-schema';
import { createValidationReport, type ValidationIssue, type ValidationReport } from './report.ts';
import { validateProjectAssets } from './rules/assets.ts';
import { validateEditorialRecord } from './rules/editorial.ts';
import { validateProjectRules } from './rules/project.ts';
import { validateRawProjectRules } from './rules/raw.ts';
import { parseCategories, parseManifest, parseProject } from './rules/schema.ts';
import { validateStructure } from './rules/structure.ts';

export interface ValidateReleaseCandidateOptions {
  /** Root holding channels.json and releases/<semver>/. */
  root: string;
  /** Explicit candidate version. If omitted, the candidate release is inferred from channels.json. */
  version?: string;
  now?: () => Date;
}

export class ReleaseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReleaseValidationError';
  }
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ReleaseValidationError(`Could not read JSON at ${path}: ${reason}`);
  }
}

async function readOptionalJson(path: string): Promise<unknown | undefined> {
  try {
    return await readJson(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || /ENOENT/.test(String(error))) {
      return undefined;
    }
    throw error;
  }
}

async function writeReport(path: string, report: ValidationReport): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

async function inferCandidateVersion(root: string): Promise<string> {
  const raw = await readJson(join(root, 'channels.json'));
  if (!raw || typeof raw !== 'object') {
    throw new ReleaseValidationError('Cannot infer a release candidate: channels.json is invalid.');
  }
  const channels = raw as { staging?: unknown; production?: unknown };
  if (typeof channels.staging === 'string') return channels.staging;
  if (typeof channels.production === 'string') return channels.production;
  throw new ReleaseValidationError(
    'Cannot infer a release candidate: pass --version or point staging/production at a release.',
  );
}

function projectPath(releaseRoot: string, projectId: string): string {
  return join(releaseRoot, 'projects', projectId, 'project.json');
}

/**
 * Validates a file-based release candidate before publishing. This is deliberately prep-time only:
 * the browser remains protected by its independent ContentLoader revalidation boundary.
 */
export async function validateReleaseCandidate(
  options: ValidateReleaseCandidateOptions,
): Promise<ValidationReport> {
  const root = resolve(options.root);
  const version = options.version ?? (await inferCandidateVersion(root));
  const releaseRoot = join(root, 'releases', version);
  const issues: ValidationIssue[] = [];

  let manifestRaw: unknown;
  let categoriesRaw: unknown;
  try {
    [manifestRaw, categoriesRaw] = await Promise.all([
      readJson(join(releaseRoot, 'manifest.json')),
      readJson(join(releaseRoot, 'categories.json')),
    ]);
  } catch (error) {
    const report = createValidationReport({
      candidateVersion: version,
      generatedAt: (options.now ?? (() => new Date()))().toISOString(),
      issues: [
        {
          rule: 'release.files',
          severity: 'error',
          path: `releases/${version}`,
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    });
    await writeReport(join(releaseRoot, 'validation-report.json'), report);
    return report;
  }

  const parsedManifest = parseManifest(manifestRaw, 'manifest.json');
  issues.push(...parsedManifest.issues);
  if (parsedManifest.manifest && parsedManifest.manifest.version !== version) {
    issues.push({
      rule: 'manifest.version',
      severity: 'error',
      path: 'manifest.json',
      message: `Manifest version "${parsedManifest.manifest.version}" does not match release directory "${version}".`,
    });
  }

  const parsedCategories = parseCategories(categoriesRaw, 'categories.json');
  issues.push(...parsedCategories.issues);
  const projects = new Map<string, Project>();
  const categoryProjectIds =
    parsedCategories.categories?.flatMap((category) => category.projectIds) ?? [];

  for (const projectId of categoryProjectIds) {
    const relativePath = `projects/${projectId}/project.json`;
    let raw: unknown;
    try {
      raw = await readJson(projectPath(releaseRoot, projectId));
    } catch (error) {
      issues.push({
        rule: 'structure.project-reference',
        severity: 'error',
        path: relativePath,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    issues.push(...validateRawProjectRules(raw, relativePath));
    const parsedProject = parseProject(raw, relativePath);
    issues.push(...parsedProject.issues);
    if (!parsedProject.project) continue;
    projects.set(projectId, parsedProject.project);
    issues.push(...validateProjectRules(parsedProject.project));
    issues.push(...(await validateProjectAssets({ releaseRoot, project: parsedProject.project })));

    const editorial = await readOptionalJson(
      join(releaseRoot, 'projects', projectId, 'editorial.json'),
    );
    issues.push(...validateEditorialRecord(projectId, editorial));
  }

  if (parsedCategories.categories) {
    issues.push(...validateStructure({ categories: parsedCategories.categories, projects }));
  }

  const report = createValidationReport({
    candidateVersion: version,
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    issues,
  });
  await writeReport(join(releaseRoot, 'validation-report.json'), report);
  return report;
}
