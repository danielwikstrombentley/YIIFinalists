// Preload manager skeleton (T017, FR-030): "on preview — warm the previewed project's Cesium
// target and landing assets; on landing — preload all active option media/voiceover". Real asset
// warming needs the renderer/media adapters (PH3+); this skeleton tracks *what* should be
// preloaded so those adapters have a ready-made request list to act on without redesigning this
// module.

export type PreloadKind = 'project-landing' | 'option-media' | 'option-voiceover';

export interface PreloadTarget {
  kind: PreloadKind;
  ref: string;
}

export class PreloadManager {
  private readonly requested = new Set<string>();

  private key(target: PreloadTarget): string {
    return `${target.kind}:${target.ref}`;
  }

  request(target: PreloadTarget): void {
    this.requested.add(this.key(target));
  }

  isRequested(target: PreloadTarget): boolean {
    return this.requested.has(this.key(target));
  }

  clear(): void {
    this.requested.clear();
  }

  get size(): number {
    return this.requested.size;
  }
}
