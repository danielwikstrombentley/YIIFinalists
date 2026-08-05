# Globe visual fidelity workstream

**Branch:** `feature/globe-visual-fidelity`

**Started:** 2026-08-05

**Base:** `2a2f634` (`task/001-T078-wire-globe-textures`)

**Status:** Visual pass 6 implemented; continuous rotation and editable cycle speeds awaiting review.

This is a one-off visual-polish workstream. It deliberately does **not** add or modify feature
specification tasks. Keep this document current after every feedback round so a new chat can resume
without reconstructing shader decisions from Git history.

## 1. Original review findings

The supplied 2K local textures were rendering, but four issues were visible:

1. The day map was too bright and saturated.
2. The night map was acceptable but city lights needed slightly more colour separation.
3. The cloud photograph was mounted on a shell that completed a rigid 360-degree orbit every 80
   seconds. The shader phase affected only the procedural fallback, not the loaded photograph.
4. The atmosphere was a radius-5.22 back-face sphere with a constant additive blue Fresnel term. It
   appeared as a thick, uniformly illuminated cyan ring rather than a thin atmosphere.

## 2. Rendering invariants

Preserve these constraints during every tuning round:

- `GlobeRendererAdapter` remains the sole owner of the renderer and render registration.
- There is one application ticker and no globe-specific `requestAnimationFrame`, interval, or timer.
- Cloud evolution receives delta time from the adapter's existing ticker callback.
- Earth, clouds, and atmosphere share one sun-direction uniform.
- Earth and clouds share the same cloud texture, cloud clock, cycle duration, and loaded-map flag so
  visible cloud formations and surface shadows cannot drift apart.
- Runtime textures remain local. No CDN or runtime network dependency may be introduced.
- Texture profiles must stay under the existing 512 MiB budget.
- Every created geometry, material, texture, render target, or future composer pass must have an
  explicit owner and disposal path.
- A hard browser reload is required after shader/default-geometry edits. The app-lifetime globe
  instance can survive Vite hot replacement, making an HMR-only screenshot misleading.

## 3. Current implementation

### Display colour pipeline

The Three.js renderer now explicitly uses:

- sRGB display output;
- AgX tone mapping;
- exposure `1.0`.

Day/night grading remains shader-local so daylight, emissive city lights, clouds, atmosphere, and
markers do not all receive the same corrective transform.

### Continuous globe and solar motion

The Earth and day/night light each run on an independent repeating GSAP timeline. Both use the
application's existing GSAP ticker and create no additional `requestAnimationFrame` loop.

- `globeRotationCycleSeconds` controls seconds per full Earth revolution.
- `sunOrbitCycleSeconds` controls seconds per full day/night-light revolution.
- `cloudCycleSeconds` separately controls the shader weather time-lapse.
- Lower cycle values are faster; higher values are slower.
- Each periodic destination is calculated as its current angle plus $2\pi$, so stopping and later
  restarting from an arbitrary angle remains seamless.

### Earth surface

The surface shader now:

- grades day exposure, saturation, and contrast independently;
- grades night saturation independently;
- boosts bright city-light pixels more than dark ocean/land pixels;
- uses one smooth terminator mask rather than multiplying the day map by the sunlight mask twice;
- uses a normal-map-adjusted diffuse term;
- samples the advected cloud field for spatially corresponding cloud shadows;
- adds restrained sun-aware limb haze;
- passes through Three.js tone-mapping and output-colour shader stages.

A trial ocean-glint term was removed during live review because it created a broad washed circular
patch at whole-Earth framing.

### Clouds

The cloud shell no longer rotates relative to the Earth. Instead, both the visible cloud shader and
the Earth shadow shader use the same inexpensive, seamless deformation:

- latitude-dependent zonal drift;
- two low-frequency analytic domain warps;
- time-varying edge erosion so cloud banks locally grow and dissipate instead of only translating;
- two phase-offset cloud-map samples;
- a smooth crossfade whose start and end both resolve to flow offset zero, avoiding a loop jump;
- a 64-second default time-lapse evolution cycle;
- sun-aware day/night colour and opacity;
- restrained limb and forward scattering.

