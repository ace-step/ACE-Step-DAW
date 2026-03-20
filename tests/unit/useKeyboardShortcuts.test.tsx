import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useKeyboardShortcuts } from '../../src/hooks/useKeyboardShortcuts';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';
import { useTransportStore } from '../../src/store/transportStore';

const transportSpies = {
  play: vi.fn(),
  continuePlayback: vi.fn(),
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
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Shortcut Test' });
  });

  it('toggles mute and solo for the focused track in timeline context', () => {
    const drums = useProjectStore.getState().addTrack('drums');
    useUIStore.getState().setKeyboardContext('timeline', drums.id);
    render(<Harness />);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', shiftKey: true }));

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

  it('navigates timeline clip selection with arrow keys without touching text inputs', () => {
    const drums = useProjectStore.getState().addTrack('drums');
    const bass = useProjectStore.getState().addTrack('bass');
    const introClip = useProjectStore.getState().addClip(drums.id, {
      startTime: 0,
      duration: 4,
      prompt: 'intro',
      lyrics: '',
      source: 'generated',
    });
    const chorusClip = useProjectStore.getState().addClip(drums.id, {
      startTime: 8,
      duration: 4,
      prompt: 'chorus',
      lyrics: '',
      source: 'generated',
    });
    const bassClip = useProjectStore.getState().addClip(bass.id, {
      startTime: 8,
      duration: 4,
      prompt: 'bass',
      lyrics: '',
      source: 'generated',
    });

    useUIStore.getState().setKeyboardContext('timeline', drums.id);
    render(<Harness />);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
    expect(Array.from(useUIStore.getState().selectedClipIds)).toEqual([introClip.id]);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
    expect(Array.from(useUIStore.getState().selectedClipIds)).toEqual([chorusClip.id]);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown' }));
    expect(Array.from(useUIStore.getState().selectedClipIds)).toEqual([bassClip.id]);
    expect(useUIStore.getState().keyboardContext.trackId).toBe(bass.id);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', bubbles: true }));

    expect(Array.from(useUIStore.getState().selectedClipIds)).toEqual([bassClip.id]);
    input.remove();
  });

  it('navigates mixer channels with left and right arrows', () => {
    const drums = useProjectStore.getState().addTrack('drums');
    const bass = useProjectStore.getState().addTrack('bass');
    const keys = useProjectStore.getState().addTrack('keyboard');
    useUIStore.getState().setShowMixer(true);
    useUIStore.getState().setKeyboardContext('mixer', bass.id);
    render(<Harness />);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
    expect(useUIStore.getState().keyboardContext).toEqual({ scope: 'mixer', trackId: keys.id });
    expect(useUIStore.getState().expandedTrackId).toBe(keys.id);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
    expect(useUIStore.getState().keyboardContext).toEqual({ scope: 'mixer', trackId: bass.id });
    expect(useUIStore.getState().expandedTrackId).toBe(bass.id);

    expect(useProjectStore.getState().project?.tracks.map((track) => track.id)).toContain(drums.id);
  });

  it('navigates piano roll notes with arrow keys while leaving shift+arrows available for editing', () => {
    const keys = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    const clip = useProjectStore.getState().ensureMidiClip(keys.id);
    useProjectStore.getState().addMidiNote(clip.id, {
      id: 'note-c4',
      pitch: 60,
      startBeat: 0,
      durationBeats: 1,
      velocity: 0.8,
    });
    useProjectStore.getState().addMidiNote(clip.id, {
      id: 'note-e4',
      pitch: 64,
      startBeat: 1,
      durationBeats: 1,
      velocity: 0.8,
    });

    useUIStore.getState().setOpenPianoRoll(keys.id, clip.id);
    useUIStore.getState().setKeyboardContext('pianoRoll', keys.id);
    render(<Harness />);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
    expect(useUIStore.getState().selectedPianoRollNoteIds).toEqual(['note-c4']);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
    expect(useUIStore.getState().selectedPianoRollNoteIds).toEqual(['note-e4']);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
    expect(useUIStore.getState().selectedPianoRollNoteIds).toEqual(['note-c4']);
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
    useUIStore.getState().setKeyboardContext('timeline');
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

  it('toggles snap in timeline context with KeyN', () => {
    useUIStore.getState().setKeyboardContext('timeline');
    render(<Harness />);

    expect(useUIStore.getState().snapEnabled).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN' }));
    expect(useUIStore.getState().snapEnabled).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN' }));
    expect(useUIStore.getState().snapEnabled).toBe(true);
  });

  it('suppresses single-key shortcuts while typing in editable fields', () => {
    const drums = useProjectStore.getState().addTrack('drums');
    useUIStore.getState().setKeyboardContext('timeline', drums.id);
    render(<Harness />);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));

    const contentEditable = document.createElement('div');
    contentEditable.setAttribute('contenteditable', 'true');
    document.body.appendChild(contentEditable);
    contentEditable.focus();
    contentEditable.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', bubbles: true }));

    const track = useProjectStore.getState().project?.tracks.find((candidate) => candidate.id === drums.id);
    expect(track?.muted).toBe(false);
    expect(track?.soloed).toBe(false);
    expect(transportSpies.play).not.toHaveBeenCalled();

    contentEditable.remove();
    input.remove();
  });

  it('continues playback from the last stop position on Shift+Space', () => {
    render(<Harness />);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', shiftKey: true }));

    expect(transportSpies.continuePlayback).toHaveBeenCalledTimes(1);
    expect(transportSpies.play).not.toHaveBeenCalled();
    expect(transportSpies.pause).not.toHaveBeenCalled();
  });

  it('keeps Space mapped to the existing play/pause behavior', () => {
    render(<Harness />);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));

    expect(transportSpies.play).toHaveBeenCalledTimes(1);
  });
});
