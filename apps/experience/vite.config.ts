import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

// Research R16: Vite build with local Cesium static-asset handling (CESIUM_BASE_URL pinned to
// locally served files, no CDN dependency — offline requirement QR-004). Cesium scene code is
// added by later phases (T026 CesiumStageAdapter); this config only establishes the pipeline.
export default defineConfig({
  plugins: [react(), cesium()],
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
