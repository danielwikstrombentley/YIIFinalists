import { canonicalJson, contentHash as calculateContentHash } from '@yii/content-schema';

export async function contentHash(value: unknown): Promise<string> {
  return calculateContentHash(value);
}

export function stableJson(value: unknown): string {
  return canonicalJson(value);
}
