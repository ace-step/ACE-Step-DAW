import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { resolveFocusedTrackId } from '../focusResolution';

function resetStores() {
  useUIStore.setState(useUIStore.getInitialState(), true);
  // Set up a minimal project with 3 tracks
  useProjectStore.setState({
    project: {
      id: 'proj-1',
      name: 'Test',
      bpm: 120,
      timeSignatureNumerator: 4,
      timeSignatureDenominator: 4,
      duration: 60,
      keyScale: 'C major',
      tracks: [
        { id: 't1', name: 'Track 1', order: 0, clips: [{ id: 'c1', startTime: 0, duration: 4, trackId: 't1' }] },
        { id: 't2', name: 'Track 2', order: 1, clips: [] },
        { id: 't3', name: 'Track 3', order: 2, clips: [{ id: 'c2', startTime: 0, duration: 4, trackId: 't3' }] },
      ],
      markers: [],
      automationLanes: [],
      assets: [],
    } as any,
  });
}

describe('resolveFocusedTrackId', () => {
  beforeEach(resetStores);

  it('returns null when no project exists', () => {
    useProjectStore.setState({ project: null });
    expect(resolveFocusedTrackId()).toBeNull();
  });

  it('returns keyboard context trackId when set and valid', () => {
    useUIStore.setState({ keyboardContext: { scope: 'timeline', trackId: 't2' } });
    expect(resolveFocusedTrackId()).toBe('t2');
  });

  it('ignores keyboard context with invalid trackId', () => {
    useUIStore.setState({ keyboardContext: { scope: 'timeline', trackId: 'nonexistent' } });
    // Falls through to next priority
    expect(resolveFocusedTrackId()).not.toBe('nonexistent');
  });

  it('falls back to open piano roll track', () => {
    useUIStore.setState({ openPianoRollTrackId: 't2' });
    expect(resolveFocusedTrackId()).toBe('t2');
  });

  it('falls back to open sequencer track', () => {
    useUIStore.setState({ openSequencerTrackId: 't3' });
    expect(resolveFocusedTrackId()).toBe('t3');
  });

  it('falls back to expanded track', () => {
    useUIStore.setState({ expandedTrackId: 't2' });
    expect(resolveFocusedTrackId()).toBe('t2');
  });

  it('falls back to track of selected clip', () => {
    useUIStore.setState({ selectedClipIds: new Set(['c2']) });
    expect(resolveFocusedTrackId()).toBe('t3');
  });

  it('falls back to first track when nothing else is focused', () => {
    expect(resolveFocusedTrackId()).toBe('t1');
  });

  it('returns null for empty tracks array', () => {
    useProjectStore.setState({
      project: {
        id: 'p', name: 'Empty', bpm: 120,
        timeSignatureNumerator: 4, timeSignatureDenominator: 4,
        duration: 60, keyScale: 'C major',
        tracks: [], markers: [], automationLanes: [], assets: [],
      } as any,
    });
    expect(resolveFocusedTrackId()).toBeNull();
  });
});
