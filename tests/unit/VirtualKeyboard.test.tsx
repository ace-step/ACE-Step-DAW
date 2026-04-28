import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { VirtualKeyboard } from '../../src/components/midi/VirtualKeyboard';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';
import { useUIStore } from '../../src/store/uiStore';
import { MidiCaptureService, setMidiCaptureService } from '../../src/services/midiCaptureService';

const synthEngineSpies = vi.hoisted(() => ({
  ensureTrackSynth: vi.fn(),
  noteOn: vi.fn(),
  noteOff: vi.fn(),
  releaseAll: vi.fn(),
}));

vi.mock('../../src/engine/SynthEngine', () => ({
  synthEngine: synthEngineSpies,
}));

describe('VirtualKeyboard', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Virtual Keyboard Test', bpm: 120 });
    setMidiCaptureService(new MidiCaptureService());
  });

  it('renders the bottom overlay only when enabled and highlights pressed pitches', () => {
    const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');

    const { rerender } = render(<VirtualKeyboard />);
    expect(screen.queryByLabelText('Virtual MIDI keyboard')).not.toBeInTheDocument();

    useUIStore.getState().setShowVirtualKeyboard(true);
    useUIStore.getState().setKeyboardContext('timeline', track.id);
    useUIStore.getState().pressVirtualKeyboardPitch(60);
    rerender(<VirtualKeyboard />);

    expect(screen.getByLabelText('Virtual MIDI keyboard')).toBeInTheDocument();
    expect(screen.getByLabelText('Virtual key C4')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Oct 4')).toBeInTheDocument();
    expect(screen.getByText('Vel 96')).toBeInTheDocument();
  });

  it('plays notes, updates UI state, and records armed piano-roll notes into a MIDI clip', () => {
    const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    useTransportStore.setState({
      armedTrackIds: [track.id],
      isRecording: true,
      currentTime: 0,
    });
    useUIStore.getState().setShowVirtualKeyboard(true);

    render(<VirtualKeyboard />);

    fireEvent.keyDown(window, { code: 'KeyA' });
    expect(synthEngineSpies.ensureTrackSynth).toHaveBeenCalledWith(track.id, 'organ');
    expect(synthEngineSpies.noteOn).toHaveBeenCalledWith(track.id, 60, 96);
    expect(useUIStore.getState().virtualKeyboardPressedPitches).toEqual([60]);

    useTransportStore.getState().setCurrentTime(0.5);
    fireEvent.keyUp(window, { code: 'KeyA' });

    expect(synthEngineSpies.noteOff).toHaveBeenCalledWith(track.id, 60);
    expect(useUIStore.getState().virtualKeyboardPressedPitches).toEqual([]);

    const clip = useProjectStore.getState().getTrackById(track.id)?.clips.find((candidate) => candidate.midiData);
    expect(clip).not.toBeUndefined();
    expect(clip?.midiData?.notes).toHaveLength(1);
    expect(clip?.midiData?.notes[0]).toMatchObject({
      pitch: 60,
      startBeat: 0,
      durationBeats: 1,
      velocity: 96 / 127,
    });
  });

  it('adjusts octave and velocity from keyboard shortcuts and routes captured notes to the active armed track', () => {
    const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    const captureService = new MidiCaptureService();
    setMidiCaptureService(captureService);
    useTransportStore.setState({
      armedTrackIds: [track.id],
      currentTime: 2,
    });
    useUIStore.getState().setShowVirtualKeyboard(true);

    render(<VirtualKeyboard />);

    fireEvent.keyDown(window, { code: 'KeyX' });
    fireEvent.keyDown(window, { code: 'KeyV' });
    fireEvent.keyDown(window, { code: 'KeyK' });
    fireEvent.keyUp(window, { code: 'KeyK' });

    expect(useUIStore.getState().virtualKeyboardOctave).toBe(5);
    expect(useUIStore.getState().virtualKeyboardVelocity).toBe(104);
    expect(synthEngineSpies.noteOn).toHaveBeenCalledWith(track.id, 84, 104);
    expect(synthEngineSpies.noteOff).toHaveBeenCalledWith(track.id, 84);

    const captured = captureService.getBuffer(track.id);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.pitch).toBe(84);
    expect(captured[0]?.velocity).toBe(104 / 127);
    expect(captured[0]?.timeOn).toBe(2);
    expect(captured[0]?.timeOff).toBe(2);
  });
});