The cloud shell radius is `5.025`, down from `5.045`, so it remains depth-safe without looking
visibly detached from a radius-5 Earth.

The advection helper is intentionally duplicated in the Earth and cloud GLSL files because raw
Three.js shader strings do not resolve local GLSL includes. Keep both copies mathematically
identical. Shared TypeScript uniform objects prevent their time/map inputs from diverging.

### Atmosphere

The former additive Fresnel glow was replaced with a thin-shell scattering approximation:

- editable halo thickness `0.18`, producing outer radius `5.18` around the radius-5 Earth;
- camera-ray/sphere intersections determine atmospheric path length;
- density falls to zero at the shell's outer silhouette;
- the Earth intersection limits the path on surface-crossing rays;
- Rayleigh-like blue scattering is directional to the shared sun;
- a small Mie-like forward term and terminator warmth are included;
- normal alpha blending replaces unrestricted additive blending;
- one `atmosphereHaloStrength` value scales both scattering colour and opacity;
- `atmosphereHaloSoftness` shapes a gradual path-density fade toward the outer circumference;
- `atmosphereHaloColor` exposes the dominant daylight scattering hue;
- `atmosphereHaloBrightness` increases RGB radiance without making the alpha silhouette more solid;
- `atmosphereHaloSaturation` restores chroma after AgX tone mapping to prevent highlight washout;
- alpha is bounded to `0.36` as a safety ceiling;
- the atmosphere uses the renderer's tone-mapping and output-colour stages.

### Bloom decision

No bloom pass is active. City lights are selectively lifted in the Earth shader first.
Only add high-threshold, low-strength bloom if review on the target display shows that lights are
still too small. If added, `GlobeRendererAdapter` must own composer rendering, resizing, targets,
and disposal; daylight, clouds, polar ice, atmosphere, and markers must remain below threshold.

## 4. Central tuning values

Defaults live in `DEFAULT_GLOBE_VISUAL_TUNING` in
[GlobeScene.ts](../apps/experience/src/renderers/globe/GlobeScene.ts). Pass overrides through
`GlobeSceneOptions.visualTuning`; do not scatter new magic numbers through application wiring.

| Control | Current value | Purpose |
|---|---:|---|
| `globeRotationCycleSeconds` | `120` | Seconds per continuous Earth revolution. |
| `sunOrbitCycleSeconds` | `180` | Seconds per continuous day/night revolution. |
| `dayExposure` | `0.74` | Reduces day-map energy before tone mapping. |
| `daySaturation` | `0.76` | Pulls back vivid source-map colour. |
| `dayContrast` | `0.92` | Softens source-map contrast around a linear `0.18` pivot. |
| `nightIntensity` | `1.62` | Selective city-light lift. |
| `nightSaturation` | `1.20` | Improves warm/cool light separation. |
| `cloudOpacity` | `0.54` | Maximum sunlit cloud opacity. |
| `cloudShadowStrength` | `0.18` | Maximum spatial day-side shadow attenuation. |
| `cloudCycleSeconds` | `64` | Seamless time-lapse deformation cycle duration. |
| `cloudDriftStrength` | `0.05` | Maximum differential zonal travel in UV space. |
| `cloudWarpStrength` | `0.023` | Local non-rigid displacement amplitude. |
| `cloudEvolutionStrength` | `0.12` | Local edge growth and dissipation amplitude. |
| `atmosphereHaloThickness` | `0.18` | Halo width added to the radius-5 Earth. |
| `atmosphereHaloStrength` | `1.35` | Main editable halo brightness/opacity control. |
| `atmosphereHaloSoftness` | `4.75` | Outer-edge diffusion exponent; higher is softer. |
| `atmosphereHaloColor` | `#00a2ff` | Dominant saturated-blue scattering hue. |
| `atmosphereHaloBrightness` | `1.45` | RGB-only radiance multiplier. |
| `atmosphereHaloSaturation` | `1.45` | Post-tone-map chroma restoration. |

