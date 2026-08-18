import { createElement, Fragment, type ComponentType, type ReactNode } from 'react';
import './formats.css';
import { AnimatedMetrics } from './core/AnimatedMetrics.js';
import { FullImage } from './core/FullImage.js';
import { HeroNumbers } from './core/HeroNumbers.js';
import { Quote } from './core/Quote.js';
import { TextImage } from './core/TextImage.js';
import { TextLed } from './core/TextLed.js';
import { Video } from './core/Video.js';
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

export interface ContentFormatDefinition {
  id: string;
  Component: ComponentType<ContentFormatProps>;
  /** Semantic targets consumed by the sequence compiler rather than project-specific animation. */
  animationTargets: readonly string[];
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

function definition(
  id: string,
  Component: ComponentType<ContentFormatProps>,
  animationTargets: readonly string[],
): ContentFormatDefinition {
  return { id, Component, animationTargets };
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
  // `map-context` stays a safe generic image treatment until the specialised animated-map format
  // lands in T042; it never exposes a blank or project-specific bespoke view in the meantime.
  definition('map-context', FullImage, fullImageTargets),
  definition('quote-panel', Quote, quoteTargets),
]);

export interface ContentFormatCompositionProps extends Omit<ContentFormatProps, 'formatId'> {
  formatIds: readonly string[];
  registry?: ContentFormatRegistry;
}

/** Mounts any ordered combination declared by validated option data; unknown ids stay invisible. */
export function ContentFormatComposition({
  formatIds,
  registry = coreFormatRegistry,
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
