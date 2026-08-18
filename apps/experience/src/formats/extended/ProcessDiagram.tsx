import { FormatCopy, FormatShell } from '../core/shared.js';
import type { ContentFormatProps } from '../types.js';

/** A content-driven process/workflow diagram that remains legible without animation. */
export function ProcessDiagram({ data, formatId = 'process-diagram' }: ContentFormatProps) {
  return (
    <FormatShell formatId={formatId}>
      <ol className="yii-content-format__process" data-animation-target="process-diagram.nodes">
        {data.displayText.map((block, index) => (
          <li key={`${data.id}:process:${index}`}>
            <span aria-hidden="true">{index + 1}</span>
            {block.text}
          </li>
        ))}
      </ol>
      <FormatCopy data={data} target="process-diagram.copy" className="yii-content-format__copy" />
    </FormatShell>
  );
}
