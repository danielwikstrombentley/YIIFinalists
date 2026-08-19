import { createHash } from 'node:crypto';
import type { SourcePassage } from '@yii/content-schema';

export interface PassageField {
  field: string;
  text: string;
}

function anchorField(field: string): string {
  const normalized = field
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'source';
}

function paragraphHash(field: string, text: string): string {
  return createHash('sha256').update(field).update('\0').update(text).digest('hex').slice(0, 12);
}

export function splitSourceParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/**
 * Creates content-addressed field/paragraph anchors and reuses matching anchors from a previous
 * ingestion. Unchanged wording therefore keeps the same id even when paragraphs are reordered.
 */
export function createStablePassages(
  fields: readonly PassageField[],
  previous: readonly SourcePassage[] = [],
): SourcePassage[] {
  const reusable = new Map<string, string[]>();
  for (const passage of previous) {
    const key = `${passage.field}\0${passage.text}`;
    const ids = reusable.get(key) ?? [];
    ids.push(passage.id);
    reusable.set(key, ids);
  }

  const usedIds = new Set<string>();
  const previousByPosition = new Map<string, string>();
  const previousFieldIndexes = new Map<string, number>();
  for (const passage of previous) {
    const index = previousFieldIndexes.get(passage.field) ?? 0;
    previousByPosition.set(`${passage.field}\0${index}`, passage.id);
    previousFieldIndexes.set(passage.field, index + 1);
  }
  const nextFieldIndexes = new Map<string, number>();
  const passages: SourcePassage[] = [];
  for (const source of fields) {
    for (const text of splitSourceParagraphs(source.text)) {
      const key = `${source.field}\0${text}`;
      const priorId = reusable.get(key)?.shift();
      const fieldIndex = nextFieldIndexes.get(source.field) ?? 0;
      nextFieldIndexes.set(source.field, fieldIndex + 1);
      const positionalId = previousByPosition.get(`${source.field}\0${fieldIndex}`);
      const baseId = `${anchorField(source.field)}-p-${paragraphHash(source.field, text)}`;
      let id = priorId ?? positionalId ?? baseId;
      let collision = 2;
      while (usedIds.has(id)) {
        id = `${baseId}-${collision}`;
        collision += 1;
      }
      usedIds.add(id);
      passages.push({ id, field: source.field, text });
    }
  }
  return passages;
}
