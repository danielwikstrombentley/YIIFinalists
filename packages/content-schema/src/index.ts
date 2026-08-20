export {
  hasUnverifiedMetrics,
  isRightsApproved,
  metricClaimSchema,
  packageRelativePathSchema,
  passageRefSchema,
  richTextBlockSchema,
  rightsRecordSchema,
  semverSchema,
  slugSchema,
} from './shared.js';
export type { MetricClaim, PassageRef, RichTextBlock, RightsRecord } from './shared.js';

export {
  GEOGRAPHIC_SCOPE_TYPES,
  TILE_TIERS,
  cameraPoseSchema,
  canvasTreatmentSchema,
  geographicFramingSchema,
  previewEmphasisSchema,
} from './framing.js';
export type { CameraPose, GeographicFraming, GeographicScopeType, TileTier } from './framing.js';

export { MEDIA_KINDS, mediaAssetSchema } from './media.js';
export type { MediaAsset, MediaKind } from './media.js';

export { voiceoverAssetSchema } from './voiceover.js';
export type { VoiceoverAsset } from './voiceover.js';

export {
  KNOWN_BEAT_KINDS,
  SEQUENCE_TIMEBASES,
  beatSchema,
  compositionSpecSchema,
  contentSequenceSchema,
} from './sequence.js';
export type { Beat, CompositionSpec, ContentSequence, SequenceTimebase } from './sequence.js';

export {
  CONTENT_OPTION_POSITIONS,
  KNOWN_FORMAT_IDS,
  contentOptionSchema,
} from './content-option.js';
export type { ContentOption, ContentOptionPosition, FormatId } from './content-option.js';

export { markerSpecSchema, projectSchema } from './project.js';
export type { MarkerSpec, Project } from './project.js';

export { categorySchema } from './category.js';
export type { Category } from './category.js';

export {
  canonicalJson,
  contentHash,
  releaseIntegritySchema,
  sha256ContentHashSchema,
} from './integrity.js';
export type { ContentHash, ReleaseIntegrity } from './integrity.js';

export { CONTENT_PACKAGE_SCHEMA_VERSION, manifestSchema } from './manifest.js';
export type { Manifest } from './manifest.js';

export { categoriesFileSchema, releaseSchema } from './release.js';
export type { Release } from './release.js';

export {
  CHANNEL_EVENT_TYPES,
  RELEASE_CHANNEL_NAMES,
  canPublishToProduction,
  channelEventSchema,
  channelsFileSchema,
} from './channels.js';
export type {
  ChannelEvent,
  ChannelEventType,
  ChannelsFile,
  ReleaseChannelName,
} from './channels.js';

export {
  REVIEW_STATES,
  REVIEW_STATE_TRANSITIONS,
  changeRecordSchema,
  claimSchema,
  draftAnalysisContentSchema,
  draftAnalysisEnvelopeSchema,
  draftAnalysisSchema,
  editorialOptionSchema,
  isApprovedForPublish,
  isLegalReviewStateTransition,
  proposedOptionContentSchema,
  proposedOptionContentsSchema,
  proposedOptionSchema,
  proposedOptionsEnvelopeSchema,
  proposedOptionsSchema,
  sourceAttachmentSchema,
  sourcePassageSchema,
  sourcedTextSchema,
  submissionSchema,
  textRevisionContentSchema,
  textRevisionEnvelopeSchema,
  violatesAiApprovalInvariant,
} from './editorial.js';
export type {
  ChangeRecord,
  Claim,
  DraftAnalysis,
  DraftAnalysisContent,
  DraftProvenance,
  EditorialOption,
  ProducedBy,
  ProposedOption,
  ProposedOptionContent,
  ReviewState,
  SourceAttachment,
  SourcePassage,
  SourcedText,
  Submission,
  TextRevisionContent,
} from './editorial.js';