Renderer exposure remains `1.0` in
[GlobeRendererAdapter.ts](../apps/experience/src/renderers/globe/GlobeRendererAdapter.ts). Prefer
surface-specific tuning above before changing global exposure.

## 5. Files in this workstream

- [GlobeScene.ts](../apps/experience/src/renderers/globe/GlobeScene.ts): shared uniforms, visual
  tuning, shell geometry, frame-delta cloud clock, resource ownership.
- [GlobeRendererAdapter.ts](../apps/experience/src/renderers/globe/GlobeRendererAdapter.ts): AgX/sRGB
  renderer configuration and single-ticker cloud advancement.
- [earth.glsl](../apps/experience/src/renderers/globe/shaders/earth.glsl): day/night grading,
  terminator, spatial cloud shadow, surface haze.
- [clouds.glsl](../apps/experience/src/renderers/globe/shaders/clouds.glsl): advected cloud sampling
  and solar shading.
- [atmosphere.glsl](../apps/experience/src/renderers/globe/shaders/atmosphere.glsl): thin-shell
  sun-aware scattering.
- [idle-loop.ts](../apps/experience/src/renderers/globe/idle-loop.ts): globe and sun GSAP motion only;
  rigid cloud-orbit tween removed.
- [motion-tokens.ts](../apps/experience/src/orchestration/motion-tokens.ts): obsolete cloud-orbit
  duration removed.
- Renderer unit tests: uniform sharing, tuning, shell radius/blending, frame-delta cloud movement,
  colour pipeline, and cleanup.
- [US1 browser test](../apps/experience/tests/e2e/us1-category-preview.spec.ts): fails on real
  Three.js/WebGL shader compilation errors.

Project-marker styling and placement are unchanged by this workstream and should be treated as a separate
scope unless feedback explicitly brings them into this workstream.

## 6. Validation protocol

For each feedback round:

1. Hard-reload the real development page.
2. Capture browser console warnings/errors during startup. There must be no `THREE.WebGLProgram`,
   shader-compilation, or invalid-program messages.
3. Review fixed visual conditions:
   - broad daylight;
   - centred terminator;
   - broad night side;
   - cloud evolution at approximately 0, 30, and 90 seconds.
4. Confirm clouds deform relative to geographic features without shell rotation or a visible cycle
   reset.
5. Confirm the atmosphere is thin, fades outward, and responds to sun direction rather than drawing
   a uniform neon ring.
6. Run:
   - `pnpm --filter experience run typecheck`
   - `pnpm --filter experience run test:unit`
   - `pnpm --filter experience run test:e2e`
   - `pnpm --filter experience run build`
7. Before a final merge, run the root `pnpm run verify` once. This repository intentionally uses no
   hosted GitHub Actions.

Target event hardware still requires visual review at native LED resolution. Browser screenshots
are necessary but not sufficient for final exposure/saturation approval.

## 7. Feedback history

### Baseline — 2026-08-05

- Day: too bright/saturated.
- Night: generally good; lights could be more saturated.
- Clouds: obvious rigid shell rotation.
- Atmosphere: thick constant cyan ring.

### Pass 1 — 2026-08-05

Implemented the colour pipeline, independent grading, seamless cloud deformation/shadows, and
thin-shell atmosphere described above. Live-browser GLSL compilation is clean after renaming a
local helper that initially collided with a Three.js shader-chunk `luminance` function. A dedicated
browser regression now protects against that failure class.

Validation completed on 2026-08-05:

- hard-reloaded development runtime: no console warning, page error, or shader compilation error;
- deterministic daylight checkpoint: reduced source-map saturation/energy and thin subdued limb;
- deterministic night checkpoint: dark background retained, city lights visibly separated, clouds
  subdued, and only a narrow terminator tint on the atmosphere;
- Playwright: 6/6 passed, including the new real-WebGL shader compilation regression;
- root `pnpm run verify`: passed (typecheck, lint, formatting, 206 unit tests with 4 intentional
  skips, and all workspace builds).

