import {
  categoriesFileSchema,
  contentHash,
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

/** Recomputes the package-tree hash used by the publisher before runtime acceptance. */
export async function revalidateReleaseContentHash(options: {
  manifest: Manifest;
  categories: Category[];
  projects: Project[];
}): Promise<boolean> {
  const projectHashes = Object.fromEntries(
    await Promise.all(
      options.projects.map(async (project) => [project.id, await contentHash(project)] as const),
    ),
  );
  return (
    options.manifest.contentHash ===
    (await contentHash({ categories: options.categories, projectHashes }))
  );
}

export type { Category, Manifest, Project };
