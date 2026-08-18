import { FormatCopy, FormatShell } from '../core/shared.js';
import { assetUrl, type ContentFormatProps } from '../types.js';

/** Stacked approved imagery for a sequence-owned layer reveal, with every layer cleaned on unmount. */
export function LayerReveal({
  data,
  formatId = 'layer-reveal',
  resolveAssetUrl,
}: ContentFormatProps) {
  const layers = data.mediaRefs.filter((asset) => asset.kind === 'image').slice(0, 3);

  return (
    <FormatShell formatId={formatId}>
      <div className="yii-content-format__layer-reveal" data-animation-target="layer-reveal.layers">
        {layers.length > 0 ? (
          layers.map((asset, index) => (
            <img
              key={asset.id}
              alt={`${data.title} layer ${index + 1}`}
              src={assetUrl(asset, resolveAssetUrl)}
            />
          ))
        ) : (
          <div className="yii-content-format__media-placeholder" />
        )}
      </div>
      <FormatCopy data={data} target="layer-reveal.copy" className="yii-content-format__copy" />
    </FormatShell>
  );
}
