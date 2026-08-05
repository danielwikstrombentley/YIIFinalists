import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PreviewMetadata } from '../../src/ui/PreviewMetadata.js';

const PROJECT_A = {
  id: 'cat-1-proj-1',
  name: 'Sample Project 1.1',
  organisation: 'Sample Organisation',
  country: 'Sampleland',
};

const PROJECT_B = {
  id: 'cat-1-proj-2',
  name: 'Sample Project 1.2',
  organisation: 'Another Organisation',
  country: 'Elsewhere',
};

describe('PreviewMetadata', () => {
  it('renders large-format preview identity only while category preview is active', () => {
    render(<PreviewMetadata state={{ categoryActive: 'preview' }} project={PROJECT_A} />);

    const metadata = screen.getByTestId('preview-metadata');
    expect(metadata).toHaveAttribute('data-project-id', PROJECT_A.id);
    expect(metadata).toHaveTextContent(PROJECT_A.name);
    expect(metadata).toHaveTextContent(PROJECT_A.organisation);
    expect(metadata).toHaveTextContent(PROJECT_A.country);
    expect(screen.queryByTestId('public-instructions')).not.toBeInTheDocument();
  });

  it('renders nothing outside categoryActive.preview or without a resolved preview project', () => {
    const { rerender } = render(<PreviewMetadata state="idle" project={PROJECT_A} />);
    expect(screen.queryByTestId('preview-metadata')).not.toBeInTheDocument();

    rerender(<PreviewMetadata state={{ categoryActive: 'preview' }} project={null} />);
    expect(screen.queryByTestId('preview-metadata')).not.toBeInTheDocument();
  });

  it('updates project identity through one persistent overlay shell without an unmount flash', () => {
    const { rerender } = render(
      <PreviewMetadata state={{ categoryActive: 'preview' }} project={PROJECT_A} />,
    );
    const overlay = screen.getByTestId('preview-metadata');

    rerender(<PreviewMetadata state={{ categoryActive: 'preview' }} project={PROJECT_B} />);

    expect(screen.getByTestId('preview-metadata')).toBe(overlay);
    expect(overlay).toHaveAttribute('data-project-id', PROJECT_B.id);
    expect(overlay).toHaveTextContent(PROJECT_B.name);
    expect(overlay).toHaveTextContent(PROJECT_B.organisation);
    expect(overlay).toHaveTextContent(PROJECT_B.country);
  });
});
