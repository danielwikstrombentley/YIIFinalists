import { FormatCopy, FormatShell } from '../core/shared.js';
import { assetUrl, findMedia, type ContentFormatProps } from '../types.js';

/**
 * 3D model, digital-twin, and reality-model treatment. It presents an approved fallback frame;
 * renderer ownership remains with the geographic adapter rather than a component-created WebGL loop.
 */
export function Model3D({ data, formatId = 'model-3d', resolveAssetUrl }: ContentFormatProps) {
  const model = findMedia(data, (asset) => asset.kind === 'model3d');
  const fallback = model?.fallback
    ? data.mediaRefs.find((asset) => asset.id === model.fallback)
    : undefined;

  return (
    <FormatShell formatId={formatId}>
      <div
        className="yii-content-format__model-3d"
        data-animation-target="model-3d.surface"
        data-model-asset-id={model?.id ?? ''}
      >
        {fallback?.kind === 'image' ? (
          <img alt={data.title} src={assetUrl(fallback, resolveAssetUrl)} />
        ) : (
          <div className="yii-content-format__media-placeholder" />
        )}
      </div>
      <FormatCopy data={data} target="model-3d.copy" className="yii-content-format__copy" />
    </FormatShell>
  );
}
