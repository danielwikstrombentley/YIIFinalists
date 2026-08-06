import './tokens.css';

/** The validated project identity that is permitted before story content begins. */
export interface LandingHeroProject {
  id: string;
  name: string;
  organisation: string;
  location: string;
}

export interface LandingHeroProps {
  /** The public state value; this component never determines navigation itself. */
  state: string;
  /** Resolved from the validated release using the machine's single selected-project ref. */
  project: LandingHeroProject | null;
}

/** Keeps landing identity absent during the concealed transition and every story state. */
export function isProjectLandingState(state: string): boolean {
  return state === 'projectLanding';
}

/**
 * Project identity treatment for the geographic landing. It deliberately contains no option,
 * replay, narration, or instructional UI: those capabilities do not exist on the public surface
 * until their owning future states are active.
 */
export function LandingHero({ state, project }: LandingHeroProps) {
  if (!project || !isProjectLandingState(state)) return null;

  return (
    <aside
      className="yii-landing-hero"
      data-project-id={project.id}
      data-testid="landing-hero"
      aria-atomic="true"
      aria-live="polite"
    >
      <div className="yii-landing-hero__content">
        <h1 className="yii-landing-hero__name">{project.name}</h1>
        <p className="yii-landing-hero__organisation">{project.organisation}</p>
        <p className="yii-landing-hero__location">{project.location}</p>
      </div>
    </aside>
  );
}