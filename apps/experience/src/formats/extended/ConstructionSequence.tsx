import { FormatCopy, FormatShell } from '../core/shared.js';
import type { ContentFormatProps } from '../types.js';

/** Ordered construction phases, readable as a complete static composition before motion begins. */
export function ConstructionSequence({
  data,
  formatId = 'construction-sequence',
}: ContentFormatProps) {
  return (
    <FormatShell formatId={formatId}>
      <ol
        className="yii-content-format__construction-sequence"
        data-animation-target="construction-sequence.steps"
      >
        {data.displayText.map((block, index) => (
          <li key={`${data.id}:construction:${index}`}>{block.text}</li>
        ))}
      </ol>
      <FormatCopy
        data={data}
        target="construction-sequence.copy"
        className="yii-content-format__copy"
      />
    </FormatShell>
  );
}
