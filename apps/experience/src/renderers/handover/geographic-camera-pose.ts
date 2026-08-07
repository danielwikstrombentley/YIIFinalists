import type { CameraPose } from '@yii/content-schema';
import { Cartesian3, HeadingPitchRoll, Matrix3 as CesiumMatrix3, Transforms } from 'cesium';
import type { GeographicCameraPose } from './geographic-pose-bridge.js';

export * from './geographic-pose-bridge.js';

function tuple(vector: Cartesian3): readonly [number, number, number] {
  return [vector.x, vector.y, vector.z];
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
    verticalFovRadians: (42 * Math.PI) / 180,
    aspectRatio: 16 / 9,
  };
}
