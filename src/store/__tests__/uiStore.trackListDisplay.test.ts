import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../uiStore';
import { TRACK_LIST_COLLAPSED_WIDTH } from '../../constants/trackList';

describe('UIStore track list display mode', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collapses the track list into a fixed thumbnail rail', () => {
    useUIStore.getState().setTrackListWidth(264);
    useUIStore.getState().setTrackListDisplayMode('collapsed');

    const state = useUIStore.getState();
    expect(state.trackListDisplayMode).toBe('collapsed');
    expect(state.trackListWidth).toBe(TRACK_LIST_COLLAPSED_WIDTH);
    expect(state.expandedTrackListWidth).toBe(264);
  });

  it('restores the previous expanded width after toggling back open', () => {
    useUIStore.getState().setTrackListWidth(288);
    useUIStore.getState().toggleTrackListDisplayMode();
    useUIStore.getState().toggleTrackListDisplayMode();

    const state = useUIStore.getState();
    expect(state.trackListDisplayMode).toBe('expanded');
    expect(state.trackListWidth).toBe(288);
    expect(state.expandedTrackListWidth).toBe(288);
  });
});
