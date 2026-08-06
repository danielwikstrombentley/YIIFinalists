import { describe, expect, it, vi } from 'vitest';
import type { GeographicFraming } from '@yii/content-schema';
import {
  GeographicCanvasTreatment,
  type CesiumTreatmentTarget,
} from '../../src/renderers/cesium/treatment.js';

const FRAMING: GeographicFraming = {
  scopeType: 'corridor',
  landingCamera: {
    destination: { lat: -55, lon: -162, height: 1_200 },
    orientation: { heading: 10, pitch: -30, roll: 0 },
    range: 16_000,
  },
  previewEmphasis: { markerScale: 1.2 },
  boundaries: ['projects/corridor/boundaries.geojson'],
  routes: ['projects/corridor/routes.geojson'],
  regions: ['projects/corridor/regions.geojson'],
  tileTier: 'safe-composition',
  canvasTreatment: {
    darken: 0.3,
    soften: 0.2,
    reframe: { crop: 'north' },
    highlight: { colour: 'cyan' },
  },
};

function createTarget() {
  const resources: { dispose: ReturnType<typeof vi.fn> }[] = [];
  const resource = () => {
    const next = { dispose: vi.fn() };
    resources.push(next);
    return next;
  };
  const target = {
    addPostProcess: vi.fn(() => resource()),
    addCameraReframe: vi.fn(() => resource()),
    addGeoJsonOverlay: vi.fn(() => resource()),
  } satisfies CesiumTreatmentTarget;
  return { target, resources };
}

describe('GeographicCanvasTreatment', () => {
  it('applies approved visual treatment and every geographic overlay through Cesium-owned ports', () => {
    const { target } = createTarget();
    const treatment = new GeographicCanvasTreatment(target);

    treatment.apply(FRAMING);

    expect(target.addPostProcess).toHaveBeenCalledWith({
      darken: 0.3,
      soften: 0.2,
      highlight: { colour: 'cyan' },
    });
    expect(target.addCameraReframe).toHaveBeenCalledWith({ crop: 'north' });
    expect(target.addGeoJsonOverlay).toHaveBeenCalledTimes(3);
    expect(target.addGeoJsonOverlay).toHaveBeenNthCalledWith(1, {
      kind: 'boundary',
      source: 'projects/corridor/boundaries.geojson',
    });
    expect(target.addGeoJsonOverlay).toHaveBeenNthCalledWith(2, {
      kind: 'route',
      source: 'projects/corridor/routes.geojson',
    });
    expect(target.addGeoJsonOverlay).toHaveBeenNthCalledWith(3, {
      kind: 'region',
      source: 'projects/corridor/regions.geojson',
    });
  });

  it('reverts every treatment resource before replacement and tolerates repeated restoration', () => {
    const { target, resources } = createTarget();
    const treatment = new GeographicCanvasTreatment(target);

    treatment.apply(FRAMING);
    treatment.restore();
    treatment.restore();

    expect(resources).toHaveLength(5);
    for (const resource of resources) {
      expect(resource.dispose).toHaveBeenCalledTimes(1);
    }
  });
});
