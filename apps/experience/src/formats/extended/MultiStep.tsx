import { FormatCopy, FormatShell } from '../core/shared.js';
import type { ContentFormatProps } from '../types.js';

/** Reusable multi-step narrative shell whose progression is controlled by declared sequence beats. */
export function MultiStep({ data, formatId = 'multi-step' }: ContentFormatProps) {
  return (
    <FormatShell formatId={formatId}>
      <ol className="yii-content-format__multi-step" data-animation-target="multi-step.steps">
        {data.displayText.map((block, index) => (
          <li key={`${data.id}:step:${index}`}>
            <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <p>{block.text}</p>
          </li>
        ))}
      </ol>
      <FormatCopy data={data} target="multi-step.copy" className="yii-content-format__copy" />
    </FormatShell>
  );
}
