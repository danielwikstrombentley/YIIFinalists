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
uniform float uCloudShadow;
uniform sampler2D uDayMap;
uniform sampler2D uNightMap;
uniform sampler2D uNormalMap;
uniform float uHasDayMap;
uniform float uHasNightMap;
uniform float uHasNormalMap;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec2 vUv;

void main() {
  vec3 normal = normalize(vWorldNormal);
  float latitudeBand = 0.5 + 0.5 * sin(vWorldPosition.y * 3.6);
  float longitudeBand = 0.5 + 0.5 * sin(atan(vWorldPosition.z, vWorldPosition.x) * 9.0);
  vec3 ocean = vec3(0.015, 0.12, 0.26);
  vec3 land = vec3(0.07, 0.28, 0.18);
  vec3 proceduralDay = mix(ocean, land, smoothstep(0.42, 0.68, latitudeBand * longitudeBand));
  vec3 proceduralNight = vec3(0.003, 0.008, 0.035) + vec3(0.06, 0.035, 0.005) * longitudeBand * latitudeBand;

  vec3 day = mix(proceduralDay, texture2D(uDayMap, vUv).rgb, uHasDayMap);
  vec3 night = mix(proceduralNight, texture2D(uNightMap, vUv).rgb, uHasNightMap);

  vec3 tangentLongitude = normalize(vec3(-normal.z, 0.0, normal.x));
  vec3 tangentLatitude = normalize(cross(normal, tangentLongitude));
  vec3 sampledNormal = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
  vec3 detailedNormal = normalize(
    tangentLongitude * sampledNormal.x + tangentLatitude * sampledNormal.y + normal * sampledNormal.z
  );
  normal = normalize(mix(normal, detailedNormal, 0.35 * uHasNormalMap));

  float sunlight = smoothstep(-0.12, 0.38, dot(normal, normalize(uSunDirection)));
  vec3 dayLit = day * (0.18 + 0.82 * sunlight) * (1.0 - uCloudShadow);
  vec3 nightLit = night * 1.35;
  vec3 surface = mix(nightLit, dayLit, sunlight);
  gl_FragColor = vec4(surface, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
