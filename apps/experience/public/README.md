This directory holds statically served assets for the experience runtime.

- Cesium's worker/asset bundle is copied here automatically at dev/build time by
  `vite-plugin-cesium` (see `../vite.config.ts`) — nothing to commit manually.
- Globe textures, fonts, and other locally-shipped critical assets land here in later phases
  (e.g. T023 cinematic globe textures) to satisfy the offline/event-local requirement (QR-004).
