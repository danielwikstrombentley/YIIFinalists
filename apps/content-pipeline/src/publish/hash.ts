import {
  binaryContentHash,
  canonicalJson,
  contentHash as calculateContentHash,
} from '@yii/content-schema';

export async function contentHash(value: unknown): Promise<string> {
  return calculateContentHash(value);
}

export async function fileHash(value: Uint8Array): Promise<string> {
  return binaryContentHash(value);
}

export function stableJson(value: unknown): string {
  return canonicalJson(value);
}
