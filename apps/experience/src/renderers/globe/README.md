# Globe renderer ownership

- `GlobeScene` owns the Three.js scene graph, shaders, and texture-profile contract.
- `GlobeMarkerSystem` owns only instanced marker geometry/material and target-scale state.
- `GlobeCameraRig` owns orbit parameters and writes the Three.js camera through the shared
  GSAP motion adapter in `src/orchestration/`.
- `GlobeRendererAdapter` owns the canvas/WebGL renderer, lifecycle, and its one registration
  with the shared `Ticker`. It is also the explicit resource-ownership map entry for the globe:
  `dispose()` releases the DOM canvas, WebGL renderer, `GlobeScene` shader/geometry resources,
  `GlobeMarkerSystem` geometry/material, `GlobeCameraRig` motion handle, and ticker registration.

No module in this directory creates an independent `requestAnimationFrame` loop. Rendering is
performed only by the app-owned ticker, and machine wiring remains the sole navigation authority.
