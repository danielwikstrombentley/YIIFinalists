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

uniform vec3 uGlowColor;
uniform float uGlowStrength;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

void main() {
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float rim = 1.0 - max(dot(normalize(vWorldNormal), viewDirection), 0.0);
  float glow = pow(rim, 2.4) * uGlowStrength;
  gl_FragColor = vec4(uGlowColor * glow, glow);
}
