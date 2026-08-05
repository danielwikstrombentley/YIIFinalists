import type { Project } from '@yii/content-schema';
import {
  GlobeRendererAdapter,
  type GlobeRendererAdapterProject,
} from '../renderers/globe/GlobeRendererAdapter.js';
import type { GlobePresentation } from '../state/runtime.js';

/** Builds the content-driven globe boundary only after every project has been schema-validated. */
export function createGlobePresentation(projects: readonly Project[]): GlobePresentation {
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
      previewEmphasis: project.geographicFraming.previewEmphasis,
    };
  });
  const adapter = new GlobeRendererAdapter({ projects: globeProjects });

  return {
    adapter,
    projectIds: globeProjects.map((project) => project.id),
    getProject(projectId) {
      return projectsById.get(projectId);
    },
  };
}
