/* vertex */
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec2 vUv;

void main() {
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

/* fragment */
precision highp float;

uniform sampler2D uCloudMap;
uniform float uHasCloudMap;
uniform float uCloudTime;
uniform float uCloudCycleSeconds;
uniform float uCloudDriftStrength;
uniform float uCloudWarpStrength;
uniform float uCloudEvolutionStrength;
uniform float uCloudOpacity;
uniform vec3 uSunDirection;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec2 vUv;

const float PI = 3.14159265359;
const float TWO_PI = 6.28318530718;

float globeLuminance(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

vec2 advectedCloudUv(vec2 uv, float flow) {
  float latitude = (uv.y - 0.5) * PI;
  float phase = flow * TWO_PI;
  float zonalWind = 0.58 + 0.42 * cos(latitude * 2.0);
  vec2 deformationSignal = vec2(
    sin(uv.y * 31.0 + uv.x * 5.0 + phase * 1.31) * 0.68
      + sin(uv.y * 13.0 - phase * 0.77) * 0.32,
    sin(uv.x * 23.0 - uv.y * 7.0 - phase * 1.13) * 0.7
      + sin(latitude * 6.0 + phase * 0.61) * 0.3
  );
  vec2 advected = uv + vec2(
    flow * uCloudDriftStrength * zonalWind,
    flow * sin(latitude * 5.0) * uCloudDriftStrength * 0.12
  ) + deformationSignal * uCloudWarpStrength;
  return vec2(fract(advected.x), clamp(advected.y, 0.002, 0.998));
}

float cloudEvolutionField(vec2 uv, float flow) {
  float phase = flow * TWO_PI;
  float broadCells = sin(
    uv.x * TWO_PI * 5.0 + sin(uv.y * TWO_PI * 3.0) * 0.8 + phase * 1.17
  );
  float crossingCells = sin(
    uv.y * TWO_PI * 8.0 - uv.x * TWO_PI * 2.0 - phase * 0.91
  );
  return broadCells * 0.58 + crossingCells * 0.42;
}

float cloudCoverageAt(vec2 uv, float flow) {
  float photographedLuminance = globeLuminance(texture2D(uCloudMap, uv).rgb);
  float edgeEvolution = cloudEvolutionField(uv, flow) * uCloudEvolutionStrength;
  float photographedClouds = pow(
    smoothstep(
      0.08 + edgeEvolution,
      0.78 + edgeEvolution * 0.42,
      photographedLuminance
    ),
    1.16
  );
  float proceduralClouds = smoothstep(
    0.42 + edgeEvolution,
    0.76 + edgeEvolution * 0.42,
    0.5 + 0.28 * sin(uv.x * TWO_PI * 7.0) + 0.22 * sin(uv.y * TWO_PI * 5.0)
  );
  return mix(proceduralClouds, photographedClouds, uHasCloudMap);
}

float advectedCloudCoverage(vec2 uv) {
  float cycle = max(uCloudCycleSeconds, 1.0);
  float phase = fract(uCloudTime / cycle);
  float forwardSample = cloudCoverageAt(advectedCloudUv(uv, phase), phase);
  float wrappedSample = cloudCoverageAt(advectedCloudUv(uv, phase - 1.0), phase - 1.0);
  float wrapBlend = smoothstep(0.12, 0.88, phase);
  return mix(forwardSample, wrappedSample, wrapBlend);
}

void main() {
  vec3 normal = normalize(vWorldNormal);
  vec3 sunDirection = normalize(uSunDirection);
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float cloudMask = advectedCloudCoverage(vUv);
  float sunlight = smoothstep(-0.20, 0.34, dot(normal, sunDirection));
  float viewRim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.6);
  float forwardScatter = pow(max(dot(viewDirection, sunDirection), 0.0), 8.0);

  vec3 nightCloud = vec3(0.16, 0.20, 0.28);
  vec3 dayCloud = vec3(0.78, 0.86, 0.96);
  vec3 cloudColor = mix(nightCloud, dayCloud, sunlight);
  cloudColor += vec3(0.34, 0.48, 0.72) * viewRim * sunlight * 0.16;
  cloudColor += vec3(1.0, 0.82, 0.58) * forwardScatter * sunlight * 0.08;

  float alpha = cloudMask * uCloudOpacity * mix(0.38, 1.0, sunlight);
  gl_FragColor = vec4(cloudColor, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
