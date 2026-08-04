import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Kiosk config (T019): env-based, never committed (research.md R4/R12). `ION_ACCESS_TOKEN` /
// `ION_GOOGLE_TILES_ASSET_ID` pass through to the served app's runtime config only — this module
// never logs their values.

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');

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

export function loadKioskConfig(env: NodeJS.ProcessEnv = process.env): KioskConfig {
  return {
    port: Number(env.KIOSK_PORT ?? 4174),
    staticRoot: env.KIOSK_STATIC_ROOT ?? join(repoRoot, 'apps', 'experience', 'dist'),
    contentRoot: env.KIOSK_CONTENT_ROOT ?? join(repoRoot, 'apps', 'content-pipeline', 'assets', 'sample'),
    logDir: env.KIOSK_LOG_DIR ?? join(here, '..', 'logs'),
    ionAccessToken: env.ION_ACCESS_TOKEN,
    ionGoogleTilesAssetId: env.ION_GOOGLE_TILES_ASSET_ID,
  };
}
