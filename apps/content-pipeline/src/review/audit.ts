import {
  changeRecordSchema,
  editorialOptionSchema,
  type ChangeRecord,
  type EditorialOption,
  type PassageRef,
} from '@yii/content-schema';

export interface EditContext {
  actor: string;
  at?: string;
  note?: string;
}

export type EditableEditorialField =
  'title' | 'rationale' | 'draftDisplayText' | 'draftVoiceoverText';

export interface SourcedEdit extends EditContext {
  text: string;
  sourceLinks: PassageRef[];
}

function aggregateSourceLinks(option: EditorialOption): PassageRef[] {
  const links = [
    ...option.title.sourceLinks,
    ...option.rationale.sourceLinks,
    ...option.draftDisplayText.sourceLinks,
    ...option.draftVoiceoverText.sourceLinks,
    ...option.mediaRecommendations.flatMap((recommendation) => recommendation.sourceLinks),
  ];
  return Array.from(
    new Map(links.map((link) => [`${link.submissionId}\0${link.passageId}`, link])).values(),
  );
}

export function appendAuditRecord<T extends { audit: ChangeRecord[] }>(
  value: T,
  record: ChangeRecord,
): T {
  const parsed = changeRecordSchema.parse(record);
  return { ...value, audit: [...value.audit, parsed] };
}

export function editEditorialOption(
  option: EditorialOption,
  field: EditableEditorialField,
  edit: SourcedEdit,
): EditorialOption {
  const previousValue = option[field];
  const newValue = { text: edit.text, sourceLinks: edit.sourceLinks };
  const changed = {
    ...option,
    [field]: newValue,
    ...(field === 'draftDisplayText' ? { displayTextVersion: option.displayTextVersion + 1 } : {}),
    ...(field === 'draftVoiceoverText'
      ? { voiceoverTextVersion: option.voiceoverTextVersion + 1 }
      : {}),
  };
  changed.sourceLinks = aggregateSourceLinks(changed);
  return editorialOptionSchema.parse(
    appendAuditRecord(changed, {
      at: edit.at ?? new Date().toISOString(),
      actor: edit.actor,
      field,
      previousValue,
      newValue,
      note: edit.note,
    }),
  );
}

export function replaceEditorialField<K extends keyof EditorialOption>(
  option: EditorialOption,
  field: K,
  value: EditorialOption[K],
  context: EditContext,
): EditorialOption {
  const changed = { ...option, [field]: value };
  if (field === 'mediaRecommendations') changed.sourceLinks = aggregateSourceLinks(changed);
  return editorialOptionSchema.parse(
    appendAuditRecord(changed, {
      at: context.at ?? new Date().toISOString(),
      actor: context.actor,
      field: String(field),
      previousValue: option[field] ?? null,
      newValue: value ?? null,
      note: context.note,
    }),
  );
}
