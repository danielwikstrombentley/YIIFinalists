import { FormatCopy, FormatShell } from '../core/shared.js';
import type { ContentFormatProps } from '../types.js';

/** Ordered milestones; content controls the labels while the sequence compiler owns their motion. */
export function Timeline({ data, formatId = 'timeline' }: ContentFormatProps) {
  return (
    <FormatShell formatId={formatId}>
      <ol className="yii-content-format__timeline" data-animation-target="timeline.track">
        {data.displayText.map((block, index) => (
          <li key={`${data.id}:timeline:${index}`}>{block.text}</li>
        ))}
      </ol>
      <FormatCopy data={data} target="timeline.copy" className="yii-content-format__copy" />
    </FormatShell>
  );
}
