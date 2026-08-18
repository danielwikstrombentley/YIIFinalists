import { FormatCopy, FormatShell } from '../core/shared.js';
import type { ContentFormatProps } from '../types.js';

/** Data-led technology breakdown; items retain an accessible textual representation when static. */
export function TechBreakdown({ data, formatId = 'technology-breakdown' }: ContentFormatProps) {
  return (
    <FormatShell formatId={formatId}>
      <ul
        className="yii-content-format__tech-breakdown"
        data-animation-target="technology-breakdown.items"
      >
        {data.displayText.map((block, index) => (
          <li key={`${data.id}:technology:${index}`}>{block.text}</li>
        ))}
      </ul>
      <FormatCopy
        data={data}
        target="technology-breakdown.copy"
        className="yii-content-format__copy"
      />
    </FormatShell>
  );
}
