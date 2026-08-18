import { createElement, Fragment, type ComponentType, type ReactNode } from 'react';
import './formats.css';
import { AnimatedMetrics } from './core/AnimatedMetrics.js';
import { FullImage } from './core/FullImage.js';
import { HeroNumbers } from './core/HeroNumbers.js';
import { Quote } from './core/Quote.js';
import { TextImage } from './core/TextImage.js';
import { TextLed } from './core/TextLed.js';
import { Video } from './core/Video.js';
import { AnimatedMap } from './extended/AnimatedMap.js';
import { Comparison } from './extended/Comparison.js';
import { ConstructionSequence } from './extended/ConstructionSequence.js';
import { GeoCameraSequence } from './extended/GeoCameraSequence.js';
import { HighlightRegion } from './extended/HighlightRegion.js';
import { ImageSequence } from './extended/ImageSequence.js';
import { LayerReveal } from './extended/LayerReveal.js';
import { Model3D } from './extended/Model3D.js';
import { MultiStep } from './extended/MultiStep.js';
import { ProcessDiagram } from './extended/ProcessDiagram.js';
import { TechBreakdown } from './extended/TechBreakdown.js';
import { Timeline } from './extended/Timeline.js';
import type { ContentFormatProps } from './types.js';

export type { ContentFormatData, ContentFormatProps } from './types.js';

export type CoreContentFormatId =
  | 'text-led'
  | 'text-image'
  | 'full-image'
  | 'video'
  | 'hero-numbers'
  | 'animated-metrics'
  | 'quote';

export type ExtendedContentFormatId =
  | 'timeline'
  | 'process-diagram'
  | 'comparison'
  | 'image-sequence'
  | 'animated-map'
  | 'geographic-camera-sequence'
  | 'highlight-region'
  | 'model-3d'
  | 'construction-sequence'
  | 'layer-reveal'
  | 'technology-breakdown'
  | 'multi-step';

export interface ContentFormatDefinition {
  id: string;
  Component: ComponentType<ContentFormatProps>;
  /** Semantic targets consumed by the sequence compiler rather than project-specific animation. */
  animationTargets: readonly string[];
  /** Geographic camera beats are compiled into the Cesium native-flight adapter, never GSAP. */
  cameraMotion?: 'native-flight';
}

export class ContentFormatRegistry {
  private readonly definitions = new Map<string, ContentFormatDefinition>();

  constructor(definitions: readonly ContentFormatDefinition[] = []) {
    for (const definition of definitions) this.register(definition);
  }

  register(definition: ContentFormatDefinition, replace = false): void {
    if (!replace && this.definitions.has(definition.id)) {
      throw new Error(`A content format named "${definition.id}" is already registered.`);
    }
    this.definitions.set(definition.id, definition);
  }

  get(id: string): ContentFormatDefinition | undefined {
    return this.definitions.get(id);
  }

  require(id: string): ContentFormatDefinition {
    const definition = this.get(id);
    if (!definition) throw new Error(`Unknown content format "${id}".`);
    return definition;
  }

  get ids(): readonly string[] {
    return [...this.definitions.keys()];
  }
}

const textLedTargets = ['text-led.copy'] as const;
const textImageTargets = ['text-image.copy', 'text-image.image'] as const;
const fullImageTargets = ['full-image.media', 'full-image.copy'] as const;
const videoTargets = ['video.surface', 'video.copy'] as const;
const heroNumbersTargets = ['hero-numbers.value', 'hero-numbers.copy'] as const;
const animatedMetricsTargets = ['animated-metrics.metric', 'animated-metrics.copy'] as const;
const quoteTargets = ['quote.copy'] as const;
const timelineTargets = ['timeline.track', 'timeline.copy'] as const;
const processTargets = ['process-diagram.nodes', 'process-diagram.copy'] as const;
const comparisonTargets = ['comparison.before', 'comparison.after', 'comparison.copy'] as const;
const imageSequenceTargets = ['image-sequence.frames', 'image-sequence.copy'] as const;
const animatedMapTargets = ['animated-map.surface', 'animated-map.copy'] as const;
const geographicCameraTargets = [
  'geographic-camera-sequence.flight',
  'geographic-camera-sequence.copy',
] as const;
const highlightRegionTargets = ['highlight-region.overlay', 'highlight-region.copy'] as const;
const model3dTargets = ['model-3d.surface', 'model-3d.copy'] as const;
const constructionTargets = ['construction-sequence.steps', 'construction-sequence.copy'] as const;
const layerRevealTargets = ['layer-reveal.layers', 'layer-reveal.copy'] as const;
const techBreakdownTargets = ['technology-breakdown.items', 'technology-breakdown.copy'] as const;
const multiStepTargets = ['multi-step.steps', 'multi-step.copy'] as const;

