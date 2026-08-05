/* vertex */
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec3 vWorldCenter;

void main() {
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}

/* fragment */
precision highp float;

uniform vec3 uSunDirection;
uniform vec3 uRayleighColor;
uniform vec3 uSunsetColor;
uniform float uPlanetRadius;
uniform float uAtmosphereRadius;
uniform float uAtmosphereIntensity;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec3 vWorldCenter;

vec2 intersectSphere(vec3 rayOrigin, vec3 rayDirection, float radius) {
  float b = dot(rayOrigin, rayDirection);
  float c = dot(rayOrigin, rayOrigin) - radius * radius;
  float discriminant = b * b - c;
  if (discriminant < 0.0) return vec2(-1.0);
  float root = sqrt(discriminant);
  return vec2(-b - root, -b + root);
}

float miePhase(float cosine, float anisotropy) {
  float g2 = anisotropy * anisotropy;
  float denominator = max(1.0 + g2 - 2.0 * anisotropy * cosine, 0.0001);
  return (1.0 - g2) / (4.0 * 3.14159265359 * pow(denominator, 1.5));
}

void main() {
  vec3 rayOrigin = cameraPosition - vWorldCenter;
  vec3 rayDirection = normalize(vWorldPosition - cameraPosition);
  vec2 atmosphereHit = intersectSphere(rayOrigin, rayDirection, uAtmosphereRadius);
  if (atmosphereHit.y <= 0.0) discard;

  float pathStart = max(atmosphereHit.x, 0.0);
  float pathEnd = atmosphereHit.y;
  vec2 planetHit = intersectSphere(rayOrigin, rayDirection, uPlanetRadius);
  if (planetHit.x > pathStart) pathEnd = min(pathEnd, planetHit.x);
  float pathLength = max(pathEnd - pathStart, 0.0);

  float maximumLimbPath = 2.0 * sqrt(max(
    uAtmosphereRadius * uAtmosphereRadius - uPlanetRadius * uPlanetRadius,
    0.0001
  ));
  float normalizedPath = clamp(pathLength / maximumLimbPath, 0.0, 1.0);
  float opticalDensity = 1.0 - exp(-normalizedPath * 2.4);

  float closestDistance = clamp(-dot(rayOrigin, rayDirection), pathStart, pathEnd);
  vec3 radialDirection = normalize(rayOrigin + rayDirection * closestDistance);
  vec3 sunDirection = normalize(uSunDirection);
  float sunAltitude = dot(radialDirection, sunDirection);
  float daylight = smoothstep(-0.30, 0.10, sunAltitude);
  float twilight = exp(-pow((sunAltitude + 0.08) / 0.17, 2.0));

  float scatteringCosine = dot(-rayDirection, sunDirection);
  float rayleighPhase = 0.75 * (1.0 + scatteringCosine * scatteringCosine);
  float forwardMie = min(miePhase(scatteringCosine, 0.72), 2.2);

  vec3 scatteringColor = uRayleighColor * rayleighPhase * (0.18 + 0.82 * daylight);
  scatteringColor += uSunsetColor * twilight * (0.34 + forwardMie * 0.22);
  scatteringColor *= uAtmosphereIntensity * 0.72;

  float alpha = opticalDensity
    * (0.012 + daylight * 0.14 + twilight * 0.09)
    * uAtmosphereIntensity;
  alpha = clamp(alpha, 0.0, 0.20);
  if (alpha < 0.001) discard;

  gl_FragColor = vec4(scatteringColor, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