**Human verdict:** day/night/atmosphere not re-opened; cloud deformation was too subtle to see in
normal playback.

### Pass 2 — 2026-08-05

Feedback: “maybe its too subtle but I dont see any cloud deforming”. Fixed-camera comparison
confirmed that the first implementation moved cloud edges by only a few pixels over ordinary
observation intervals while the globe's own rotation visually dominated the motion.

Pass 2 keeps the cloud shell locked to the Earth but makes the weather time-lapse legible by:

- shortening the seamless cycle from 240 to 64 seconds;
- increasing latitude-dependent drift and local two-axis domain warping;
- adding a separate animated erosion field that changes cloud-bank boundaries, so the result is a
  real silhouette morph rather than just translated texture coordinates;
- increasing maximum sunlit opacity from `0.48` to `0.54`;
- sharing all three new controls and the exact same coverage calculation with the Earth shader, so
  cloud shadows continue to match the visible shapes.

During tuning, a fixed globe/camera/sun eight-second screenshot comparison was used to isolate
weather motion from globe rotation. An intermediate conservative candidate changed 3.71% of frame
pixels above the comparison threshold; the selected pass-2 values changed 5.90%. This metric is a
regression aid rather than an artistic target—the final judgment remains human observation.

Validation completed for pass 2:

- hard-reloaded development runtime: no console warning, page error, or shader compilation error;
- fixed-camera start/end review: Atlantic cloud banks visibly translate at different rates, bend,
  and change their silhouettes over eight seconds while continents remain fixed;
- Earth and cloud shader coverage helpers verified byte-identical;
- experience typecheck and production build passed;
- focused globe-scene unit tests: 6/6 passed;
- real-browser WebGL shader regression: 1/1 passed.

**Human verdict:** accepted (“ok great”); atmospheric halo opened as the next feedback item.

### Pass 3 — 2026-08-05

Feedback: the atmospheric halo was not visible enough and needed a simple tuning variable.

The former absolute-radius and generically named intensity controls were replaced by two explicit
values in `DEFAULT_GLOBE_VISUAL_TUNING`:

- `atmosphereHaloStrength` is the primary artistic control. Raise or lower this one value to change
  scattering colour and opacity together; the selected default is `1.25`, up from the former
  intensity of `0.68`.
- `atmosphereHaloThickness` controls only silhouette width in scene units; the selected `0.12`
  produces radius `5.12`, up from `5.075`.

The scattering alpha curve was also lifted while retaining sun direction, outward falloff, bounded
opacity, and normal blending. Daylight now has a clearly readable blue limb, the terminator has a
warmer narrow edge, and the night side retains only restrained airglow rather than a uniform neon
ring.

Validation completed for pass 3:

- hard-reloaded daylight and night/terminator checkpoints: halo visible with no shader, console, or
  page errors;
- custom strength and thickness behavior covered by the focused globe-scene suite: 6/6 passed;
- experience typecheck and production build passed;
- real-browser WebGL shader regression: 1/1 passed.

**Human verdict:** strength accepted as visible, but the result read as a normal ring; requested a
blur-like outer fade and a more vibrant light-blue hue.

### Pass 4 — 2026-08-05

Feedback: the halo needed to diffuse toward its outer circumference “sort of like a blur” and use a
lighter, more vibrant blue.

Pass 4 implements the softness analytically in the existing atmosphere shader rather than adding a
full-screen blur pass:

- the normalized atmospheric path length is raised to the editable `atmosphereHaloSoftness`
  exponent before density is calculated, strongly reducing opacity near the outer edge while
  retaining a readable inner limb;
- shell thickness increased from `0.12` to `0.18`, giving the gradient enough screen-space width to
  read as diffusion rather than a hard line;
- the daylight scattering colour moved from muted `#4d88bd` to vibrant light blue `#63c7ff` and is
  now editable through `atmosphereHaloColor`;
- strength increased slightly from `1.25` to `1.35` to compensate for energy removed by the softer
  outer falloff;
