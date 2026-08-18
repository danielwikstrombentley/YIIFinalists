import { FormatCopy, FormatShell } from './shared.js';
import type { ContentFormatProps } from '../types.js';

/** Large-format text-first composition for concise project narrative beats. */
export function TextLed({ data, formatId = 'text-led' }: ContentFormatProps) {
  return (
    <FormatShell formatId={formatId}>
      <h2 className="yii-content-format__eyebrow">{data.title}</h2>
      <FormatCopy data={data} target="text-led.copy" className="yii-content-format__text-led" />
    </FormatShell>
  );
}
