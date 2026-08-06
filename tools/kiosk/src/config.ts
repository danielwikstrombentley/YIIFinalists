import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Kiosk config (T019): env-based, never committed (research.md R4/R12). `ION_ACCESS_TOKEN` /
// `ION_GOOGLE_TILES_ASSET_ID` pass through to the served app's runtime config only — this module
// never logs their values.

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const localEnvFile = join(repoRoot, '.env.local');

export interface KioskConfig {
  port: number;
  /** Directory containing the built experience app (index.html + assets). */
  staticRoot: string;
  /** Directory containing the active content release tree (channels.json, releases/...). */
  contentRoot: string;
  /** Directory telemetry JSONL files are appended to. */
  logDir: string;
  ionAccessToken: string | undefined;
  ionGoogleTilesAssetId: string | undefined;
}

/**
 * Loads root-level developer configuration for direct kiosk processes. Node preserves values
 * already exported by the shell, so deployment/CI environment settings take precedence.
 */
export function loadKioskLocalEnv(envFile = localEnvFile): void {
  try {
    process.loadEnvFile(envFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
}

function isPositiveIonAssetId(value: string | undefined): boolean {
  if (!value || !/^\d+$/.test(value)) return false;
  const assetId = Number(value);
  return Number.isSafeInteger(assetId) && assetId > 0;
}

/** Reports configuration mistakes without ever including the configured token or asset value. */
export function getKioskCesiumConfigurationWarning(config: KioskConfig): string | undefined {
  if (!config.ionAccessToken && !config.ionGoogleTilesAssetId) return undefined;
  if (!config.ionAccessToken) {
    return 'ION_ACCESS_TOKEN is missing; Cesium will use the local fallback tier.';
  }
  if (!isPositiveIonAssetId(config.ionGoogleTilesAssetId)) {
    return 'ION_GOOGLE_TILES_ASSET_ID must be a positive numeric Cesium ion asset ID; Cesium will use the local fallback tier.';
  }
  if (/^\d+$/.test(config.ionAccessToken)) {
    return 'ION_ACCESS_TOKEN appears to be numeric; use the long Cesium ion credential token rather than the asset ID.';
  }
  return undefined;
}

export function loadKioskConfig(env: NodeJS.ProcessEnv = process.env): KioskConfig {
  return {
    port: Number(env.KIOSK_PORT ?? 4174),
    staticRoot: env.KIOSK_STATIC_ROOT ?? join(repoRoot, 'apps', 'experience', 'dist'),
    contentRoot:
      env.KIOSK_CONTENT_ROOT ?? join(repoRoot, 'apps', 'content-pipeline', 'assets', 'sample'),
    logDir: env.KIOSK_LOG_DIR ?? join(here, '..', 'logs'),
    ionAccessToken: env.ION_ACCESS_TOKEN,
    ionGoogleTilesAssetId: env.ION_GOOGLE_TILES_ASSET_ID,
  };
}
