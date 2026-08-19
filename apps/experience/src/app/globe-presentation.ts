import type { Project } from '@yii/content-schema';
import {
  GlobeRendererAdapter,
  type GlobeRendererAdapterProject,
} from '../renderers/globe/GlobeRendererAdapter.js';
import type { GlobePresentation } from '../state/runtime.js';

/** Builds the content-driven globe boundary only after every project has been schema-validated. */
export function createGlobePresentation(
  projects: readonly Project[],
  resolveAssetUrl: (packageRelativePath: string) => string = (path) => path,
): GlobePresentation {
  const projectsById = new Map<string, Project>();
  const globeProjects: GlobeRendererAdapterProject[] = projects.map((project) => {
    if (projectsById.has(project.id)) {
      throw new Error(`Duplicate globe presentation project id "${project.id}".`);
    }
    projectsById.set(project.id, project);
    return {
      id: project.id,
      categoryId: project.categoryId,
      marker: project.marker,
      geographicFraming: project.geographicFraming,
      previewEmphasis: project.geographicFraming.previewEmphasis,
    };
  });
  const createAdapter = (): GlobeRendererAdapter =>
    new GlobeRendererAdapter({ projects: globeProjects });
  let adapter = createAdapter();
  let mountedContainer: HTMLElement | null = null;

  return {
    get adapter() {
      return adapter;
    },
    projectIds: globeProjects.map((project) => project.id),
    getProject(projectId) {
      return projectsById.get(projectId);
    },
    resolveAssetUrl,
    mount(container) {
      mountedContainer = container;
      return adapter.start(container);
    },
    rebuild() {
      const previous = adapter;
      previous.dispose();
      adapter = createAdapter();
      if (mountedContainer) adapter.start(mountedContainer);
    },
  };
}
