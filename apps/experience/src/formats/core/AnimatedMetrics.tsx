import { FormatCopy, FormatShell } from './shared.js';
import type { ContentFormatProps } from '../types.js';

/** Metric presentation with a stable target for the sequence compiler to animate declaratively. */
export function AnimatedMetrics({ data, formatId = 'animated-metrics' }: ContentFormatProps) {
  return (
    <FormatShell formatId={formatId}>
      <div className="yii-content-format__metric" data-animation-target="animated-metrics.metric">
        {data.displayText.map((block, index) => (
          <span key={`${data.id}:metric:${index}`}>{block.text}</span>
        ))}
      </div>
      <FormatCopy data={data} target="animated-metrics.copy" className="yii-content-format__copy" />
    </FormatShell>
  );
}
