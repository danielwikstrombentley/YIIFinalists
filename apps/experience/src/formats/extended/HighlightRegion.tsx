import { FormatCopy, FormatShell } from '../core/shared.js';
import type { ContentFormatProps } from '../types.js';

/** Content-directed region emphasis; its visual layer is disposable with the enclosing sequence. */
export function HighlightRegion({ data, formatId = 'highlight-region' }: ContentFormatProps) {
  return (
    <FormatShell formatId={formatId}>
      <div
        aria-hidden="true"
        className="yii-content-format__highlight-region"
        data-animation-target="highlight-region.overlay"
      />
      <FormatCopy data={data} target="highlight-region.copy" className="yii-content-format__copy" />
    </FormatShell>
  );
}
