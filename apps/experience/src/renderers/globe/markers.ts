import { Color, InstancedMesh, MeshBasicMaterial, Object3D, SphereGeometry, Vector3 } from 'three';
import type { MarkerSpec } from '@yii/content-schema';

// The adapter calls `advance()` from the shared application ticker. This system contains no RAF,
// timer, or input/navigation logic of its own.
const DEFAULT_GLOBE_RADIUS = 5.09;
const HIDDEN_SCALE_EPSILON = 0.01;
const EMPHASIS_SCALE = 1.65;
const MARKER_RESPONSE_PER_SECOND = 18;

export interface GlobeMarkerProject {
  id: string;
  categoryId: string;
  marker: MarkerSpec;
  previewEmphasis?: { markerScale?: number };
}

export interface GlobeMarkerSystemOptions {
  globeRadius?: number;
}

interface MarkerInstance {
  readonly project: GlobeMarkerProject;
  readonly position: Vector3;
  currentScale: number;
  targetScale: number;
}

function latLonToVector3(marker: MarkerSpec, radius: number): Vector3 {
  const latitude = (marker.lat * Math.PI) / 180;
  const longitude = (marker.lon * Math.PI) / 180;
  return new Vector3(
    -radius * Math.cos(latitude) * Math.cos(longitude),
    radius * Math.sin(latitude),
    radius * Math.cos(latitude) * Math.sin(longitude),
  );
}

/**
 * Content-driven, instanced globe markers. Category filtering and preview emphasis alter target
 * scales, then `advance()` interpolates them during the adapter's single shared ticker callback.
 */
export class GlobeMarkerSystem {
  readonly mesh: InstancedMesh<SphereGeometry, MeshBasicMaterial>;

  private readonly instances: MarkerInstance[];
  private readonly instanceByProjectId = new Map<string, MarkerInstance>();
  private readonly scratch = new Object3D();
  private readonly scratchColor = new Color();
  private activeCategoryId: string | null = null;
  private previewedProjectId: string | null = null;
  private disposed = false;

  constructor(projects: readonly GlobeMarkerProject[], options: GlobeMarkerSystemOptions = {}) {
    const globeRadius = options.globeRadius ?? DEFAULT_GLOBE_RADIUS;
    const geometry = new SphereGeometry(0.075, 12, 12);
    const material = new MeshBasicMaterial({
      color: '#7fc5ff',
      transparent: true,
      opacity: 0.94,
      vertexColors: true,
    });
    this.mesh = new InstancedMesh(geometry, material, projects.length);
    this.mesh.name = 'globe-markers';

    this.instances = projects.map((project) => {
      if (this.instanceByProjectId.has(project.id)) {
        throw new Error(`Duplicate globe marker project id "${project.id}".`);
      }
      const instance: MarkerInstance = {
        project,
        position: latLonToVector3(project.marker, globeRadius),
        currentScale: 1,
        targetScale: 1,
      };
      this.instanceByProjectId.set(project.id, instance);
      return instance;
    });

    this.instances.forEach((instance, index) => this.applyInstance(instance, index));
    this.commitInstances();
  }

  /** `null` restores idle mode and targets every marker for visibility. */
  setCategoryFilter(categoryId: string | null): void {
    if (this.disposed) return;
    this.activeCategoryId = categoryId;
    if (
      this.previewedProjectId &&
      categoryId !== null &&
      this.instanceByProjectId.get(this.previewedProjectId)?.project.categoryId !== categoryId
    ) {
      this.previewedProjectId = null;
    }
    this.recalculateTargets();
  }

  /** Selects one visible marker for destination emphasis; unknown/out-of-filter ids are ignored. */
  setPreviewProject(projectId: string | null): void {
    if (this.disposed) return;
    const marker = projectId ? this.instanceByProjectId.get(projectId) : undefined;
    if (!marker || (this.activeCategoryId && marker.project.categoryId !== this.activeCategoryId)) {
      this.previewedProjectId = null;
    } else {
      this.previewedProjectId = projectId;
    }
    this.recalculateTargets();
  }

  /** Interpolates marker visibility/emphasis once from the app-owned ticker; never starts a loop. */
  advance(deltaSeconds: number): void {
    if (this.disposed) return;
    const delta = Math.max(0, deltaSeconds);
    const progress = 1 - Math.exp(-MARKER_RESPONSE_PER_SECOND * delta);

    this.instances.forEach((instance, index) => {
      instance.currentScale += (instance.targetScale - instance.currentScale) * progress;
      if (Math.abs(instance.targetScale - instance.currentScale) < 0.0001) {
        instance.currentScale = instance.targetScale;
      }
      this.applyInstance(instance, index);
    });
    this.commitInstances();
  }

  targetVisibleProjectIds(): string[] {
    return this.instances
      .filter((instance) => instance.targetScale > HIDDEN_SCALE_EPSILON)
      .map((instance) => instance.project.id);
  }

  renderedVisibleProjectIds(): string[] {
    return this.instances
      .filter((instance) => instance.currentScale > HIDDEN_SCALE_EPSILON)
      .map((instance) => instance.project.id);
  }

  markerScale(projectId: string): number {
    const instance = this.instanceByProjectId.get(projectId);
    if (!instance) throw new Error(`Unknown globe marker project id "${projectId}".`);
    return instance.currentScale;
  }

  /** Copies the content-defined marker position for renderer-handoff projection diagnostics. */
  copyMarkerPosition(projectId: string, target: Vector3): boolean {
    const instance = this.instanceByProjectId.get(projectId);
    if (!instance || this.disposed) return false;
    target.copy(instance.position);
    return true;
  }

  get emphasizedProjectId(): string | null {
    return this.previewedProjectId;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
    this.mesh.count = 0;
    this.instances.length = 0;
    this.instanceByProjectId.clear();
    this.disposed = true;
  }

  private recalculateTargets(): void {
    this.instances.forEach((instance) => {
      const visible =
        this.activeCategoryId === null || instance.project.categoryId === this.activeCategoryId;
      const emphasis = instance.project.id === this.previewedProjectId;
      const contentScale = instance.project.previewEmphasis?.markerScale ?? EMPHASIS_SCALE;
      instance.targetScale = visible ? (emphasis ? contentScale : 1) : 0;
    });
  }

  private applyInstance(instance: MarkerInstance, index: number): void {
    this.scratch.position.copy(instance.position);
    this.scratch.scale.setScalar(instance.currentScale);
    this.scratch.updateMatrix();
    this.mesh.setMatrixAt(index, this.scratch.matrix);

    const emphasized = instance.project.id === this.previewedProjectId;
    this.scratchColor.set(emphasized ? '#fff6b0' : '#7fc5ff');
    this.mesh.setColorAt(index, this.scratchColor);
  }

  private commitInstances(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
