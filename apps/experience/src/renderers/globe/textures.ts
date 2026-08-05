// Globe texture profiles are local package paths only — no runtime CDN requests. The initial
// renderer is procedural until curated event artwork is placed at these paths; the profiles keep
// the R14 512 MiB GPU budget and quality fallback explicit before that artwork arrives.

export const GLOBE_TEXTURE_BUDGET_BYTES = 512 * 1024 * 1024;

export type GlobeTextureProfileId = 'event' | 'mip-capped';

export interface GlobeTextureAsset {
  readonly id: 'day' | 'night' | 'clouds' | 'normal';
  readonly path: string;
  readonly width: number;
  readonly height: number;
}

export interface GlobeTextureProfile {
  readonly id: GlobeTextureProfileId;
  readonly assets: readonly GlobeTextureAsset[];
  readonly estimatedGpuBytes: number;
  readonly fallback: { readonly id: GlobeTextureProfileId } | null;
}

function estimateMipmappedRgbaBytes(width: number, height: number): number {
  // Full mip chains consume approximately 4/3 of the base RGBA8 texture allocation.
  return Math.ceil(width * height * 4 * (4 / 3));
}

function profile(
  id: GlobeTextureProfileId,
  assets: readonly GlobeTextureAsset[],
  fallback: GlobeTextureProfile['fallback'],
): GlobeTextureProfile {
  return {
    id,
    assets,
    estimatedGpuBytes: assets.reduce(
      (total, asset) => total + estimateMipmappedRgbaBytes(asset.width, asset.height),
      0,
    ),
    fallback,
  };
}

const EVENT_ASSETS = [
  { id: 'day', path: '/textures/earth-day.webp', width: 4096, height: 2048 },
  { id: 'night', path: '/textures/earth-night.webp', width: 4096, height: 2048 },
  { id: 'clouds', path: '/textures/earth-clouds.webp', width: 2048, height: 1024 },
  { id: 'normal', path: '/textures/earth-normal.webp', width: 2048, height: 1024 },
] as const satisfies readonly GlobeTextureAsset[];

const MIP_CAPPED_ASSETS = [
  { id: 'day', path: '/textures/earth-day-2k.webp', width: 2048, height: 1024 },
  { id: 'night', path: '/textures/earth-night-2k.webp', width: 2048, height: 1024 },
  { id: 'clouds', path: '/textures/earth-clouds-1k.webp', width: 1024, height: 512 },
  { id: 'normal', path: '/textures/earth-normal-1k.webp', width: 1024, height: 512 },
] as const satisfies readonly GlobeTextureAsset[];

export const GLOBE_TEXTURE_PROFILES = {
  event: profile('event', EVENT_ASSETS, { id: 'mip-capped' }),
  'mip-capped': profile('mip-capped', MIP_CAPPED_ASSETS, null),
} as const satisfies Record<GlobeTextureProfileId, GlobeTextureProfile>;

export function getGlobeTextureProfile(id: GlobeTextureProfileId = 'event'): GlobeTextureProfile {
  return GLOBE_TEXTURE_PROFILES[id];
}
