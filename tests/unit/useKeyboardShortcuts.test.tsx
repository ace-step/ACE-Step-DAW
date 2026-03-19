import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useKeyboardShortcuts } from '../../src/hooks/useKeyboardShortcuts';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

const transportSpies = {
  play: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
  seek: vi.fn(),
};

const recordingSpies = {
  toggleRecord: vi.fn(),
};

vi.mock('../../src/hooks/useTransport', () => ({
  useTransport: () => transportSpies,
}));

vi.mock('../../src/hooks/useRecording', () => ({
  useRecording: () => recordingSpies,
}));

vi.mock('../../src/services/generationPipeline', () => ({
  generateSingleClip: vi.fn(),
}));

function Harness() {
  useKeyboardShortcuts();
  return null;
}

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Shortcut Test' });
  });

  it('toggles mute and solo for the focused track in timeline context', () => {
    const drums = useProjectStore.getState().addTrack('drums');
    useUIStore.getState().setKeyboardContext('timeline', drums.id);
    render(<Harness />);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }));

    const track = useProjectStore.getState().project?.tracks.find((candidate) => candidate.id === drums.id);
    expect(track?.muted).toBe(true);
    expect(track?.soloed).toBe(true);
  });

  it('moves keyboard focus between tracks and targets the next focused track', () => {
    const drums = useProjectStore.getState().addTrack('drums');
    const bass = useProjectStore.getState().addTrack('bass');
    useUIStore.getState().setKeyboardContext('timeline', drums.id);
    render(<Harness />);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM' }));

    expect(useUIStore.getState().keyboardContext.trackId).toBe(bass.id);
    const updatedBass = useProjectStore.getState().project?.tracks.find((candidate) => candidate.id === bass.id);
    const updatedDrums = useProjectStore.getState().project?.tracks.find((candidate) => candidate.id === drums.id);
    expect(updatedBass?.muted).toBe(true);
    expect(updatedDrums?.muted).toBe(false);
  });

  it('defers piano-roll tool keys while keeping global panel toggles available', () => {
    const keys = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    useUIStore.getState().setKeyboardContext('pianoRoll', keys.id);
    render(<Harness />);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB' }));
    expect(useUIStore.getState().showSmartControls).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyO' }));
    expect(useUIStore.getState().loopBrowserOpen).toBe(true);
  });

  it('routes Cmd+Z to the active scoped history context', () => {
    const drums = useProjectStore.getState().addTrack('drums', 'sequencer');
    const bass = useProjectStore.getState().addTrack('bass', 'sequencer');

    useProjectStore.getState().initSequencerPattern(drums.id);
    useProjectStore.getState().initSequencerPattern(bass.id);

    const drumRowId = useProjectStore.getState().project!.tracks.find((track) => track.id === drums.id)!.sequencerPattern!.rows[0].id;
    const bassRowId = useProjectStore.getState().project!.tracks.find((track) => track.id === bass.id)!.sequencerPattern!.rows[0].id;

    useProjectStore.getState().toggleSequencerStep(drums.id, drumRowId, 0);
    useProjectStore.getState().toggleSequencerStep(bass.id, bassRowId, 1);

    useUIStore.getState().setOpenSequencerTrackId(drums.id);
    render(<Harness />);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', metaKey: true }));

    const project = useProjectStore.getState().project!;
    const drumTrack = project.tracks.find((track) => track.id === drums.id)!;
    const bassTrack = project.tracks.find((track) => track.id === bass.id)!;

    expect(drumTrack.sequencerPattern!.rows[0].steps[0].active).toBe(false);
    expect(bassTrack.sequencerPattern!.rows[0].steps[1].active).toBe(true);
  });

  it('routes Z and Shift+Z to arrangement zoom requests', () => {
    render(<Harness />);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' }));
    expect(useUIStore.getState().timelineZoomRequest).toEqual({
      id: 1,
      mode: 'selection',
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', shiftKey: true }));
    expect(useUIStore.getState().timelineZoomRequest).toEqual({
      id: 2,
      mode: 'project',
    });
  });
});
