import { FormatCopy, FormatShell } from './shared.js';
import { assetUrl, findMedia, type ContentFormatProps } from '../types.js';

/** Full-bleed image composition with a concise, independently legible copy treatment. */
export function FullImage({ data, formatId = 'full-image', resolveAssetUrl }: ContentFormatProps) {
  const image = findMedia(data, (asset) => asset.kind === 'image');
  return (
    <FormatShell formatId={formatId}>
      {image ? (
        <img
          alt={data.title}
          className="yii-content-format__full-image"
          data-animation-target="full-image.media"
          src={assetUrl(image, resolveAssetUrl)}
        />
      ) : (
        <div
          className="yii-content-format__media-placeholder"
          data-animation-target="full-image.media"
        />
      )}
      <FormatCopy
        data={data}
        target="full-image.copy"
        className="yii-content-format__image-caption"
      />
    </FormatShell>
  );
}
