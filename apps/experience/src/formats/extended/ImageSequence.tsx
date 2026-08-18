import { FormatCopy, FormatShell } from '../core/shared.js';
import { assetUrl, findMedia, type ContentFormatProps } from '../types.js';

/** Image-sequence shell with a safe first-frame fallback while the orchestrator advances frames. */
export function ImageSequence({
  data,
  formatId = 'image-sequence',
  resolveAssetUrl,
}: ContentFormatProps) {
  const sequence = findMedia(data, (asset) => asset.kind === 'image-sequence');
  const poster = findMedia(data, (asset) => asset.kind === 'image');

  return (
    <FormatShell formatId={formatId}>
      <div
        className="yii-content-format__image-sequence"
        data-animation-target="image-sequence.frames"
        data-sequence-asset-id={sequence?.id ?? ''}
      >
        {poster ? (
          <img alt={data.title} src={assetUrl(poster, resolveAssetUrl)} />
        ) : (
          <div className="yii-content-format__media-placeholder" />
        )}
      </div>
      <FormatCopy data={data} target="image-sequence.copy" className="yii-content-format__copy" />
    </FormatShell>
  );
}
