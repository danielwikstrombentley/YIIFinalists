import {
  categoriesFileSchema,
  binaryContentHash,
  canonicalManifestForHash,
  canonicalValidationReportForHash,
  contentHash,
  releaseIntegritySchema,
  releaseValidationReportSchema,
  manifestSchema,
  projectSchema,
  type Category,
  type Manifest,
  type Project,
} from '@yii/content-schema';

// Revalidation (T017, consumer obligation in contracts/content-package.md): "Revalidate the
// manifest + all project JSON against the same schemas at load (untrusted input, QR-008)".

export function revalidateManifest(raw: unknown) {
  return manifestSchema.safeParse(raw);
}

export function revalidateCategories(
  raw: unknown,
): { success: true; data: Category[] } | { success: false } {
  const result = categoriesFileSchema.safeParse(raw);
  return result.success ? { success: true, data: result.data } : { success: false };
}

export function revalidateProject(raw: unknown) {
  return projectSchema.safeParse(raw);
}

export function revalidateReleaseIntegrity(raw: unknown) {
  return releaseIntegritySchema.safeParse(raw);
}

export function revalidateValidationReport(raw: unknown) {
  return releaseValidationReportSchema.safeParse(raw);
}

/** Recomputes the package-tree hash used by the publisher before runtime acceptance. */
export async function revalidateReleaseContentHash(options: {
  manifest: Manifest;
  categories: Category[];
  projects: Project[];
  fileHashes: Record<string, string>;
  validationReport: unknown;
}): Promise<boolean> {
  const validationResult = releaseValidationReportSchema.safeParse(options.validationReport);
  if (!validationResult.success) return false;
  const projectHashes = Object.fromEntries(
    await Promise.all(
      options.projects.map(async (project) => [project.id, await contentHash(project)] as const),
    ),
  );
  return (
    options.manifest.contentHash ===
    (await contentHash({
      manifest: canonicalManifestForHash(options.manifest),
      categories: options.categories,
      projectHashes,
      fileHashes: options.fileHashes,
      validationReport: canonicalValidationReportForHash(validationResult.data),
    }))
  );
}

export async function revalidateAssetHash(
  asset: Uint8Array,
  expectedHash: string,
): Promise<boolean> {
  return (await binaryContentHash(asset)) === expectedHash;
}

export type { Category, Manifest, Project };
