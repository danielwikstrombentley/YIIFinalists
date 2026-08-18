import type { MediaAsset, RichTextBlock } from '@yii/content-schema';
import type { VideoSurface } from '../media/VideoSurface.js';

/** Validated option material supplied by the future sequence compiler, never project-specific UI. */
export interface ContentFormatData {
  id: string;
  title: string;
  displayText: readonly RichTextBlock[];
  mediaRefs: readonly MediaAsset[];
}

export interface ContentFormatProps {
  data: ContentFormatData;
  /** Allows runtime content paths only after the validated loader has made them package-relative. */
  resolveAssetUrl?: (packageRelativePath: string) => string;
  /** Optional owned media surface; only the Video format consumes this adapter. */
  videoSurface?: VideoSurface;
  /** Provided by the registry so aliases still identify their exact declared format instance. */
  formatId?: string;
}

export function primaryText(data: ContentFormatData): string {
  return data.displayText[0]?.text ?? data.title;
}

export function findMedia(
  data: ContentFormatData,
  predicate: (asset: MediaAsset) => boolean,
): MediaAsset | undefined {
  return data.mediaRefs.find(predicate);
}

export function assetUrl(
  asset: MediaAsset,
  resolveAssetUrl: ContentFormatProps['resolveAssetUrl'],
): string {
  return resolveAssetUrl?.(asset.file) ?? asset.file;
}
