import { FormatCopy, FormatShell } from '../core/shared.js';
import { assetUrl, type ContentFormatProps } from '../types.js';

/** Before/after and side-by-side views share one resilient, content-driven comparison surface. */
export function Comparison({ data, formatId = 'comparison', resolveAssetUrl }: ContentFormatProps) {
  const images = data.mediaRefs.filter((asset) => asset.kind === 'image');
  const [before, after] = images;

  return (
    <FormatShell formatId={formatId}>
      <div className="yii-content-format__comparison">
        <div data-animation-target="comparison.before">
          {before ? (
            <img alt={`${data.title} before`} src={assetUrl(before, resolveAssetUrl)} />
          ) : (
            <div className="yii-content-format__media-placeholder" />
          )}
        </div>
        <div data-animation-target="comparison.after">
          {after ? (
            <img alt={`${data.title} after`} src={assetUrl(after, resolveAssetUrl)} />
          ) : (
            <div className="yii-content-format__media-placeholder" />
          )}
        </div>
      </div>
      <FormatCopy data={data} target="comparison.copy" className="yii-content-format__copy" />
    </FormatShell>
  );
}
