import { describe, expect, it } from 'vitest';
import { GlobeMarkerSystem, type GlobeMarkerProject } from '../../src/renderers/globe/markers.js';

const MARKERS: readonly GlobeMarkerProject[] = [
  { id: 'cat-a-1', categoryId: 'cat-a', marker: { lat: 20, lon: -30 } },
  { id: 'cat-a-2', categoryId: 'cat-a', marker: { lat: 25, lon: -24 } },
  { id: 'cat-a-3', categoryId: 'cat-a', marker: { lat: 18, lon: -18 } },
  { id: 'cat-b-1', categoryId: 'cat-b', marker: { lat: -20, lon: 35 } },
  { id: 'cat-b-2', categoryId: 'cat-b', marker: { lat: -25, lon: 42 } },
  { id: 'cat-b-3', categoryId: 'cat-b', marker: { lat: -18, lon: 48 } },
];

describe('GlobeMarkerSystem', () => {
  it('projects every content-defined marker into one instanced mesh and shows them all in idle', () => {
    const markers = new GlobeMarkerSystem(MARKERS);

    expect(markers.mesh.count).toBe(6);
    expect(markers.targetVisibleProjectIds()).toEqual(MARKERS.map((project) => project.id));
    markers.advance(1);
    expect(markers.renderedVisibleProjectIds()).toEqual(MARKERS.map((project) => project.id));

    markers.dispose();
  });

  it('filters to exactly the selected category projects and hides unrelated markers smoothly', () => {
    const markers = new GlobeMarkerSystem(MARKERS);

    markers.setCategoryFilter('cat-a');
    expect(markers.targetVisibleProjectIds()).toEqual(['cat-a-1', 'cat-a-2', 'cat-a-3']);
    markers.advance(1);
    expect(markers.renderedVisibleProjectIds()).toEqual(['cat-a-1', 'cat-a-2', 'cat-a-3']);

    markers.dispose();
  });

  it('emphasises only the preview destination and clears emphasis when that marker is filtered out', () => {
    const markers = new GlobeMarkerSystem(MARKERS);
    markers.setCategoryFilter('cat-a');
    markers.setPreviewProject('cat-a-2');
    markers.advance(1);

    expect(markers.emphasizedProjectId).toBe('cat-a-2');
    expect(markers.markerScale('cat-a-2')).toBeGreaterThan(markers.markerScale('cat-a-1'));

    markers.setCategoryFilter('cat-b');
    markers.advance(1);
    expect(markers.emphasizedProjectId).toBeNull();
    expect(markers.renderedVisibleProjectIds()).toEqual(['cat-b-1', 'cat-b-2', 'cat-b-3']);

    markers.dispose();
  });

  it('disposes geometry and material idempotently', () => {
    const markers = new GlobeMarkerSystem(MARKERS);

    markers.dispose();
    expect(markers.isDisposed).toBe(true);
    expect(() => markers.dispose()).not.toThrow();
  });
});