- warm terminator-scattering contribution was reduced so blue remains dominant.

Validation completed for pass 4:

- hard-reloaded daylight and night checkpoints: broad smooth outer fade and light-blue dominant
  hue, with no shader, console, or page errors;
- custom softness, colour, strength, and thickness behavior covered by the focused globe-scene
  suite: 6/6 passed;
- experience typecheck and production build passed;
- real-browser WebGL shader regression: 1/1 passed.

**Human verdict:** diffusion improved, but the halo colour still appeared too washed out; requested
more colour brightness even with a strongly blue hue. Before pass 5, the human directly selected
`atmosphereHaloSoftness: 4.75` and `atmosphereHaloColor: #00a2ff`; both values are preserved.

### Pass 5 — 2026-08-05

Feedback: increase brightness in the halo's colour without losing the soft outer falloff.

Simply increasing the existing strength would raise opacity as well as RGB and risk returning to a
solid ring. Pass 5 therefore separates colour energy from silhouette density:

- `atmosphereHaloBrightness: 1.45` multiplies scattering RGB before tone mapping but does not alter
  alpha;
- `atmosphereHaloSaturation: 1.45` restores chroma immediately after AgX tone mapping and before
  sRGB output, counteracting the tone mapper's deliberate highlight desaturation;
- saturation operates on the final blue-dominant scattering result while alpha, softness,
  thickness, and normal blending remain unchanged;
- the human-selected `#00a2ff` hue and `4.75` softness are retained as current defaults.

Validation completed for pass 5:

- hard-reloaded daylight and night checkpoints: brighter saturated cyan-blue halo with the same
  diffused outer silhouette and no shader, console, or page errors;
- custom brightness and saturation behavior covered by the focused globe-scene suite: 6/6 passed;
- experience typecheck and production build passed;
- real-browser WebGL shader regression: 1/1 passed.

**Human verdict:** halo accepted with no further correction requested; opened continuous rotation
and editable speed controls as the final feedback item.

### Pass 6 — 2026-08-05

Feedback: expose globe rotation speed variables and fix rotation becoming static after a fixed
amount of time.

Root cause: Earth rotation and the solar orbit shared one repeating 180-second timeline. The Earth
tween completed at 120 seconds and therefore held its final angle for the remaining 60 seconds of
every shared cycle.

Pass 6 fixes this structurally:

- Earth rotation and solar orbit now use separate infinitely repeating timelines, so neither can
  inherit a hold from the other's duration;
- `globeRotationCycleSeconds: 120` and `sunOrbitCycleSeconds: 180` are centralized in
  `DEFAULT_GLOBE_VISUAL_TUNING` beside the existing `cloudCycleSeconds` control;
- each timeline contains only its own property and linear easing;
- start remains idempotent, stop cancels both handles, and restart targets the current angle plus a
  full revolution rather than assuming an angle of zero;
- obsolete hard-coded globe/day-night duration entries were removed from shared motion tokens.

Validation completed for pass 6:

- focused idle-loop and scene tests: 7/7 passed;
- live development runtime exposes independent 120-second and 180-second repeating timelines;
- deterministic timeline sampling verified active Earth rotation at 110, 119, 121, 150, 239, and
  241 seconds, including the interval that previously held static from 120–180 seconds;
- experience typecheck and production build passed;
- Playwright extended-idle scenario: 1/1 passed;
- no console or page errors on hard reload.

**Human verdict:** pending.

For the next round, append:

- screenshots/viewing condition;
- what improved;
- what still feels wrong;
- exact tuning/code changes;
- automated and live-browser validation results;
- the new human verdict.

## 8. New-chat handoff prompt

Use this minimal prompt in a future chat:

> Continue the globe visual-fidelity work on branch `feature/globe-visual-fidelity`. Read
> `Docs/GLOBE_VISUAL_FIDELITY.md` first, inspect the current diff/status, preserve its rendering
> invariants, and append this feedback round to that document. Do not add the work to the feature
> specs or task registry.
