import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClipContextMenu } from '../ClipContextMenu';
import { ClipContextMenuContainer } from '../ClipContextMenuContainer';
import {
  getGrooveBarLengthBeatsForClip,
  getGrooveGridBeatsFromMidiNotes,
  getGrooveLengthBeatsFromMidiNotes,
} from '../ClipContextMenuContainer';
import { useProjectStore } from '../../../store/projectStore';
import { useCollaborationStore } from '../../../store/collaborationStore';
import { useToastStore } from '../../../hooks/useToast';
import type { Clip, MidiNote, Project, Track } from '../../../types/project';

const noop = () => {};

const baseProps = {
  x: 100,
  y: 100,
  onClose: noop,
  onInspireMe: noop,
  onAddLayer: noop,
  onMusicEnhancer: noop,
  onEdit: noop,
  onDuplicate: noop,
  onSplitAtPlayhead: noop,
  onConsolidate: noop,
  onDelete: noop,
  onSelectAll: noop,
  onLoopSelection: noop,
  onToggleMute: noop,
  isMuted: false,
  onAssignColor: noop,
  onResetColor: noop,
  hasCustomColor: false,
  canConsolidate: false,
  isMidiClip: true,
};

function makeMidiClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: overrides.id ?? 'clip-1',
    trackId: overrides.trackId ?? 'track-1',
    startTime: 0,
    duration: 4,
    prompt: '',
    lyrics: '',
    generationStatus: 'ready',
    generationJobId: null,
    cumulativeMixKey: null,
    isolatedAudioKey: null,
    waveformPeaks: null,
    midiData: {
      grid: '1/16',
      notes: [],
    },
    ...overrides,
  };
}

function makeTrack(clip: Clip): Track {
  return {
    id: 'track-1',
    trackName: 'keyboard',
    trackType: 'pianoRoll',
    displayName: 'Keys',
    color: '#3b82f6',
    order: 1,
    volume: 0.8,
    muted: false,
    soloed: false,
    clips: [clip],
    effects: [],
    effectsEnabled: true,
  } as Track;
}

