import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  canPublishToProduction,
  canonicalManifestForHash,
  canonicalValidationReportForHash,
  categoriesFileSchema,
  manifestSchema,
  projectSchema,
  releaseValidationReportSchema,
  type Category,
  type Project,
  type ReleaseChannelName,
} from '@yii/content-schema';
import { readChannels, setChannelVersion, writeChannels } from './channels.ts';
import { withProductionFreeze } from './freeze.ts';
import { contentHash, fileHash } from './hash.ts';
import type { ValidationReport } from '../validate/report.ts';

export interface PublishCandidate {
  version: string;
  manifest: {
    schemaVersion: number;
    version: string;
    createdAt: string;
    approvedBy: string;
    frozen: boolean;
  };
  categories: Category[];
  projects: Array<{ id: string; content: string; project?: Project }>;
  /** The T062 report that admitted this exact candidate to the release boundary. */
  validationReport: ValidationReport;
  /** Candidate-local asset path → byte content. Paths must be package-relative. */
  assets?: Record<string, Uint8Array>;
}

export interface PublishedRelease {
  version: string;
  contentHash: string;
  projectHashes: Record<string, string>;
  fileHashes: Record<string, string>;
}

export interface PublishReleaseOptions {
  root: string;
  candidate: PublishCandidate;
  channel: ReleaseChannelName;
  baseVersion?: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(resolve(path, '..'), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

async function copyUnchangedProjectFromBase(options: {
  root: string;
  baseVersion: string;
  projectId: string;
  targetReleaseRoot: string;
}): Promise<void> {
  const source = join(
    options.root,
    'releases',
    options.baseVersion,
    'projects',
    options.projectId,
    'project.json',
  );
  const target = join(options.targetReleaseRoot, 'projects', options.projectId, 'project.json');
  await mkdir(resolve(target, '..'), { recursive: true });
  await writeFile(target, await readFile(source), { flag: 'wx' });
}

function isPackageRelativePath(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !path.includes('..') && !path.includes('\\');
}

function validateCandidate(candidate: PublishCandidate): void {
  const validationReport = releaseValidationReportSchema.safeParse(candidate.validationReport);
  if (!validationReport.success || !validationReport.data.valid) {
    throw new Error('Only a validation-passing candidate may publish. Resolve T062 report errors.');
  }
  if (validationReport.data.candidateVersion !== candidate.version) {
    throw new Error('Validation report version must match the requested release version.');
  }
  if (candidate.manifest.version !== candidate.version) {
    throw new Error('Candidate manifest version must match the requested release version.');
  }
  const categories = categoriesFileSchema.safeParse(candidate.categories);
  if (!categories.success) {
    throw new Error('Only a schema-valid 12-category candidate may publish. Run validate first.');
  }
  if (candidate.projects.length !== 36) {
    throw new Error('Only a fully validated 36-project candidate may publish. Run validate first.');
  }
  const referencedIds = new Set(categories.data.flatMap((category) => category.projectIds));
  if (
    referencedIds.size !== 36 ||
    candidate.projects.some((project) => !referencedIds.has(project.id))
  ) {
    throw new Error('Candidate project identities must match the 12×3 category references.');
  }
  for (const project of candidate.projects) {
    if (project.project && !projectSchema.safeParse(project.project).success) {
      throw new Error(`Candidate project "${project.id}" is not schema-valid. Run validate first.`);
    }
  }
  for (const path of Object.keys(candidate.assets ?? {})) {
    if (!isPackageRelativePath(path)) {
      throw new Error(`Candidate asset "${path}" must use a package-relative path.`);
    }
  }
}

async function readPublished(root: string, version: string): Promise<PublishedRelease> {
  return JSON.parse(
    await readFile(join(root, 'releases', version, 'publication.json'), 'utf8'),
  ) as PublishedRelease;
}

export async function publishRelease(options: PublishReleaseOptions): Promise<PublishedRelease> {
  const root = resolve(options.root);
  validateCandidate(options.candidate);
  const channels = await readChannels(root);
  if (options.channel === 'production' && !canPublishToProduction(channels)) {
    throw new Error('Production channel is frozen; publishing is blocked.');
  }

  const releaseRoot = join(root, 'releases', options.candidate.version);
  if (await exists(releaseRoot)) {
    const published = await readPublished(root, options.candidate.version);
    await writeChannels(
      root,
      setChannelVersion(channels, options.channel, options.candidate.version, 'publish'),
    );
    return published;
  }

  const base = options.baseVersion ? await readPublished(root, options.baseVersion) : undefined;
  const projectHashes: Record<string, string> = {};
  const fileHashes: Record<string, string> = {};
  for (const project of options.candidate.projects) {
    const nextHash = await contentHash(project.project ?? project.content);
    const existingHash = base?.projectHashes[project.id];
    projectHashes[project.id] = existingHash === nextHash ? existingHash : nextHash;
    if (existingHash === nextHash && options.baseVersion) {
      await copyUnchangedProjectFromBase({
        root,
        baseVersion: options.baseVersion,
        projectId: project.id,
        targetReleaseRoot: releaseRoot,
      });
    } else {
      await writeJson(
        join(releaseRoot, 'projects', project.id, 'project.json'),
        project.project ?? project,
      );
    }
  }

  for (const [relativePath, asset] of Object.entries(options.candidate.assets ?? {})) {
    fileHashes[relativePath] = await fileHash(asset);
    const assetPath = join(releaseRoot, relativePath);
    await mkdir(resolve(assetPath, '..'), { recursive: true });
    await writeFile(assetPath, asset, { flag: 'wx' });
  }

  const normalizedManifest = manifestSchema.parse({
    ...options.candidate.manifest,
    contentHash: await contentHash({
      manifest: canonicalManifestForHash(options.candidate.manifest),
      categories: options.candidate.categories,
      projectHashes,
      fileHashes,
      validationReport: canonicalValidationReportForHash(options.candidate.validationReport),
    }),
  });
  await writeJson(join(releaseRoot, 'manifest.json'), normalizedManifest);
  await writeJson(join(releaseRoot, 'categories.json'), options.candidate.categories);
  await writeJson(join(releaseRoot, 'validation-report.json'), options.candidate.validationReport);
  const published: PublishedRelease = {
    version: options.candidate.version,
    contentHash: normalizedManifest.contentHash,
    projectHashes,
    fileHashes,
  };
  await writeJson(join(releaseRoot, 'publication.json'), published);
  await writeChannels(
    root,
    setChannelVersion(channels, options.channel, options.candidate.version, 'publish'),
  );
  return published;
}

export async function promoteRelease(options: { root: string; version: string }): Promise<void> {
  const root = resolve(options.root);
  const channels = await readChannels(root);
  if (!canPublishToProduction(channels))
    throw new Error('Production channel is frozen; promotion is blocked.');
  if (!(await exists(join(root, 'releases', options.version, 'publication.json')))) {
    throw new Error(`Cannot promote missing release "${options.version}".`);
  }
  await writeChannels(root, setChannelVersion(channels, 'production', options.version, 'promote'));
}

export async function rollbackChannel(options: {
  root: string;
  channel: ReleaseChannelName;
}): Promise<void> {
  const root = resolve(options.root);
  const channels = await readChannels(root);
  const current = channels[options.channel];
  const prior = [...channels.history]
    .reverse()
    .find(
      (event) => event.channel === options.channel && event.version && event.version !== current,
    )?.version;
  if (!prior)
    throw new Error(`No retained prior ${options.channel} release is available for rollback.`);
  await writeChannels(root, setChannelVersion(channels, options.channel, prior, 'rollback'));
}

export async function setProductionFreeze(options: {
  root: string;
  frozen: boolean;
}): Promise<void> {
  const root = resolve(options.root);
  await writeChannels(root, withProductionFreeze(await readChannels(root), options.frozen));
}
