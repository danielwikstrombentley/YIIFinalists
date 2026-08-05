/* vertex */
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec2 vUv;

void main() {
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}

/* fragment */
precision highp float;

uniform vec3 uSunDirection;
uniform sampler2D uDayMap;
uniform sampler2D uNightMap;
uniform sampler2D uNormalMap;
uniform sampler2D uCloudMap;
uniform float uHasDayMap;
uniform float uHasNightMap;
uniform float uHasNormalMap;
uniform float uHasCloudMap;
uniform float uCloudTime;
uniform float uCloudCycleSeconds;
uniform float uCloudDriftStrength;
uniform float uCloudWarpStrength;
uniform float uCloudEvolutionStrength;
uniform float uCloudShadowStrength;
uniform float uDayExposure;
uniform float uDaySaturation;
uniform float uDayContrast;
uniform float uNightIntensity;
uniform float uNightSaturation;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec2 vUv;

const float PI = 3.14159265359;
const float TWO_PI = 6.28318530718;

float globeLuminance(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

vec3 adjustSaturation(vec3 color, float saturation) {
  return mix(vec3(globeLuminance(color)), color, saturation);
}

vec3 gradeDaylight(vec3 color) {
  vec3 exposed = color * uDayExposure;
  vec3 saturated = adjustSaturation(exposed, uDaySaturation);
  return max((saturated - vec3(0.18)) * uDayContrast + vec3(0.18), vec3(0.0));
}

vec3 gradeNight(vec3 color) {
  float cityLightMask = smoothstep(0.012, 0.22, globeLuminance(color));
  vec3 darkBackground = color * 0.42;
  vec3 saturatedLights = max(adjustSaturation(color, uNightSaturation), vec3(0.0));
  return mix(darkBackground, saturatedLights * uNightIntensity, cityLightMask);
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
  float latitudeBand = 0.5 + 0.5 * sin(vWorldPosition.y * 3.6);
  float longitudeBand = 0.5 + 0.5 * sin(atan(vWorldPosition.z, vWorldPosition.x) * 9.0);
  vec3 ocean = vec3(0.015, 0.12, 0.26);
  vec3 land = vec3(0.07, 0.28, 0.18);
  vec3 proceduralDay = mix(ocean, land, smoothstep(0.42, 0.68, latitudeBand * longitudeBand));
  vec3 proceduralNight = vec3(0.003, 0.008, 0.035) + vec3(0.06, 0.035, 0.005) * longitudeBand * latitudeBand;

  vec3 sampledDay = mix(proceduralDay, texture2D(uDayMap, vUv).rgb, uHasDayMap);
  vec3 sampledNight = mix(proceduralNight, texture2D(uNightMap, vUv).rgb, uHasNightMap);
  vec3 day = gradeDaylight(sampledDay);
  vec3 night = gradeNight(sampledNight);

  vec3 tangentLongitude = normalize(vec3(-normal.z, 0.0, normal.x));
  vec3 tangentLatitude = normalize(cross(normal, tangentLongitude));
  vec3 sampledNormal = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
  vec3 detailedNormal = normalize(
    tangentLongitude * sampledNormal.x + tangentLatitude * sampledNormal.y + normal * sampledNormal.z
  );
  normal = normalize(mix(normal, detailedNormal, 0.35 * uHasNormalMap));

  vec3 sunDirection = normalize(uSunDirection);
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float sunIncidence = dot(normal, sunDirection);
  float daylightBlend = smoothstep(-0.10, 0.18, sunIncidence);
  float diffuse = mix(0.30, 1.0, sqrt(max(sunIncidence, 0.0)));

  float cloudShadow = advectedCloudCoverage(vUv) * uCloudShadowStrength * daylightBlend;
  vec3 dayLit = day * diffuse * (1.0 - cloudShadow);

  vec3 surface = mix(night, dayLit, daylightBlend);

  float viewRim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.2);
  float sunlitHaze = smoothstep(-0.18, 0.34, sunIncidence);
  float twilight = exp(-pow((sunIncidence + 0.055) / 0.16, 2.0));
  vec3 hazeColor = mix(vec3(0.10, 0.30, 0.72), vec3(0.95, 0.28, 0.08), twilight * 0.62);
  surface += hazeColor * viewRim * (sunlitHaze * 0.075 + twilight * 0.035);

  gl_FragColor = vec4(surface, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
