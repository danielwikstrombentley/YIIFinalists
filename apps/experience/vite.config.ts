import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

// Research R16: Vite build with local Cesium static-asset handling (CESIUM_BASE_URL pinned to
// locally served files, no CDN dependency — offline requirement QR-004). Cesium scene code is
// added by later phases (T026 CesiumStageAdapter); this config only establishes the pipeline.
//
// Dev-only proxy (T019/T020): the kiosk sidecar (tools/kiosk) serves the active content release,
// the WS input relay, and the telemetry sink on its own port (default 4174, see
// tools/kiosk/src/config.ts). Proxying these paths keeps the app's own code using the same
// same-origin relative paths in dev and production (production: the kiosk server itself serves
// the built app at `/`, so no proxy is needed there at all).
const KIOSK_DEV_URL = process.env.KIOSK_DEV_URL ?? 'http://localhost:4174';

export default defineConfig({
  plugins: [react(), cesium()],
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/content': KIOSK_DEV_URL,
      '/telemetry': KIOSK_DEV_URL,
      '/ws': { target: KIOSK_DEV_URL, ws: true },
    },
  },
});
