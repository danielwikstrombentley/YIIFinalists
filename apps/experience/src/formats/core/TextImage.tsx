import { FormatCopy, FormatShell } from './shared.js';
import { assetUrl, findMedia, type ContentFormatProps } from '../types.js';

/** Side-by-side narrative copy and approved package image, with a stable image animation target. */
export function TextImage({ data, formatId = 'text-image', resolveAssetUrl }: ContentFormatProps) {
  const image = findMedia(data, (asset) => asset.kind === 'image');
  return (
    <FormatShell formatId={formatId}>
      <div className="yii-content-format__split">
        <FormatCopy data={data} target="text-image.copy" className="yii-content-format__copy" />
        {image ? (
          <img
            alt={data.title}
            className="yii-content-format__image"
            data-animation-target="text-image.image"
            src={assetUrl(image, resolveAssetUrl)}
          />
        ) : (
          <div
            className="yii-content-format__media-placeholder"
            data-animation-target="text-image.image"
          />
        )}
      </div>
    </FormatShell>
  );
}
