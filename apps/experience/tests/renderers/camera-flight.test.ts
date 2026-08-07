import { Cartesian3 } from 'cesium';
import { describe, expect, it, vi } from 'vitest';
import type { GeographicFraming } from '@yii/content-schema';
import {
  CesiumCameraFlightAdapter,
  mapCameraPoseToCesium,
  type CesiumCameraLike,
  type CameraFlightHandle,
  type NativeCameraFlightOptions,
} from '../../src/renderers/cesium/camera-flight.js';
import type { GeographicCameraPose } from '../../src/renderers/handover/geographic-camera-pose.js';

const FRAMING: GeographicFraming = {
  scopeType: 'corridor',
  landingCamera: {
    destination: { lat: -55, lon: -162, height: 1_200 },
    orientation: { heading: 10, pitch: -30, roll: 0 },
    range: 16_000,
  },
  previewEmphasis: { markerScale: 1.2 },
  tileTier: 'safe-composition',
  canvasTreatment: { darken: 0.15 },
};

const PREVIEW_POSE: GeographicCameraPose = {
  positionEcef: [14_000_000, 2_000_000, -9_000_000],
  directionEcef: [-0.8, -0.1, 0.6],
  upEcef: [0.1, 0.98, 0.15],
  verticalFovRadians: (42 * Math.PI) / 180,
  aspectRatio: 16 / 9,
};

function createCamera() {
  let lastFlight: NativeCameraFlightOptions | null = null;
  const camera = {
    flyTo: vi.fn((options: NativeCameraFlightOptions) => {
      lastFlight = options;
    }),
    cancelFlight: vi.fn(),
  } satisfies CesiumCameraLike;
  return {
    camera,
    lastFlight: () => lastFlight,
  };
}

describe('CesiumCameraFlightAdapter', () => {
  it('maps range as target distance rather than replacing cartographic target height', () => {
    const mapped = mapCameraPoseToCesium(FRAMING.landingCamera);
    const target = Cartesian3.fromDegrees(
      FRAMING.landingCamera.destination.lon,
      FRAMING.landingCamera.destination.lat,
      FRAMING.landingCamera.destination.height,
    );
    const cameraPosition = mapped.destination as Cartesian3;

    expect(Cartesian3.distance(cameraPosition, target)).toBeCloseTo(FRAMING.landingCamera.range, 5);
    expect(mapped.orientation).toMatchObject({
      direction: expect.any(Cartesian3),
      up: expect.any(Cartesian3),
    });
  });

  it('maps approved landing framing into one native Cesium flight and resolves on completion', async () => {
    const { camera, lastFlight } = createCamera();
    const poseMapper = vi.fn(() => ({
      destination: { kind: 'cesium-cartesian' },
      orientation: { heading: 0.1, pitch: -0.5, roll: 0 },
    }));
    const adapter = new CesiumCameraFlightAdapter({ camera, poseMapper });

    const flight = adapter.flyToFraming(FRAMING);
    const nativeFlight = lastFlight();
    expect(poseMapper).toHaveBeenCalledWith(FRAMING.landingCamera);
    expect(nativeFlight).toMatchObject({
      duration: 1.8,
      destination: { kind: 'cesium-cartesian' },
    });
    expect(adapter.isNativeFlightActive).toBe(true);

    nativeFlight?.complete?.();
    await expect(flight.finished).resolves.toEqual({ status: 'completed' });
    expect(adapter.isNativeFlightActive).toBe(false);
  });

  it('cancels mid-flight deterministically and ignores a late native complete callback', async () => {
    const { camera, lastFlight } = createCamera();
    const adapter = new CesiumCameraFlightAdapter({
      camera,
      poseMapper: () => ({ destination: {} }),
    });

    const flight = adapter.flyToFraming(FRAMING);
    const nativeFlight = lastFlight();
    flight.cancel();
    nativeFlight?.complete?.();

    await expect(flight.finished).resolves.toEqual({ status: 'cancelled' });
    expect(camera.cancelFlight).toHaveBeenCalledTimes(1);
    expect(adapter.isNativeFlightActive).toBe(false);
  });

  it('rejects GSAP camera writes while a native Cesium flight owns the camera', () => {
    const { camera } = createCamera();
    const adapter = new CesiumCameraFlightAdapter({
      camera,
      poseMapper: () => ({ destination: {} }),
    });

    adapter.assertGsapCameraWriteAllowed();
    const flight = adapter.flyToFraming(FRAMING);
    expect(() => adapter.assertGsapCameraWriteAllowed()).toThrow(/native Cesium flight/i);

    flight.cancel();
    expect(() => adapter.assertGsapCameraWriteAllowed()).not.toThrow();
  });

  it('cancels a superseded native flight before beginning its replacement', async () => {
    const { camera } = createCamera();
    const adapter = new CesiumCameraFlightAdapter({
      camera,
      poseMapper: () => ({ destination: {} }),
    });

    const first = adapter.flyToFraming(FRAMING);
    const second = adapter.flyToFraming(FRAMING);

    await expect(first.finished).resolves.toEqual({ status: 'cancelled' });
    expect(camera.cancelFlight).toHaveBeenCalledTimes(1);
    second.cancel();
  });

  it('flies back to an exact captured globe-preview pose through the same native camera owner', async () => {
    const { camera, lastFlight } = createCamera();
    const adapter = new CesiumCameraFlightAdapter({
      camera,
      poseMapper: () => ({ destination: {} }),
    });
    const reverseAdapter = adapter as CesiumCameraFlightAdapter & {
      flyToGeographicPose(pose: GeographicCameraPose, durationSeconds: number): CameraFlightHandle;
    };

    const flight = reverseAdapter.flyToGeographicPose(PREVIEW_POSE, 4.2);
    const nativeFlight = lastFlight();

    expect(nativeFlight).toMatchObject({
      duration: 4.2,
      destination: new Cartesian3(...PREVIEW_POSE.positionEcef),
      orientation: {
        direction: new Cartesian3(...PREVIEW_POSE.directionEcef),
        up: new Cartesian3(...PREVIEW_POSE.upEcef),
      },
    });
    nativeFlight?.complete?.();
    await expect(flight.finished).resolves.toEqual({ status: 'completed' });
  });
});