describe('ClipContextMenu — Extract Groove', () => {
  beforeEach(() => {
    useCollaborationStore.getState().reset();
    useToastStore.getState().clearToasts();
    useProjectStore.setState({
      project: null,
    });
  });

  it('shows Extract Groove option for MIDI clips', () => {
    const onExtractGroove = vi.fn();
    render(
      <ClipContextMenu
        {...baseProps}
        onOpenMidi={noop}
        onExtractGroove={onExtractGroove}
      />,
    );
    expect(screen.getByText(/extract groove/i)).toBeTruthy();
  });

  it('does not show Extract Groove for non-MIDI clips', () => {
    render(
      <ClipContextMenu
        {...baseProps}
        isMidiClip={false}
      />,
    );
    expect(screen.queryByText(/extract groove/i)).toBeNull();
  });

  it('calls onExtractGroove when clicked', () => {
    const onExtractGroove = vi.fn();
    render(
      <ClipContextMenu
        {...baseProps}
        onOpenMidi={noop}
        onExtractGroove={onExtractGroove}
      />,
    );
    fireEvent.click(screen.getByText(/extract groove/i));
    expect(onExtractGroove).toHaveBeenCalledTimes(1);
  });

  it('derives groove length from note content instead of clip region length', () => {
    const notes: MidiNote[] = [
      { id: 'n1', pitch: 60, startBeat: 0, durationBeats: 0.25, velocity: 90 },
      { id: 'n2', pitch: 62, startBeat: 1, durationBeats: 0.25, velocity: 88 },
      { id: 'n3', pitch: 64, startBeat: 2, durationBeats: 0.25, velocity: 86 },
      { id: 'n4', pitch: 65, startBeat: 3, durationBeats: 0.25, velocity: 84 },
    ];

    expect(getGrooveLengthBeatsFromMidiNotes(notes, 4, 0.25)).toBe(4);
  });

  it('ignores sustained duration and slight late timing when deriving groove length', () => {
    const notes: MidiNote[] = [
      { id: 'n1', pitch: 60, startBeat: 0, durationBeats: 0.25, velocity: 90 },
      { id: 'n2', pitch: 67, startBeat: 4.04, durationBeats: 2, velocity: 88 },
    ];

    expect(getGrooveLengthBeatsFromMidiNotes(notes, 4, 0.25)).toBe(4);
  });

  it('counts exact bar-boundary note onsets as part of the next bar', () => {
    const notes: MidiNote[] = [
      { id: 'n1', pitch: 60, startBeat: 0, durationBeats: 0.25, velocity: 90 },
      { id: 'n2', pitch: 67, startBeat: 4, durationBeats: 0.25, velocity: 88 },
    ];

    expect(getGrooveLengthBeatsFromMidiNotes(notes, 4, 0.25)).toBe(8);
  });

  it('rounds longer groove patterns up to the next bar boundary', () => {
    const notes: MidiNote[] = [
      { id: 'n1', pitch: 60, startBeat: 0, durationBeats: 0.25, velocity: 90 },
      { id: 'n2', pitch: 62, startBeat: 5, durationBeats: 0.25, velocity: 88 },
    ];

    expect(getGrooveLengthBeatsFromMidiNotes(notes, 4, 0.25)).toBe(8);
  });

  it('uses the active time signature at the clip start for bar length', () => {
    const project = {
      bpm: 120,
      timeSignature: 4,
      timeSignatureDenominator: 4,
      tempoMap: [],
      timeSignatureMap: [{ bar: 3, numerator: 3, denominator: 4 }],
    } as Project;

    expect(getGrooveBarLengthBeatsForClip(project, 4)).toBe(3);
  });

  it('uses a 16th-note analysis grid instead of the editable piano-roll snap grid', () => {
    const notes: MidiNote[] = [
      { id: 'n1', pitch: 60, startBeat: 0, durationBeats: 0.25, velocity: 90 },
      { id: 'n2', pitch: 62, startBeat: 0.25, durationBeats: 0.25, velocity: 88 },
      { id: 'n3', pitch: 64, startBeat: 0.5, durationBeats: 0.25, velocity: 86 },
      { id: 'n4', pitch: 65, startBeat: 0.75, durationBeats: 0.25, velocity: 84 },
    ];

    expect(getGrooveGridBeatsFromMidiNotes(notes)).toBe(0.25);
  });

  it('preserves 32nd-note onsets when the MIDI content needs finer analysis', () => {
    const notes: MidiNote[] = [
      { id: 'n1', pitch: 60, startBeat: 0, durationBeats: 0.125, velocity: 90 },
      { id: 'n2', pitch: 62, startBeat: 0.125, durationBeats: 0.125, velocity: 88 },
    ];

    expect(getGrooveGridBeatsFromMidiNotes(notes)).toBe(0.125);
  });

  it('shows feedback when extracting a groove from an empty MIDI clip is rejected', () => {
    const clip = makeMidiClip();
    const track = makeTrack(clip);
    useProjectStore.setState({
      project: {
        id: 'p',
        name: 'Test',
        tracks: [track],
        bpm: 120,
        keyScale: 'C major',
        timeSignature: 4,
        timeSignatureDenominator: 4,
        totalDuration: 4,
        markers: [],
        tempoMap: [],
        timeSignatureMap: [],
      } as unknown as Project,
      extractGrooveFromClip: vi.fn(() => undefined),
    });

    render(
      <ClipContextMenuContainer
        {...baseProps}
        clip={clip}
        track={track}
        selectedActionClipIds={[clip.id]}
        onEditModalOpen={noop}
      />,
    );
    fireEvent.click(screen.getByText(/extract groove/i));

    expect(useToastStore.getState().toasts[0].message).toMatch(/add midi notes/i);
  });

});
