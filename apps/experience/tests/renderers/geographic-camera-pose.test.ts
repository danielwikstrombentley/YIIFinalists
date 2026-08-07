import { Cartesian3, Ellipsoid } from 'cesium';
import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyGeographicPoseToThreeCamera,
  captureThreeGeographicPose,
  cesiumFovToVertical,
  geographicToThreeSpherePoint,
  landingPoseFromCameraPose,
  projectGeographicTarget,
  threeFovToCesium,
  threePointToEcef,
} from '../../src/renderers/handover/geographic-camera-pose.js';

const EARTH_RADIUS = 5;
const IDENTITY_ROOT = new Matrix4();

function expectDirection(actual: Cartesian3, expected: Cartesian3): void {
  expect(Cartesian3.angleBetween(actual, expected)).toBeLessThan(1e-10);
}

describe('geographic camera-pose bridge', () => {
  it('maps the cinematic cardinal axes to WGS84 cardinal surface points', () => {
    expect(geographicToThreeSpherePoint(0, 0)).toEqual(new Vector3(-EARTH_RADIUS, 0, 0));
    expect(geographicToThreeSpherePoint(90, 0).y).toBeCloseTo(EARTH_RADIUS);
    const positiveX = threePointToEcef(
      new Vector3(EARTH_RADIUS, 0, 0),
      IDENTITY_ROOT,
      EARTH_RADIUS,
    );
    const positiveY = threePointToEcef(
      new Vector3(0, EARTH_RADIUS, 0),
      IDENTITY_ROOT,
      EARTH_RADIUS,
    );
    const positiveZ = threePointToEcef(
      new Vector3(0, 0, EARTH_RADIUS),
      IDENTITY_ROOT,
      EARTH_RADIUS,
    );

    expectDirection(
      new Cartesian3(positiveX.x, positiveX.y, positiveX.z),
      new Cartesian3(-1, 0, 0),
    );
    expectDirection(new Cartesian3(positiveY.x, positiveY.y, positiveY.z), new Cartesian3(0, 0, 1));
    expectDirection(new Cartesian3(positiveZ.x, positiveZ.y, positiveZ.z), new Cartesian3(0, 1, 0));
  });

  it('removes and restores the live globe-root transform during a Three ↔ ECEF round trip', () => {
    const root = new Matrix4().compose(
      new Vector3(),
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.73),
      new Vector3(1, 1, 1),
    );
    const camera = new PerspectiveCamera(42, 16 / 9, 0.1, 100);
    camera.position.set(10.2, -3.7, 7.9);
    camera.up.set(0.12, 0.98, -0.11).normalize();
    camera.lookAt(new Vector3(0.2, -0.1, 0.3));
    camera.updateMatrixWorld(true);

    const pose = captureThreeGeographicPose(camera, root, EARTH_RADIUS);
    const restored = new PerspectiveCamera(60, 1, 0.1, 100);
    applyGeographicPoseToThreeCamera(restored, pose, root, EARTH_RADIUS);

    expect(restored.position.distanceTo(camera.position)).toBeLessThan(1e-5);
    expect(
      restored.getWorldDirection(new Vector3()).angleTo(camera.getWorldDirection(new Vector3())),
    ).toBeLessThan(1e-10);
    const restoredWorldUp = new Vector3(0, 1, 0).applyQuaternion(
      restored.getWorldQuaternion(new Quaternion()),
    );
    const sourceWorldUp = new Vector3(0, 1, 0).applyQuaternion(
      camera.getWorldQuaternion(new Quaternion()),
    );
    expect(restoredWorldUp.angleTo(sourceWorldUp)).toBeLessThan(1e-10);
    expect(restored.fov).toBeCloseTo(camera.fov, 10);
    expect(restored.aspect).toBeCloseTo(camera.aspect, 10);
  });

  it('converts vertical Three FOV to Cesium fov and back for landscape, portrait, and square', () => {
    const vertical = (42 * Math.PI) / 180;

    for (const aspect of [16 / 9, 9 / 16, 1]) {
      const cesiumFov = threeFovToCesium(vertical, aspect);
      expect(cesiumFovToVertical(cesiumFov, aspect)).toBeCloseTo(vertical, 12);
    }

    expect(threeFovToCesium(vertical, 16 / 9)).toBeGreaterThan(vertical);
    expect(threeFovToCesium(vertical, 9 / 16)).toBe(vertical);
  });

  it('derives a target-centered landing pose whose camera range equals the approved range', () => {
    const pose = landingPoseFromCameraPose({
      destination: { lat: 51.5074, lon: -0.1278, height: 140 },
      orientation: { heading: 22, pitch: -32, roll: 7 },
      range: 16_000,
    });
    const target = Ellipsoid.WGS84.cartographicToCartesian(
      Ellipsoid.WGS84.cartesianToCartographic(Cartesian3.fromDegrees(-0.1278, 51.5074, 140))!,
    );

    expect(Cartesian3.distance(new Cartesian3(...pose.positionEcef), target)).toBeCloseTo(
      16_000,
      5,
    );
    expectDirection(
      new Cartesian3(...pose.directionEcef),
      Cartesian3.subtract(target, new Cartesian3(...pose.positionEcef), new Cartesian3()),
    );
    expect(
      Math.abs(
        Cartesian3.dot(new Cartesian3(...pose.directionEcef), new Cartesian3(...pose.upEcef)),
      ),
    ).toBeLessThan(1e-12);
  });

  it('keeps a target-centered landing at screen center after mapping the pose into Three', () => {
    const cameraPose = {
      destination: { lat: -55, lon: -170, height: 400 },
      orientation: { heading: 0, pitch: -30, roll: 0 },
      range: 800,
    };
    const pose = landingPoseFromCameraPose(cameraPose);
    const root = new Matrix4().makeRotationY(0.73);
    const camera = new PerspectiveCamera(42, 16 / 9, 0.00001, 100);
    applyGeographicPoseToThreeCamera(camera, pose, root, EARTH_RADIUS);
    const target = geographicToThreeSpherePoint(
      cameraPose.destination.lat,
      cameraPose.destination.lon,
      EARTH_RADIUS,
      new Vector3(),
      cameraPose.destination.height,
    ).applyMatrix4(root);
    const projection = projectGeographicTarget(camera, target);

    expect(projection?.x).toBeCloseTo(0.5, 3);
    expect(projection?.y).toBeCloseTo(0.5, 3);
  });

  it('projects the target to equivalent normalized coordinates after a pose round trip', () => {
    const camera = new PerspectiveCamera(42, 16 / 9, 0.1, 100);
    camera.position.set(9, 4, 11);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const target = new Vector3(1.1, -0.8, 2.2);
    const before = projectGeographicTarget(camera, target);

    const pose = captureThreeGeographicPose(camera, IDENTITY_ROOT, EARTH_RADIUS);
    const restored = new PerspectiveCamera();
    applyGeographicPoseToThreeCamera(restored, pose, IDENTITY_ROOT, EARTH_RADIUS);
    const after = projectGeographicTarget(restored, target);

    expect(after?.x).toBeCloseTo(before?.x ?? Number.NaN, 10);
    expect(after?.y).toBeCloseTo(before?.y ?? Number.NaN, 10);
  });
});
