import type { GeographicFraming } from '@yii/content-schema';

export type GeographicOverlayKind = 'boundary' | 'route' | 'region';

export interface GeographicOverlay {
  kind: GeographicOverlayKind;
  /** Validated package-relative GeoJSON reference; never an arbitrary remote URL. */
  source: string;
}

export interface CesiumTreatmentResource {
  /** Removes the owned Cesium primitive, post-process stage, or camera treatment idempotently. */
  dispose(): void;
}

export interface CesiumPostProcessTreatment {
  darken?: number;
  soften?: number;
  highlight?: Record<string, unknown>;
}

/**
 * Narrow Cesium adapter port. The production stage maps these to Cesium primitives and
 * post-process stages; keeping those APIs behind this port makes the treatment testable without
 * a WebGL context and prevents a React overlay from becoming a competing renderer owner.
 */
export interface CesiumTreatmentTarget {
  addPostProcess(treatment: CesiumPostProcessTreatment): CesiumTreatmentResource;
  addCameraReframe(reframe: Record<string, unknown>): CesiumTreatmentResource;
  addGeoJsonOverlay(overlay: GeographicOverlay): CesiumTreatmentResource;
}

function hasPostProcess(treatment: CesiumPostProcessTreatment): boolean {
  return (
    treatment.darken !== undefined ||
    treatment.soften !== undefined ||
    treatment.highlight !== undefined
  );
}

/**
 * Owns the temporary Cesium canvas treatment for a selected project's landing. Calling `apply()`
 * always restores the preceding treatment first, while `restore()` is safe to call repeatedly on
 * state exit, interruption, fallback, and adapter disposal.
 */
export class GeographicCanvasTreatment {
  private resources: CesiumTreatmentResource[] = [];

  constructor(private readonly target: CesiumTreatmentTarget) {}

  apply(framing: GeographicFraming): void {
    this.restore();

    const postProcess: CesiumPostProcessTreatment = {
      darken: framing.canvasTreatment.darken,
      soften: framing.canvasTreatment.soften,
      highlight: framing.canvasTreatment.highlight,
    };
    if (hasPostProcess(postProcess)) {
      this.resources.push(this.target.addPostProcess(postProcess));
    }

    const reframe = framing.canvasTreatment.reframe;
    if (reframe) {
      this.resources.push(this.target.addCameraReframe(reframe));
    }

    this.addOverlays('boundary', framing.boundaries);
    this.addOverlays('route', framing.routes);
    this.addOverlays('region', framing.regions);
  }

  restore(): void {
    const resources = this.resources;
    this.resources = [];
    for (const resource of resources) resource.dispose();
  }

  private addOverlays(kind: GeographicOverlayKind, sources: readonly string[] | undefined): void {
    for (const source of sources ?? []) {
      this.resources.push(this.target.addGeoJsonOverlay({ kind, source }));
    }
  }
}
