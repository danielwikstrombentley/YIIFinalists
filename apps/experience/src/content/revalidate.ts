import {
  categoriesFileSchema,
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

export function revalidateCategories(raw: unknown): { success: true; data: Category[] } | { success: false } {
  const result = categoriesFileSchema.safeParse(raw);
  return result.success ? { success: true, data: result.data } : { success: false };
}

export function revalidateProject(raw: unknown) {
  return projectSchema.safeParse(raw);
}

export type { Category, Manifest, Project };
