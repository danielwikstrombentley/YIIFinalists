import type { MediaAsset } from '@yii/content-schema';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ContentFormatComposition,
  contentFormatRegistry,
  extendedFormatRegistry,
  type ContentFormatData,
  type ExtendedContentFormatId,
} from '../../src/formats/registry.js';

const IMAGE: MediaAsset = {
  id: 'site-image',
  kind: 'image',
  file: 'projects/project-1/media/site.jpg',
  rights: { holder: 'Test', status: 'approved' },
  aiGenerated: false,
};

const IMAGE_SEQUENCE: MediaAsset = {
  id: 'construction-frames',
  kind: 'image-sequence',
  file: 'projects/project-1/media/construction/',
  rights: { holder: 'Test', status: 'approved' },
  aiGenerated: false,
};

const MODEL_FALLBACK: MediaAsset = {
  id: 'site-model-fallback',
  kind: 'image',
  file: 'projects/project-1/media/site-model-poster.jpg',
  rights: { holder: 'Test', status: 'approved' },
  aiGenerated: false,
};

const MODEL: MediaAsset = {
  id: 'site-model',
  kind: 'model3d',
  file: 'projects/project-1/media/site-model.glb',
  fallback: MODEL_FALLBACK.id,
  rights: { holder: 'Test', status: 'approved' },
  aiGenerated: false,
};

const FORMAT_DATA: ContentFormatData = {
  id: 'project-1:1',
  title: 'A data-driven story',
  displayText: [
    { type: 'headline', text: 'A bold project outcome' },
    { type: 'paragraph', text: 'A concise supporting explanation.' },
    { type: 'paragraph', text: 'A final, legible narrative step.' },
  ],
  mediaRefs: [IMAGE, IMAGE_SEQUENCE, MODEL, MODEL_FALLBACK],
};

const EXTENDED_IDS: readonly ExtendedContentFormatId[] = [
  'timeline',
  'process-diagram',
  'comparison',
  'image-sequence',
  'animated-map',
  'geographic-camera-sequence',
  'highlight-region',
  'model-3d',
  'construction-sequence',
  'layer-reveal',
  'technology-breakdown',
  'multi-step',
];

describe('extended content-format registry', () => {
  it.each(EXTENDED_IDS)(
    '%s mounts from validated data, declares animation targets, and leaves no residue on unmount',
    (id) => {
      const definition = extendedFormatRegistry.require(id);
      const nativeCameraFlight = {
        isNativeFlightActive: id === 'geographic-camera-sequence',
        start: vi.fn(() => ({ cancel: vi.fn() })),
      };
      const { container, unmount } = render(
        <definition.Component
          data={FORMAT_DATA}
          nativeCameraFlight={nativeCameraFlight}
          resolveAssetUrl={(path) => `/content/releases/v1/${path}`}
        />,
      );

      const format = screen.getByTestId(`format-${id}`);
      expect(format).toHaveTextContent(FORMAT_DATA.displayText[0]?.text ?? '');
      expect(definition.animationTargets.length).toBeGreaterThan(0);
      for (const target of definition.animationTargets) {
        expect(format.querySelector(`[data-animation-target="${target}"]`)).not.toBeNull();
      }

      if (id === 'geographic-camera-sequence') {
        expect(definition.cameraMotion).toBe('native-flight');
        expect(format.querySelector('[data-camera-owner]')).toHaveAttribute(
          'data-camera-owner',
          'native-flight',
        );
        // The declarative format marks a native camera beat; only the sequence compiler may start
        // it through the camera-flight adapter, so rendering cannot race the active native flight.
        expect(nativeCameraFlight.start).not.toHaveBeenCalled();
      }

      unmount();
      expect(container).toBeEmptyDOMElement();
    },
  );

  it('registers aliases for the remaining FR-014 variations without project-specific views', () => {
    expect(extendedFormatRegistry.require('workflow-diagram').id).toBe('workflow-diagram');
    expect(extendedFormatRegistry.require('before-after').id).toBe('before-after');
    expect(extendedFormatRegistry.require('side-by-side').id).toBe('side-by-side');
    expect(extendedFormatRegistry.require('digital-twin').id).toBe('digital-twin');
    expect(extendedFormatRegistry.require('reality-model').id).toBe('reality-model');
    expect(extendedFormatRegistry.require('map-context').id).toBe('map-context');
  });

  it('composes core and extended format definitions through one runtime registry', () => {
    render(
      <ContentFormatComposition
        formatIds={['text-led', 'timeline', 'animated-map', 'multi-step']}
        registry={contentFormatRegistry}
        data={FORMAT_DATA}
        resolveAssetUrl={(path) => `/content/releases/v1/${path}`}
      />,
    );

    expect(screen.getByTestId('format-text-led')).toBeInTheDocument();
    expect(screen.getByTestId('format-timeline')).toBeInTheDocument();
    expect(screen.getByTestId('format-animated-map')).toBeInTheDocument();
    expect(screen.getByTestId('format-multi-step')).toBeInTheDocument();
    expect(screen.queryByTestId('public-menu')).not.toBeInTheDocument();
  });
});
