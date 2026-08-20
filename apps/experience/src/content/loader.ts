import type { Category, Manifest, Project, ReleaseChannelName } from '@yii/content-schema';
import { ContentCache } from './cache.js';
import { resolveActiveRelease } from './channels.js';
import {
  revalidateAssetHash,
  revalidateCategories,
  revalidateManifest,
  revalidateProject,
  revalidateReleaseContentHash,
  revalidateReleaseIntegrity,
  revalidateValidationReport,
} from './revalidate.js';

// Content loader (T017) — consumer obligations of contracts/content-package.md, fully
// implemented: revalidate at load (untrusted input), refuse on failure -> previous cached release
// -> else fail loudly so the app shell (T020) can fall back to idle + operator alert; package-
// relative asset resolution only; runtime limits enforced independently of the schema (ignore
// options beyond 5, ignore inactive positions, require an active Overview).

export class ContentLoadError extends Error {}

export interface LoadedRelease {
  version: string;
  manifest: Manifest;
  categories: Category[];
}

export interface ContentLoaderOptions {
  /** Fetches and JSON-parses a path; defaults to `fetch(path).then(r => r.json())`. */
  fetchJson?: (path: string) => Promise<unknown>;
  /** Fetches binary package assets for integrity checks; defaults to browser fetch. */
  fetchBytes?: (path: string) => Promise<Uint8Array>;
  basePath?: string;
  channel?: ReleaseChannelName;
  onOperatorAlert?: (message: string) => void;
}