function definition(
  id: string,
  Component: ComponentType<ContentFormatProps>,
  animationTargets: readonly string[],
  cameraMotion?: ContentFormatDefinition['cameraMotion'],
): ContentFormatDefinition {
  return { id, Component, animationTargets, cameraMotion };
}

/**
 * Core, content-driven format set for FR-014. Established package IDs are aliases over the same
 * reusable components; no project uses bespoke presentation code.
 */
export const coreFormatRegistry = new ContentFormatRegistry([
  definition('text-led', TextLed, textLedTargets),
  definition('text-image', TextImage, textImageTargets),
  definition('full-image', FullImage, fullImageTargets),
  definition('video', Video, videoTargets),
  definition('hero-numbers', HeroNumbers, heroNumbersTargets),
  definition('animated-metrics', AnimatedMetrics, animatedMetricsTargets),
  definition('quote', Quote, quoteTargets),
  definition('overview-hero', TextLed, textLedTargets),
  definition('metric-reveal', AnimatedMetrics, animatedMetricsTargets),
  definition('media-gallery', TextImage, textImageTargets),
  definition('quote-panel', Quote, quoteTargets),
]);

/** Full specialised FR-014 set. Aliases preserve approved-package compatibility without forks. */
export const extendedFormatRegistry = new ContentFormatRegistry([
  definition('timeline', Timeline, timelineTargets),
  definition('process-diagram', ProcessDiagram, processTargets),
  definition('workflow-diagram', ProcessDiagram, processTargets),
  definition('comparison', Comparison, comparisonTargets),
  definition('before-after', Comparison, comparisonTargets),
  definition('side-by-side', Comparison, comparisonTargets),
  definition('image-sequence', ImageSequence, imageSequenceTargets),
  definition('animated-map', AnimatedMap, animatedMapTargets),
  definition('map-context', AnimatedMap, animatedMapTargets),
  definition(
    'geographic-camera-sequence',
    GeoCameraSequence,
    geographicCameraTargets,
    'native-flight',
  ),
  definition('highlight-region', HighlightRegion, highlightRegionTargets),
  definition('model-3d', Model3D, model3dTargets),
  definition('digital-twin', Model3D, model3dTargets),
  definition('reality-model', Model3D, model3dTargets),
  definition('construction-sequence', ConstructionSequence, constructionTargets),
  definition('layer-reveal', LayerReveal, layerRevealTargets),
  definition('technology-breakdown', TechBreakdown, techBreakdownTargets),
  definition('multi-step', MultiStep, multiStepTargets),
]);

/** The runtime's complete content-driven library: core plus every extended FR-014 capability. */
export const contentFormatRegistry = new ContentFormatRegistry([
  ...coreFormatRegistry.ids.map((id) => coreFormatRegistry.require(id)),
  ...extendedFormatRegistry.ids.map((id) => extendedFormatRegistry.require(id)),
]);

export interface ContentFormatCompositionProps extends Omit<ContentFormatProps, 'formatId'> {
  formatIds: readonly string[];
  registry?: ContentFormatRegistry;
}

/** Mounts any ordered combination declared by validated option data; unknown ids stay invisible. */
export function ContentFormatComposition({
  formatIds,
  registry = contentFormatRegistry,
  ...props
}: ContentFormatCompositionProps): ReactNode {
  return createElement(
    Fragment,
    null,
    formatIds.map((formatId) => {
      const format = registry.get(formatId);
      if (!format) return null;
      return createElement(format.Component, { ...props, formatId, key: formatId });
    }),
  );
}
