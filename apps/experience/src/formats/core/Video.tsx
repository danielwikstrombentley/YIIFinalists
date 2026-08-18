import { useEffect, useRef } from 'react';
import { FormatCopy, FormatShell } from './shared.js';
import { assetUrl, findMedia, type ContentFormatProps } from '../types.js';

/**
 * Routes video through the owned VideoSurface when supplied by the sequence runtime. Without a
 * surface (for static inspection or an unavailable adapter), its package fallback shell remains
 * visibly complete instead of exposing a blank frame.
 */
export function Video({
  data,
  formatId = 'video',
  resolveAssetUrl,
  videoSurface,
}: ContentFormatProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const video = findMedia(data, (asset) => asset.kind === 'video');
  const fallback = video?.fallback
    ? data.mediaRefs.find((asset) => asset.id === video.fallback)
    : undefined;
  const poster = findMedia(data, (asset) => asset.kind === 'image');
  const posterUrl = poster ? assetUrl(poster, resolveAssetUrl) : undefined;

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !video || !videoSurface) return;

    const playback = videoSurface.start(video, { fallback, posterUrl, waitForCanPlay: true });
    const element = videoSurface.activeElement;
    if (element) surface.replaceChildren(element);

    return () => {
      playback.cancel();
      surface.replaceChildren();
    };
  }, [fallback, posterUrl, video, videoSurface]);

  return (
    <FormatShell formatId={formatId}>
      <div
        ref={surfaceRef}
        className="yii-content-format__video-surface"
        data-animation-target="video.surface"
        data-video-asset-id={video?.id ?? ''}
      />
      <FormatCopy data={data} target="video.copy" className="yii-content-format__video-copy" />
    </FormatShell>
  );
}
