# Globe renderer ownership

- `GlobeScene` owns the Three.js scene graph, shaders, and texture-profile contract.
- `GlobeMarkerSystem` owns only instanced marker geometry/material and target-scale state.
- `GlobeCameraRig` owns orbit parameters and writes the Three.js camera through the shared
  GSAP motion adapter in `src/orchestration/`.
- `GlobeRendererAdapter` (T026) will own the canvas/WebGL renderer, lifecycle, and its one
  registration with the shared `Ticker`.

No module in this directory creates an independent `requestAnimationFrame` loop. Rendering is
performed only by the app-owned ticker, and machine wiring remains the sole navigation authority.
