/* vertex */
varying vec3 vWorldNormal;

void main() {
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

/* fragment */
precision highp float;

uniform float uCloudPhase;
varying vec3 vWorldNormal;

void main() {
  float latitude = asin(clamp(vWorldNormal.y, -1.0, 1.0));
  float longitude = atan(vWorldNormal.z, vWorldNormal.x);
  float bands = sin(longitude * 7.0 + latitude * 4.0 + uCloudPhase * 6.28318530718);
  float wisps = smoothstep(0.38, 0.78, bands);
  gl_FragColor = vec4(vec3(0.78, 0.9, 1.0), wisps * 0.22);
}
