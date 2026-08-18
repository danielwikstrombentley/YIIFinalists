import { FormatShell } from './shared.js';
import { primaryText, type ContentFormatProps } from '../types.js';

/** A high-contrast editorial quotation, with meaning carried by text rather than colour or motion. */
export function Quote({ data, formatId = 'quote' }: ContentFormatProps) {
  return (
    <FormatShell formatId={formatId}>
      <blockquote className="yii-content-format__quote" data-animation-target="quote.copy">
        <p>“{primaryText(data)}”</p>
      </blockquote>
    </FormatShell>
  );
}
