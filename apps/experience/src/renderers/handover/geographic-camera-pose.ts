import type { CameraPose } from '@yii/content-schema';
import {
  Cartesian3,
  Ellipsoid,
  HeadingPitchRoll,
  Math as CesiumMath,
  Matrix3 as CesiumMatrix3,
  Transforms,
} from 'cesium';
import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import type { CameraPoseProbe, TargetProjectionProbe } from './transition-observability.js';

export const CINEMATIC_EARTH_RADIUS = 5;

export interface GeographicCameraPose {
  positionEcef: readonly [number, number, number];
  directionEcef: readonly [number, number, number];
  upEcef: readonly [number, number, number];
  verticalFovRadians: number;
  aspectRatio: number;
}

const AXIS_TO_ECEF = new Matrix4().set(-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
const AXIS_FROM_ECEF = AXIS_TO_ECEF.clone().invert();

/** Content latitude/longitude → unrotated cinematic sphere point. */
export function geographicToThreeSpherePoint(
  latitudeDegrees: number,
  longitudeDegrees: number,
  sphereRadius = CINEMATIC_EARTH_RADIUS,
  target = new Vector3(),
): Vector3 {
  const latitude = CesiumMath.toRadians(latitudeDegrees);
  const longitude = CesiumMath.toRadians(longitudeDegrees);
  return target.set(
    -sphereRadius * Math.cos(latitude) * Math.cos(longitude),
    sphereRadius * Math.sin(latitude),
    sphereRadius * Math.cos(latitude) * Math.sin(longitude),
  );
}

function tuple(vector: { x: number; y: number; z: number }): readonly [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function threeToCartesian(vector: Vector3): Cartesian3 {
  return new Cartesian3(vector.x, vector.y, vector.z);
}

function cartesianToThree(vector: Cartesian3, target = new Vector3()): Vector3 {
  return target.set(vector.x, vector.y, vector.z);
}

function normalizedOrThrow(vector: Cartesian3, label: string): Cartesian3 {
  if (!Number.isFinite(Cartesian3.magnitude(vector)) || Cartesian3.magnitudeSquared(vector) === 0) {
    throw new Error(`${label} must be a finite non-zero vector.`);
  }
  return Cartesian3.normalize(vector, vector);
}

function orthonormalBasis(
  directionInput: Cartesian3,
  upInput: Cartesian3,
): { direction: Cartesian3; up: Cartesian3 } {
  const direction = normalizedOrThrow(Cartesian3.clone(directionInput), 'Camera direction');
  const right = Cartesian3.cross(direction, upInput, new Cartesian3());
  normalizedOrThrow(right, 'Camera direction/up basis');
  const up = Cartesian3.cross(right, direction, new Cartesian3());
  normalizedOrThrow(up, 'Camera up');
  return { direction, up };
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

/**
 * Converts a Three world point into WGS84 ECEF. The globe-root matrix is removed first because
 * texture/marker geography belongs to the unrotated cinematic sphere, not its current idle spin.
 */
export function threePointToEcef(
  point: Vector3,
  globeRootWorldMatrix: Matrix4,
  sphereRadius = CINEMATIC_EARTH_RADIUS,
): Cartesian3 {
  if (!(sphereRadius > 0)) throw new Error('Cinematic sphere radius must be positive.');
  const spherePoint = point.clone().applyMatrix4(globeRootWorldMatrix.clone().invert());
  const scaledSpace = spherePoint.applyMatrix4(AXIS_TO_ECEF).divideScalar(sphereRadius);
  normalizedOrThrow(threeToCartesian(scaledSpace.clone()), 'Cinematic sphere point');
  return Ellipsoid.WGS84.transformPositionFromScaledSpace(threeToCartesian(scaledSpace));
}

function threeWorldDirectionToEcef(direction: Vector3, globeRootWorldMatrix: Matrix4): Cartesian3 {
  const rootRotation = new Matrix4().extractRotation(globeRootWorldMatrix);
  const sphereDirection = direction
    .clone()
    .transformDirection(rootRotation.clone().invert())
    .transformDirection(AXIS_TO_ECEF)
    .multiply(
      new Vector3(Ellipsoid.WGS84.radii.x, Ellipsoid.WGS84.radii.y, Ellipsoid.WGS84.radii.z),
    );
  return normalizedOrThrow(threeToCartesian(sphereDirection), 'Three camera basis');
}

function ecefDirectionToThreeWorld(
  direction: readonly [number, number, number],
  globeRootWorldMatrix: Matrix4,
): Vector3 {
  const rootRotation = new Matrix4().extractRotation(globeRootWorldMatrix);
  return new Vector3(...direction)
    .divide(new Vector3(Ellipsoid.WGS84.radii.x, Ellipsoid.WGS84.radii.y, Ellipsoid.WGS84.radii.z))
    .transformDirection(AXIS_FROM_ECEF)
    .transformDirection(rootRotation)
    .normalize();
}

function ecefPositionToThreeWorld(
  position: readonly [number, number, number],
  globeRootWorldMatrix: Matrix4,
  sphereRadius: number,
): Vector3 {
  const scaledSpace = Ellipsoid.WGS84.transformPositionToScaledSpace(new Cartesian3(...position));
  return cartesianToThree(scaledSpace)
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
  const upPoint = camera.localToWorld(new Vector3(0, 1, 0));
  const up = upPoint.sub(position).normalize();
  const elevatedPosition = threePointToEcef(position, globeRootWorldMatrix, sphereRadius);
  const basis = orthonormalBasis(
    threeWorldDirectionToEcef(direction, globeRootWorldMatrix),
    threeWorldDirectionToEcef(up, globeRootWorldMatrix),
  );

  return {
    positionEcef: tuple(elevatedPosition),
    directionEcef: tuple(basis.direction),
    upEcef: tuple(basis.up),
    verticalFovRadians: CesiumMath.toRadians(camera.getEffectiveFOV()),
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
  camera.fov = CesiumMath.toDegrees(pose.verticalFovRadians);
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

/** Correctly interprets content destination as target and range as camera-to-target distance. */
export function landingPoseFromCameraPose(cameraPose: CameraPose): GeographicCameraPose {
  const target = Cartesian3.fromDegrees(
    cameraPose.destination.lon,
    cameraPose.destination.lat,
    cameraPose.destination.height,
  );
  const hpr = HeadingPitchRoll.fromDegrees(
    cameraPose.orientation.heading,
    cameraPose.orientation.pitch,
    cameraPose.orientation.roll,
  );
  const rotation = CesiumMatrix3.fromQuaternion(Transforms.headingPitchRollQuaternion(target, hpr));
  // In Cesium's HPR frame +X is the camera view direction. Offset the camera along -X so the
  // approved heading/pitch points back toward the geographic target at exactly the declared range.
  const targetToCamera = CesiumMatrix3.multiplyByVector(
    rotation,
    new Cartesian3(-1, 0, 0),
    new Cartesian3(),
  );
  normalizedOrThrow(targetToCamera, 'Landing target-to-camera offset');
  const position = Cartesian3.add(
    target,
    Cartesian3.multiplyByScalar(targetToCamera, cameraPose.range, targetToCamera),
    new Cartesian3(),
  );
  const direction = normalizedOrThrow(
    Cartesian3.subtract(target, position, new Cartesian3()),
    'Landing direction',
  );
  const rawUp = CesiumMatrix3.multiplyByVector(rotation, new Cartesian3(0, 0, 1), new Cartesian3());
  const basis = orthonormalBasis(direction, rawUp);

  return {
    positionEcef: tuple(position),
    directionEcef: tuple(basis.direction),
    upEcef: tuple(basis.up),
    // Landing content does not own projection; the matched source FOV is retained by the stage.
    verticalFovRadians: CesiumMath.toRadians(42),
    aspectRatio: 16 / 9,
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