async function defaultFetchJson(path: string): Promise<unknown> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new ContentLoadError(`failed to fetch "${path}": HTTP ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}

async function defaultFetchBytes(path: string): Promise<Uint8Array> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new ContentLoadError(`failed to fetch "${path}": HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export class ContentLoader {
  private readonly fetchJson: (path: string) => Promise<unknown>;
  private readonly fetchBytes: (path: string) => Promise<Uint8Array>;
  private readonly basePath: string;
  private channel: ReleaseChannelName;
  private readonly onOperatorAlert?: (message: string) => void;
  private readonly cache = new ContentCache();
  private cachedRelease: LoadedRelease | null = null;

  constructor(options: ContentLoaderOptions = {}) {
    this.fetchJson = options.fetchJson ?? defaultFetchJson;
    this.fetchBytes = options.fetchBytes ?? defaultFetchBytes;
    this.basePath = options.basePath ?? '';
    this.channel = options.channel ?? 'production';
    this.onOperatorAlert = options.onOperatorAlert;
  }

  /** Loads and revalidates the active release. Falls back to the previous cache on failure. */
  async load(): Promise<LoadedRelease> {
    try {
      const release = await this.loadFresh();
      this.cachedRelease = release;
      this.cache.clear();
      return release;
    } catch (error) {
      if (this.cachedRelease) {
        this.alert(`content load failed, using previous cached release: ${describe(error)}`);
        return this.cachedRelease;
      }
      this.alert(`content load failed, no cached release available: ${describe(error)}`);
      throw error instanceof ContentLoadError ? error : new ContentLoadError(describe(error));
    }
  }

  private async loadFresh(): Promise<LoadedRelease> {
    const { version } = await resolveActiveRelease({
      channel: this.channel,
      fetchJson: this.fetchJson,
      basePath: this.basePath,
    });
    const releaseBase = `${this.basePath}/releases/${version}`;

    const manifestRaw = await this.fetchJson(`${releaseBase}/manifest.json`);
    const manifestResult = revalidateManifest(manifestRaw);
    if (!manifestResult.success) {
      throw new ContentLoadError(`manifest.json failed schema validation for release "${version}"`);
    }

    const categoriesRaw = await this.fetchJson(`${releaseBase}/categories.json`);
    const categoriesResult = revalidateCategories(categoriesRaw);
    if (!categoriesResult.success) {
      throw new ContentLoadError(
        `categories.json failed schema validation for release "${version}"`,
      );
    }

    if (manifestResult.data.contentHash.startsWith('sha256:')) {
      const integrityRaw = await this.fetchJson(`${releaseBase}/publication.json`);
      const integrityResult = revalidateReleaseIntegrity(integrityRaw);
      if (!integrityResult.success || integrityResult.data.version !== version) {
        throw new ContentLoadError(
          `publication.json failed integrity validation for release "${version}"`,
        );
      }
      const validationRaw = await this.fetchJson(`${releaseBase}/validation-report.json`);
      const validationResult = revalidateValidationReport(validationRaw);
      if (
        !validationResult.success ||
        !validationResult.data.valid ||
        validationResult.data.candidateVersion !== version
      ) {
        throw new ContentLoadError(`validation-report.json does not admit release "${version}"`);
      }
      const projects = await Promise.all(
        categoriesResult.data
          .flatMap((category) => category.projectIds)
          .map(async (projectId) => {
            const raw = await this.fetchJson(`${releaseBase}/projects/${projectId}/project.json`);
            const result = revalidateProject(raw);
            if (!result.success) {
              throw new ContentLoadError(
                `project "${projectId}" failed schema validation while verifying release integrity`,
              );
            }
            return result.data;
          }),
      );
      if (
        !(await revalidateReleaseContentHash({
          manifest: manifestResult.data,
          categories: categoriesResult.data,
          projects,
          fileHashes: integrityResult.data.fileHashes,
        }))
      ) {
        throw new ContentLoadError(`release "${version}" contentHash verification failed`);
      }
      for (const [relativePath, expectedHash] of Object.entries(integrityResult.data.fileHashes)) {
        const asset = await this.fetchBytes(`${releaseBase}/${relativePath}`);
        if (!(await revalidateAssetHash(asset, expectedHash))) {
          throw new ContentLoadError(`asset "${relativePath}" contentHash verification failed`);
        }
      }
    }

    return { version, manifest: manifestResult.data, categories: categoriesResult.data };
  }

  /** Loads (and caches) one project, applying runtime limit enforcement. */
  async loadProject(projectId: string): Promise<Project> {
    if (!this.cachedRelease) {
      throw new ContentLoadError('loadProject() called before load()');
    }
    const category = this.cachedRelease.categories.find((c) => c.projectIds.includes(projectId));
    const cacheKey = `${category?.id ?? 'unknown'}:${projectId}`;
    const cached = this.cache.get<Project>(cacheKey);
    if (cached) return cached;

    const raw = await this.fetchJson(
      `${this.basePath}/releases/${this.cachedRelease.version}/projects/${projectId}/project.json`,
    );
    const result = revalidateProject(raw);
    if (!result.success) {
      throw new ContentLoadError(`project "${projectId}" failed schema validation`);
    }
    const project = enforceRuntimeLimits(result.data);
    this.cache.set(cacheKey, project);
    return project;
  }

  /** Loads the release's complete ordered project set for content-driven globe presentation. */
  async loadAllProjects(): Promise<Project[]> {
    if (!this.cachedRelease) {
      throw new ContentLoadError('loadAllProjects() called before load()');
    }
    const projectIds = this.cachedRelease.categories.flatMap((category) => category.projectIds);
    return Promise.all(projectIds.map((projectId) => this.loadProject(projectId)));
  }

  /**
   * Synchronously peeks an already-cached project (populated by a prior `loadProject()` call).
   * Used by the input boundary's release validator to check `content.select` position validity
   * without an async call; returns undefined until that project has been loaded at least once.
   */
  getCachedProject(projectId: string): Project | undefined {
    if (!this.cachedRelease) return undefined;
    const category = this.cachedRelease.categories.find((c) => c.projectIds.includes(projectId));
    const cacheKey = `${category?.id ?? 'unknown'}:${projectId}`;
    return this.cache.get<Project>(cacheKey);
  }

  /** R14 preload policy: evict decoded data for every category except the active one. */
  onCategoryChange(categoryId: string): void {
    this.cache.evictExceptCategory(categoryId);
  }

  /** Operator recovery rung: release decoded/preloaded content so a later interaction can retry. */
  clearPreloadCache(): void {
    this.cache.clear();
  }

  /** Consumer obligation: "resolve all assets package-relative (no arbitrary URLs)". */
  resolveAssetUrl(packageRelativePath: string): string {
    if (!this.cachedRelease) {
      throw new ContentLoadError('resolveAssetUrl() called before load()');
    }
    return `${this.basePath}/releases/${this.cachedRelease.version}/${packageRelativePath}`;
  }

  get activeRelease(): LoadedRelease | null {
    return this.cachedRelease;
  }

  /** Kiosk runtime configuration selects the local staging/production channel before boot. */
  setChannel(channel: ReleaseChannelName): void {
    if (this.cachedRelease) {
      throw new ContentLoadError('setChannel() is only valid before the first release load');
    }
    this.channel = channel;
  }

  private alert(message: string): void {
    this.onOperatorAlert?.(message);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runtime limit enforcement (independent of schema validation): ignore options beyond 5, ignore
 * inactive positions, require an active Overview before enabling a project.
 */
function enforceRuntimeLimits(project: Project): Project {
  const activeOptions = project.contentOptions
    .filter((option) => !project.inactivePositions.includes(option.position) && option.available)
    .slice(0, 5);

  if (!activeOptions.some((option) => option.position === 1)) {
    throw new ContentLoadError(`project "${project.id}" has no active Overview at position 1`);
  }

  return { ...project, contentOptions: activeOptions };
}
