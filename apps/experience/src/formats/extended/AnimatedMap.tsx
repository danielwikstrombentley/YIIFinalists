import { FormatCopy, FormatShell } from '../core/shared.js';
import { assetUrl, findMedia, type ContentFormatProps } from '../types.js';

/** A local map/diagram treatment layered over, never substituted for, geographic context. */
export function AnimatedMap({
  data,
  formatId = 'animated-map',
  resolveAssetUrl,
}: ContentFormatProps) {
  const mapAsset =
    findMedia(data, (asset) => asset.kind === 'diagram') ??
    findMedia(data, (asset) => asset.kind === 'image');

  return (
    <FormatShell formatId={formatId}>
      <div
        className="yii-content-format__animated-map"
        data-animation-target="animated-map.surface"
      >
        {mapAsset ? (
          <img alt={data.title} src={assetUrl(mapAsset, resolveAssetUrl)} />
        ) : (
          <div className="yii-content-format__media-placeholder" />
        )}
      </div>
      <FormatCopy data={data} target="animated-map.copy" className="yii-content-format__copy" />
    </FormatShell>
  );
}
