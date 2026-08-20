import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import {
  categoriesFileSchema,
  manifestSchema,
  projectSchema,
  type Project,
} from '@yii/content-schema';
import { validateReleaseCandidate } from '../validate/run.ts';
import type { PublishCandidate } from './release.ts';

export class PublishCandidateLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublishCandidateLoadError';
  }
}

export interface LoadPublishCandidateOptions {
  /** Root containing `releases/<version>/` source packages. */
  root: string;
  version: string;
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new PublishCandidateLoadError(`Could not read candidate JSON at ${path}: ${detail}`);
  }
}

function isPublishMetadata(relativePath: string): boolean {
  if (
    relativePath === 'manifest.json' ||
    relativePath === 'categories.json' ||
    relativePath === 'validation-report.json' ||
    relativePath === 'publication.json'
  ) {
    return true;
  }
  return /^projects\/[^/]+\/(?:project|editorial)\.json$/.test(relativePath);
}

function isSafePackageRelativePath(relativePath: string): boolean {
  return (
    relativePath.length > 0 &&
    !relativePath.startsWith('..') &&
    !relativePath.startsWith('/') &&
    !relativePath.includes('\\')
  );
}

async function collectAssets(releaseRoot: string): Promise<Record<string, Uint8Array>> {
  const assets: Record<string, Uint8Array> = {};

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (entry.isSymbolicLink()) {
        throw new PublishCandidateLoadError(
          `Candidate release contains a symbolic link, which is not publishable: ${absolutePath}`,
        );
      }
      if (!entry.isFile()) continue;

      const relativePath = relative(releaseRoot, absolutePath).split(sep).join('/');
      if (!isSafePackageRelativePath(relativePath)) {
        throw new PublishCandidateLoadError(
          `Candidate asset path escapes the release root: ${relativePath}`,
        );
      }
      if (isPublishMetadata(relativePath)) continue;
      assets[relativePath] = await readFile(absolutePath);
    }
  }

  await visit(releaseRoot);
  return assets;
}

/**
 * Materializes a validated, file-based release candidate for immutable publication. Validation is
 * intentionally run here rather than trusting caller-supplied JSON: the CLI can only publish the
 * candidate package that just passed the FR-036 rule set.
 */
export async function loadPublishCandidate(
  options: LoadPublishCandidateOptions,
): Promise<PublishCandidate> {
  const root = resolve(options.root);
  const releaseRoot = join(root, 'releases', options.version);
  const validationReport = await validateReleaseCandidate({ root, version: options.version });
  if (!validationReport.valid) {
    throw new PublishCandidateLoadError(
      `Candidate ${options.version} failed validation; inspect ${join(releaseRoot, 'validation-report.json')}.`,
    );
  }

  const manifest = manifestSchema.parse(await readJson(join(releaseRoot, 'manifest.json')));
  if (manifest.version !== options.version) {
    throw new PublishCandidateLoadError(
      `Candidate manifest version ${manifest.version} does not match requested version ${options.version}.`,
    );
  }
  const categories = categoriesFileSchema.parse(
    await readJson(join(releaseRoot, 'categories.json')),
  );
  const projectIds = categories.flatMap((category) => category.projectIds);
  const projects: Project[] = await Promise.all(
    projectIds.map(async (projectId) =>
      projectSchema.parse(await readJson(join(releaseRoot, 'projects', projectId, 'project.json'))),
    ),
  );

  return {
    version: options.version,
    manifest: {
      schemaVersion: manifest.schemaVersion,
      version: manifest.version,
      createdAt: manifest.createdAt,
      approvedBy: manifest.approvedBy,
      frozen: manifest.frozen,
    },
    categories,
    projects,
    validationReport,
    assets: await collectAssets(releaseRoot),
  };
}
