// Globe texture profiles are local package paths only — no runtime CDN requests. The supplied 2K
// maps are the active local profile; the higher-resolution event profile remains a future asset
// upgrade while preserving the R14 GPU budget and explicit fallback level.

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
  { id: 'day', path: '/textures/2k_earth_daymap.jpg', width: 2048, height: 1024 },
  { id: 'night', path: '/textures/2k_earth_nightmap.jpg', width: 2048, height: 1024 },
  { id: 'clouds', path: '/textures/2k_earth_clouds.jpg', width: 2048, height: 1024 },
  { id: 'normal', path: '/textures/2k_earth_normal_map.png', width: 2048, height: 1024 },
] as const satisfies readonly GlobeTextureAsset[];

export const GLOBE_TEXTURE_PROFILES = {
  event: profile('event', EVENT_ASSETS, { id: 'mip-capped' }),
  'mip-capped': profile('mip-capped', MIP_CAPPED_ASSETS, null),
} as const satisfies Record<GlobeTextureProfileId, GlobeTextureProfile>;

export function getGlobeTextureProfile(
  id: GlobeTextureProfileId = 'mip-capped',
): GlobeTextureProfile {
  return GLOBE_TEXTURE_PROFILES[id];
}
