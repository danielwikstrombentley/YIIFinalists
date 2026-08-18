import type { ReactNode } from 'react';
import type { ContentFormatData } from '../types.js';

export interface FormatShellProps {
  formatId: string;
  children: ReactNode;
}

export function FormatShell({ formatId, children }: FormatShellProps) {
  return (
    <section
      className={`yii-content-format yii-content-format--${formatId}`}
      data-format-id={formatId}
      data-testid={`format-${formatId}`}
    >
      {children}
    </section>
  );
}

export interface FormatCopyProps {
  data: ContentFormatData;
  target: string;
  className?: string;
}

export function FormatCopy({ data, target, className = '' }: FormatCopyProps) {
  return (
    <div className={className} data-animation-target={target}>
      {data.displayText.map((block, index) => (
        <p key={`${data.id}:${index}`} className="yii-content-format__copy-block">
          {block.text}
        </p>
      ))}
    </div>
  );
}
