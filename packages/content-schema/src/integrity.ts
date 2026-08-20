import { z } from 'zod';
import { semverSchema, slugSchema } from './shared.js';

export const sha256ContentHashSchema = z
  .string()
  .regex(/^sha256:[a-f0-9]{64}$/, 'must be a SHA-256 content hash');

export type ContentHash = z.infer<typeof sha256ContentHashSchema>;

/** Stable JSON encoding shared by the prep-time publisher and browser runtime verifier. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? 'null' : canonicalJson(item))).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

/**
 * Browser-compatible SHA-256 over canonical JSON. Node 22 and modern Chromium both expose
 * WebCrypto, keeping this package free of a Node-only import that would leak into the LED runtime.
 */
export async function contentHash(value: unknown): Promise<ContentHash> {
  return binaryContentHash(new TextEncoder().encode(canonicalJson(value)));
}

/** Hashes an exact binary asset while retaining the same `sha256:<hex>` representation. */
export async function binaryContentHash(value: Uint8Array): Promise<ContentHash> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('WebCrypto SubtleCrypto is required to verify release content hashes.');
  }
  const bytes = new Uint8Array(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  return `sha256:${hex}`;
}

export const validationIssueSchema = z
  .object({
    rule: z.string().min(1),
    severity: z.enum(['error', 'warning']),
    path: z.string().min(1),
    message: z.string().min(1),
  })
  .strict();

export const releaseValidationReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.iso.datetime({ offset: true }),
    candidateVersion: semverSchema,
    valid: z.boolean(),
    issues: z.array(validationIssueSchema),
  })
  .strict();

export type ReleaseValidationReport = z.infer<typeof releaseValidationReportSchema>;

export const releaseIntegritySchema = z
  .object({
    version: semverSchema,
    contentHash: sha256ContentHashSchema,
    projectHashes: z.record(slugSchema, sha256ContentHashSchema),
    fileHashes: z.record(z.string().min(1), sha256ContentHashSchema),
  })
  .strict();

export type ReleaseIntegrity = z.infer<typeof releaseIntegritySchema>;
