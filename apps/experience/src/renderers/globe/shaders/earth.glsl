/* vertex */
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

void main() {
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}

/* fragment */
precision highp float;

uniform vec3 uSunDirection;
uniform float uCloudShadow;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

void main() {
  vec3 normal = normalize(vWorldNormal);
  float sunlight = smoothstep(-0.12, 0.38, dot(normal, normalize(uSunDirection)));
  float latitudeBand = 0.5 + 0.5 * sin(vWorldPosition.y * 3.6);
  float longitudeBand = 0.5 + 0.5 * sin(atan(vWorldPosition.z, vWorldPosition.x) * 9.0);
  vec3 ocean = vec3(0.015, 0.12, 0.26);
  vec3 land = vec3(0.07, 0.28, 0.18);
  vec3 day = mix(ocean, land, smoothstep(0.42, 0.68, latitudeBand * longitudeBand));
  vec3 night = vec3(0.003, 0.008, 0.035) + vec3(0.06, 0.035, 0.005) * longitudeBand * latitudeBand;
  vec3 surface = mix(night, day * (1.0 - uCloudShadow), sunlight);
  gl_FragColor = vec4(surface, 1.0);
}
