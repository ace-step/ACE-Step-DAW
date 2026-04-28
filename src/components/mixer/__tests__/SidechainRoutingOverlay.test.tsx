import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SidechainRoutingOverlay } from '../SidechainRoutingOverlay';
import { useProjectStore } from '../../../store/projectStore';
import type { CompressorParams } from '../../../types/project';

vi.mock('../../../services/projectStorage', () => ({ saveProject: vi.fn() }));

describe('SidechainRoutingOverlay', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject({ name: 'Test', bpm: 120 });
  });

  it('renders nothing when no sidechain routes exist', () => {
    const store = useProjectStore.getState();
    store.addTrack('stems');
    store.addTrack('stems');

    const { container } = render(<SidechainRoutingOverlay containerRef={{ current: null }} />);
    // Should render the SVG but with no path elements
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    const paths = container.querySelectorAll('[data-testid^="sidechain-route-"]');
    expect(paths).toHaveLength(0);
  });

  it('renders a route indicator when a compressor has a sidechain source', () => {
    const store = useProjectStore.getState();
    store.addTrack('stems');
    store.addTrack('stems');
    const tracks = useProjectStore.getState().project!.tracks;
    const kickId = tracks[0].id;
    const bassId = tracks[1].id;

    const effectId = store.addTrackEffect(bassId, 'compressor')!;
    store.setSidechainSource(bassId, effectId, kickId);

    const { container } = render(<SidechainRoutingOverlay containerRef={{ current: null }} />);
    const routeGroups = container.querySelectorAll('[data-testid^="sidechain-route-"]');
    expect(routeGroups).toHaveLength(1);
  });

  it('renders multiple route indicators for multiple sidechain connections', () => {
    const store = useProjectStore.getState();
    store.addTrack('stems');
    store.addTrack('stems');
    store.addTrack('stems');
    const tracks = useProjectStore.getState().project!.tracks;
    const kickId = tracks[0].id;
    const bassId = tracks[1].id;
    const padId = tracks[2].id;

    const bassEffectId = store.addTrackEffect(bassId, 'compressor')!;
    store.setSidechainSource(bassId, bassEffectId, kickId);

    const padEffectId = store.addTrackEffect(padId, 'compressor')!;
    store.setSidechainSource(padId, padEffectId, kickId);

    const { container } = render(<SidechainRoutingOverlay containerRef={{ current: null }} />);
    const routeGroups = container.querySelectorAll('[data-testid^="sidechain-route-"]');
    expect(routeGroups).toHaveLength(2);
  });

  it('does not render routes for compressors without sidechain', () => {
    const store = useProjectStore.getState();
    store.addTrack('stems');
    store.addTrack('stems');
    const tracks = useProjectStore.getState().project!.tracks;
    const bassId = tracks[1].id;

    // Add compressor without sidechain source
    store.addTrackEffect(bassId, 'compressor');

    const { container } = render(<SidechainRoutingOverlay containerRef={{ current: null }} />);
    const routeGroups = container.querySelectorAll('[data-testid^="sidechain-route-"]');
    expect(routeGroups).toHaveLength(0);
  });
});
