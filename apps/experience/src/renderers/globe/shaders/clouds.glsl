/* vertex */
varying vec3 vWorldNormal;
varying vec2 vUv;

void main() {
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

/* fragment */
precision highp float;

uniform float uCloudPhase;
uniform sampler2D uCloudMap;
uniform float uHasCloudMap;
varying vec3 vWorldNormal;
varying vec2 vUv;

void main() {
  float latitude = asin(clamp(vWorldNormal.y, -1.0, 1.0));
  float longitude = atan(vWorldNormal.z, vWorldNormal.x);
  float bands = sin(longitude * 7.0 + latitude * 4.0 + uCloudPhase * 6.28318530718);
  float wisps = smoothstep(0.38, 0.78, bands);
  float cloudLuminance = dot(texture2D(uCloudMap, vUv).rgb, vec3(0.2126, 0.7152, 0.0722));
  float photographedClouds = pow(smoothstep(0.12, 0.88, cloudLuminance), 1.15);
  float cloudMask = mix(wisps, photographedClouds, uHasCloudMap);
  gl_FragColor = vec4(vec3(0.82, 0.92, 1.0), cloudMask * 0.48);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
