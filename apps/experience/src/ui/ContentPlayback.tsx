import { ContentFormatComposition } from '../formats/registry.js';
import type { ContentPlaybackPresentation } from '../content/playback.js';
import './ContentPlayback.css';

export interface ContentPlaybackProps {
  state: string;
  presentation: ContentPlaybackPresentation | null;
}

function isContentState(state: string): boolean {
  return state === 'contentPlaying' || state === 'contentFinalHold';
}

/** Public story canvas driven exclusively by the state-owned playback presentation. */
export function ContentPlayback({ state, presentation }: ContentPlaybackProps) {
  const snapshot = presentation?.snapshot;
  if (!presentation || !snapshot || !isContentState(state)) return null;

  const isFinalHold = state === 'contentFinalHold';
  const data = {
    id: `${snapshot.projectId}:${snapshot.option.position}`,
    title: snapshot.option.title,
    displayText: snapshot.option.displayText,
    mediaRefs: snapshot.option.mediaRefs,
  };

  return (
    <section
      className="yii-story-content"
      data-content-position={snapshot.option.position}
      data-final-frame-held={String(isFinalHold)}
      data-opening-state-restored={String(snapshot.openingStateRestored)}
      data-playback-phase={isFinalHold ? 'final-hold' : snapshot.phase}
      data-playback-run={snapshot.run}
      data-testid="story-content"
    >
      <ContentFormatComposition
        data={data}
        formatIds={snapshot.option.formats}
        resolveAssetUrl={(path) => presentation.resolveAssetUrl(path)}
        videoSurface={presentation.videoSurface}
      />
      <div
        aria-hidden="true"
        data-content-position={snapshot.option.position}
        data-status={presentation.voiceoverStatus}
        data-testid="voiceover-player"
        hidden
      />
    </section>
  );
}
