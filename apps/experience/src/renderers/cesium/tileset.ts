import { Cesium3DTileset, Ion } from 'cesium';

/** Conservative initial ceiling; R14 requires the final values to be measured on event hardware. */
export const INITIAL_TILE_CACHE_BYTES = 128 * 1024 * 1024;
export const INITIAL_TILE_CACHE_OVERFLOW_BYTES = 64 * 1024 * 1024;

/** Small structural type keeps adapter tests independent of WebGL/Cesium construction. */
export interface CesiumTilesetLike {
  show?: boolean;
  /** Cesium collections may destroy a primitive as part of `remove()`. */
  isDestroyed?(): boolean;
  destroy?(): void;
}

export interface IonTilesetRequest {
  assetId: number;
  accessToken: string;
}

/**
 * Loads a Google Photorealistic 3D Tiles asset through Cesium ion. The access token originates
 * from kiosk-local runtime configuration and is never compiled into the experience bundle.
 */
export async function loadIonTileset({ assetId, accessToken }: IonTilesetRequest) {
  if (!accessToken) throw new Error('Cesium ion access token is unavailable.');

  const previousAccessToken = Ion.defaultAccessToken;
  Ion.defaultAccessToken = accessToken;
  try {
    return await Cesium3DTileset.fromIonAssetId(assetId, {
      cacheBytes: INITIAL_TILE_CACHE_BYTES,
      maximumCacheOverflowBytes: INITIAL_TILE_CACHE_OVERFLOW_BYTES,
      preloadWhenHidden: true,
      preloadFlightDestinations: true,
      dynamicScreenSpaceError: true,
    });
  } finally {
    // `fromIonAssetId()` captures its ion resource synchronously. Restoring the global avoids
    // leaking credentials into unrelated Cesium consumers in the same kiosk process.
    Ion.defaultAccessToken = previousAccessToken;
  }
}
