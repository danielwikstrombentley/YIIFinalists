import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import type { CameraPoseProbe, TargetProjectionProbe } from './transition-observability.js';

export const CINEMATIC_EARTH_RADIUS = 5;
const WGS84_RADII = new Vector3(6_378_137, 6_378_137, 6_356_752.314_245_179);

export interface GeographicCameraPose {
  positionEcef: readonly [number, number, number];
  directionEcef: readonly [number, number, number];
  upEcef: readonly [number, number, number];
  verticalFovRadians: number;
  aspectRatio: number;
}

const AXIS_TO_ECEF = new Matrix4().set(-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
const AXIS_FROM_ECEF = AXIS_TO_ECEF.clone().invert();

function tuple(vector: Vector3): readonly [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function normalizedOrThrow(vector: Vector3, label: string): Vector3 {
  if (![vector.x, vector.y, vector.z].every(Number.isFinite) || vector.lengthSq() === 0) {
    throw new Error(`${label} must be a finite non-zero vector.`);
  }
  return vector.normalize();
}

function orthonormalBasis(
  directionInput: Vector3,
  upInput: Vector3,
): { direction: Vector3; up: Vector3 } {
  const direction = normalizedOrThrow(directionInput.clone(), 'Camera direction');
  const right = normalizedOrThrow(
    new Vector3().crossVectors(direction, upInput),
    'Camera direction/up basis',
  );
  const up = normalizedOrThrow(new Vector3().crossVectors(right, direction), 'Camera up');
  return { direction, up };
}

/** Content latitude/longitude → unrotated cinematic sphere point. */
export function geographicToThreeSpherePoint(
  latitudeDegrees: number,
  longitudeDegrees: number,
  sphereRadius = CINEMATIC_EARTH_RADIUS,
  target = new Vector3(),
  heightMeters = 0,
): Vector3 {
  const latitude = (latitudeDegrees * Math.PI) / 180;
  const longitude = (longitudeDegrees * Math.PI) / 180;
  const semiMajor = WGS84_RADII.x;
  const semiMinor = WGS84_RADII.z;
  const eccentricitySquared = 1 - (semiMinor * semiMinor) / (semiMajor * semiMajor);
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  const primeVerticalRadius =
    semiMajor / Math.sqrt(1 - eccentricitySquared * sinLatitude * sinLatitude);
  const ecef = new Vector3(
    (primeVerticalRadius + heightMeters) * cosLatitude * Math.cos(longitude),
    (primeVerticalRadius + heightMeters) * cosLatitude * Math.sin(longitude),
    (primeVerticalRadius * (1 - eccentricitySquared) + heightMeters) * sinLatitude,
  );
  return target
    .copy(ecef)
    .divide(WGS84_RADII)
    .applyMatrix4(AXIS_FROM_ECEF)
    .multiplyScalar(sphereRadius);
}

/** Three vertical FOV → Cesium's aspect-dependent perspective-frustum `fov`. */
export function threeFovToCesium(verticalFovRadians: number, aspectRatio: number): number {
  if (verticalFovRadians <= 0 || aspectRatio <= 0) {
    throw new Error('FOV and aspect ratio must be positive.');
  }
  return aspectRatio > 1
    ? 2 * Math.atan(Math.tan(verticalFovRadians / 2) * aspectRatio)
    : verticalFovRadians;
}

/** Cesium's aspect-dependent perspective-frustum `fov` → vertical FOV. */
export function cesiumFovToVertical(cesiumFovRadians: number, aspectRatio: number): number {
  if (cesiumFovRadians <= 0 || aspectRatio <= 0) {
    throw new Error('FOV and aspect ratio must be positive.');
  }
  return aspectRatio > 1
    ? 2 * Math.atan(Math.tan(cesiumFovRadians / 2) / aspectRatio)
    : cesiumFovRadians;
}

/** Removes the live root transform and maps cinematic scaled space to WGS84 ECEF. */
export function threePointToEcef(
  point: Vector3,
  globeRootWorldMatrix: Matrix4,
  sphereRadius = CINEMATIC_EARTH_RADIUS,
): Vector3 {
  if (!(sphereRadius > 0)) throw new Error('Cinematic sphere radius must be positive.');
  const spherePoint = point.clone().applyMatrix4(globeRootWorldMatrix.clone().invert());
  const scaledSpace = spherePoint.applyMatrix4(AXIS_TO_ECEF).divideScalar(sphereRadius);
  normalizedOrThrow(scaledSpace.clone(), 'Cinematic sphere point');
  return scaledSpace.multiply(WGS84_RADII);
}

function threeWorldDirectionToEcef(direction: Vector3, globeRootWorldMatrix: Matrix4): Vector3 {
  const rootRotation = new Matrix4().extractRotation(globeRootWorldMatrix);
  return normalizedOrThrow(
    direction
      .clone()
      .transformDirection(rootRotation.clone().invert())
      .transformDirection(AXIS_TO_ECEF)
      .multiply(WGS84_RADII),
    'Three camera basis',
  );
}

function ecefDirectionToThreeWorld(
  direction: readonly [number, number, number],
  globeRootWorldMatrix: Matrix4,
): Vector3 {
  const rootRotation = new Matrix4().extractRotation(globeRootWorldMatrix);
  return new Vector3(...direction)
    .divide(WGS84_RADII)
    .transformDirection(AXIS_FROM_ECEF)
    .transformDirection(rootRotation)
    .normalize();
}

function ecefPositionToThreeWorld(
  position: readonly [number, number, number],
  globeRootWorldMatrix: Matrix4,
  sphereRadius: number,
): Vector3 {
  return new Vector3(...position)
    .divide(WGS84_RADII)
    .multiplyScalar(sphereRadius)
    .applyMatrix4(AXIS_FROM_ECEF)
    .applyMatrix4(globeRootWorldMatrix);
}

/** Captures the live Three camera as one renderer-neutral WGS84 ECEF pose. */
export function captureThreeGeographicPose(
  camera: PerspectiveCamera,
  globeRootWorldMatrix: Matrix4,
  sphereRadius = CINEMATIC_EARTH_RADIUS,
): GeographicCameraPose {
  camera.updateMatrixWorld(true);
  const position = camera.getWorldPosition(new Vector3());
  const direction = camera.getWorldDirection(new Vector3());
  const up = camera
    .localToWorld(new Vector3(0, 1, 0))
    .sub(position)
    .normalize();
  const basis = orthonormalBasis(
    threeWorldDirectionToEcef(direction, globeRootWorldMatrix),
    threeWorldDirectionToEcef(up, globeRootWorldMatrix),
  );

  return {
    positionEcef: tuple(threePointToEcef(position, globeRootWorldMatrix, sphereRadius)),
    directionEcef: tuple(basis.direction),
    upEcef: tuple(basis.up),
    verticalFovRadians: (camera.getEffectiveFOV() * Math.PI) / 180,
    aspectRatio: camera.aspect,
  };
}

/** Applies an ECEF pose to Three while restoring the current globe-root world transform. */
export function applyGeographicPoseToThreeCamera(
  camera: PerspectiveCamera,
  pose: GeographicCameraPose,
  globeRootWorldMatrix: Matrix4,
  sphereRadius = CINEMATIC_EARTH_RADIUS,
): void {
  camera.position.copy(
    ecefPositionToThreeWorld(pose.positionEcef, globeRootWorldMatrix, sphereRadius),
  );
  const direction = ecefDirectionToThreeWorld(pose.directionEcef, globeRootWorldMatrix);
  camera.up.copy(ecefDirectionToThreeWorld(pose.upEcef, globeRootWorldMatrix));
  camera.fov = (pose.verticalFovRadians * 180) / Math.PI;
  camera.aspect = pose.aspectRatio;
  camera.lookAt(camera.position.clone().add(direction));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

export function geographicPoseToProbe(pose: GeographicCameraPose): CameraPoseProbe {
  return {
    coordinateSpace: 'ecef',
    position: pose.positionEcef,
    direction: pose.directionEcef,
    up: pose.upEcef,
    verticalFovRadians: pose.verticalFovRadians,
    aspectRatio: pose.aspectRatio,
  };
}

export function projectGeographicTarget(
  camera: PerspectiveCamera,
  target: Vector3,
  projectId = 'target',
): TargetProjectionProbe | null {
  const projected = target.clone().project(camera);
  if (![projected.x, projected.y, projected.z].every(Number.isFinite)) return null;
  return {
    projectId,
    x: (projected.x + 1) / 2,
    y: (1 - projected.y) / 2,
    visible:
      projected.x >= -1 &&
      projected.x <= 1 &&
      projected.y >= -1 &&
      projected.y <= 1 &&
      projected.z >= -1 &&
      projected.z <= 1,
  };
}
