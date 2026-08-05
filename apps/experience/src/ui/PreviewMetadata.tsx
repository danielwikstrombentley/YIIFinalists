import './tokens.css';

/** The portion of a validated project release that is legal to display during globe preview. */
export interface PreviewMetadataProject {
  id: string;
  name: string;
  organisation: string;
  country: string;
}

/** XState's public value is deliberately narrowed to the only state this presentation understands. */
export type PreviewMetadataState = string | { categoryActive?: string };

export interface PreviewMetadataProps {
  /** The state-machine snapshot value; this component never owns navigation state. */
  state: PreviewMetadataState;
  /** Resolved from the validated release using the snapshot's one previewed-project reference. */
  project: PreviewMetadataProject | null;
}

export function isCategoryPreviewState(state: PreviewMetadataState): boolean {
  return typeof state === 'object' && state.categoryActive === 'preview';
}

/**
 * Public identity overlay for `categoryActive.preview`. The persistent outer shell prevents a
 * blank/unmount frame during rapid wheel retargeting; the keyed inner block gives each project
 * identity a short, centrally-tokenised entrance without turning the LED into a menu.
 */
export function PreviewMetadata({ state, project }: PreviewMetadataProps) {
  if (!project || !isCategoryPreviewState(state)) return null;

  return (
    <aside
      className="yii-preview-metadata"
      data-project-id={project.id}
      data-testid="preview-metadata"
      aria-atomic="true"
      aria-live="polite"
    >
      <div key={project.id} className="yii-preview-metadata__content">
        <h1 className="yii-preview-metadata__name">{project.name}</h1>
        <p className="yii-preview-metadata__organisation">{project.organisation}</p>
        <p className="yii-preview-metadata__country">{project.country}</p>
      </div>
    </aside>
  );
}
