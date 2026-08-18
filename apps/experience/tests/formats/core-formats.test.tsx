import type { MediaAsset } from '@yii/content-schema';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ContentFormatComposition,
  coreFormatRegistry,
  type ContentFormatData,
  type CoreContentFormatId,
} from '../../src/formats/registry.js';

const IMAGE: MediaAsset = {
  id: 'hero-image',
  kind: 'image',
  file: 'projects/project-1/media/hero.jpg',
  rights: { holder: 'Test', status: 'approved' },
  aiGenerated: false,
};

const VIDEO_FALLBACK: MediaAsset = {
  id: 'hero-video-fallback',
  kind: 'video',
  file: 'projects/project-1/media/hero-fallback.mp4',
  fallback: 'hero-video-fallback',
  rights: { holder: 'Test', status: 'approved' },
  aiGenerated: false,
};

const VIDEO: MediaAsset = {
  id: 'hero-video',
  kind: 'video',
  file: 'projects/project-1/media/hero.mp4',
  fallback: VIDEO_FALLBACK.id,
  rights: { holder: 'Test', status: 'approved' },
  aiGenerated: false,
};

const FORMAT_DATA: ContentFormatData = {
  id: 'project-1:1',
  title: 'A data-driven story',
  displayText: [
    { type: 'headline', text: 'A bold project outcome' },
    { type: 'paragraph', text: 'A concise supporting explanation.' },
  ],
  mediaRefs: [IMAGE, VIDEO, VIDEO_FALLBACK],
};

const CORE_IDS: readonly CoreContentFormatId[] = [
  'text-led',
  'text-image',
  'full-image',
  'video',
  'hero-numbers',
  'animated-metrics',
  'quote',
];

describe('core content-format registry', () => {
  it.each(CORE_IDS)(
    '%s mounts from data, declares animation targets, and leaves no residue on unmount',
    (id) => {
      const definition = coreFormatRegistry.require(id);
      const { container, unmount } = render(
        <definition.Component
          data={FORMAT_DATA}
          resolveAssetUrl={(path) => `/content/releases/v1/${path}`}
        />,
      );

      const format = screen.getByTestId(`format-${id}`);
      expect(format).toHaveTextContent(FORMAT_DATA.displayText[0]?.text ?? '');
      expect(definition.animationTargets.length).toBeGreaterThan(0);
      for (const target of definition.animationTargets) {
        expect(format.querySelector(`[data-animation-target="${target}"]`)).not.toBeNull();
      }

      unmount();
      expect(container).toBeEmptyDOMElement();
    },
  );

  it('composes multiple format definitions from one content option without project-specific code', () => {
    render(
      <ContentFormatComposition
        formatIds={['text-led', 'text-image', 'quote']}
        data={FORMAT_DATA}
        resolveAssetUrl={(path) => `/content/releases/v1/${path}`}
      />,
    );

    expect(screen.getByTestId('format-text-led')).toBeInTheDocument();
    expect(screen.getByTestId('format-text-image')).toBeInTheDocument();
    expect(screen.getByTestId('format-quote')).toBeInTheDocument();
    expect(screen.queryByTestId('public-menu')).not.toBeInTheDocument();
  });

  it('maps the established package format ids to reusable core definitions', () => {
    expect(coreFormatRegistry.require('overview-hero').id).toBe('overview-hero');
    expect(coreFormatRegistry.require('metric-reveal').id).toBe('metric-reveal');
    expect(coreFormatRegistry.require('media-gallery').id).toBe('media-gallery');
    expect(coreFormatRegistry.require('quote-panel').id).toBe('quote-panel');
  });
});
