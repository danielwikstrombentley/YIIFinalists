import { FormatCopy, FormatShell } from './shared.js';
import { primaryText, type ContentFormatProps } from '../types.js';

/** Large numeric/key-result treatment. Editorial data controls the value and supporting copy. */
export function HeroNumbers({ data, formatId = 'hero-numbers' }: ContentFormatProps) {
  return (
    <FormatShell formatId={formatId}>
      <strong
        className="yii-content-format__hero-number"
        data-animation-target="hero-numbers.value"
      >
        {primaryText(data)}
      </strong>
      <FormatCopy data={data} target="hero-numbers.copy" className="yii-content-format__copy" />
    </FormatShell>
  );
}
