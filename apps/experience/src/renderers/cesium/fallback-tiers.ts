import type { GeographicFraming } from '@yii/content-schema';

/** The availability order from research R4: streamed tiles, event-local scene, then safe art. */
export const CESIUM_STAGE_TIERS = [
  'photorealistic',
  'local-fallback-scene',
  'safe-composition',
] as const;

export type CesiumStageTier = (typeof CESIUM_STAGE_TIERS)[number];

export interface TierDegradation {
  from: CesiumStageTier;
  to: CesiumStageTier;
  projectId: string;
  reason: string;
}

export function initialStageTier(framing: GeographicFraming): CesiumStageTier {
  return framing.tileTier;
}

export function nextStageTier(tier: CesiumStageTier): CesiumStageTier | null {
  const index = CESIUM_STAGE_TIERS.indexOf(tier);
  return CESIUM_STAGE_TIERS[index + 1] ?? null;
}

/**
 * Non-textual local-safe surface used while a tile tier is unavailable or is being prepared.
 * Its owning adapter keeps it behind the handover cover so visitors never see a blank/technical
 * error state; operators receive the degradation event through the injected callback instead.
 */
export class FallbackSurface {
  readonly element: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.element = document.createElement('div');
    this.element.dataset.testid = 'cesium-fallback-surface';
    this.element.setAttribute('aria-hidden', 'true');
    Object.assign(this.element.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      opacity: '0',
      background: 'radial-gradient(circle at 50% 40%, #294d68 0%, #102838 45%, #07131d 100%)',
      transition: 'opacity 120ms linear',
    });
    container.append(this.element);
  }

  show(tier: Exclude<CesiumStageTier, 'photorealistic'>): void {
    this.element.dataset.tier = tier;
    this.element.style.background =
      tier === 'local-fallback-scene'
        ? 'radial-gradient(circle at 55% 35%, #547482 0%, #1f3d48 48%, #0c1b26 100%)'
        : 'radial-gradient(circle at 50% 40%, #294d68 0%, #102838 45%, #07131d 100%)';
    this.element.style.opacity = '1';
  }

  hide(): void {
    this.element.style.opacity = '0';
  }

  dispose(): void {
    this.element.remove();
  }
}
