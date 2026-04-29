import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GrooveTemplatesPanel } from '../GrooveTemplatesPanel';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';
import { useCollaborationStore } from '../../../store/collaborationStore';
import type { Clip, Project, GrooveTemplate, Track } from '../../../types/project';

function makeGroove(overrides: Partial<GrooveTemplate> = {}): GrooveTemplate {
  return {
    id: overrides.id ?? 'groove-1',
    name: overrides.name ?? 'Swing 16ths',
    timingOffsets: [0, 0.02, 0, 0.03],
    velocityPattern: [1.2, 0.8, 1.0, 0.7],
    gridBeats: 0.25,
    lengthBeats: 1,
    createdAt: Date.now(),
    ...overrides,
  };
}

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
      notes: [
        { id: 'note-1', pitch: 60, startBeat: 0, durationBeats: 0.25, velocity: 80 },
        { id: 'note-2', pitch: 64, startBeat: 0.5, durationBeats: 0.25, velocity: 76 },
      ],
    },
    ...overrides,
  };
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: overrides.id ?? 'track-1',
    trackName: 'keyboard',
    trackType: 'pianoRoll',
    displayName: 'Keys',
    color: '#3b82f6',
    order: 1,
    volume: 0.8,
    muted: false,
    soloed: false,
    clips: overrides.clips ?? [makeMidiClip()],
    effects: [],
    effectsEnabled: true,
    ...overrides,
  } as Track;
}

function setupProject(groovePool: GrooveTemplate[] = [], tracks: Track[] = []) {
  useProjectStore.setState({
    project: {
      id: 'p',
      name: 'Test',
      tracks,
      bpm: 120,
      keyScale: 'C major',
      timeSignature: 4,
      timeSignatureDenominator: 4,
      totalDuration: 0,
      markers: [],
      tempoMap: [],
      timeSignatureMap: [],
      groovePool,
    } as unknown as Project,
  });
}

describe('GrooveTemplatesPanel', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useCollaborationStore.getState().reset();
    useUIStore.setState({
      grooveStrength: 100,
      openPianoRollTrackId: null,
      openPianoRollClipId: null,
      selectedPianoRollNoteIds: [],
    });
  });

  it('renders empty state when no grooves exist', () => {
    setupProject([]);
    render(<GrooveTemplatesPanel />);
    expect(screen.getByText(/no groove templates/i)).toBeTruthy();
  });

  it('lists groove templates by name', () => {
    setupProject([
      makeGroove({ id: 'g1', name: 'Swing 16ths' }),
      makeGroove({ id: 'g2', name: 'Laid Back 8ths' }),
    ]);
    render(<GrooveTemplatesPanel />);
    expect(screen.getByText('Swing 16ths')).toBeTruthy();
    expect(screen.getByText('Laid Back 8ths')).toBeTruthy();
  });

  it('displays grid and length info for each groove', () => {
    setupProject([makeGroove({ gridBeats: 0.25, lengthBeats: 4 })]);
    render(<GrooveTemplatesPanel />);
    expect(screen.getByText(/1\/16/)).toBeTruthy(); // 0.25 = 16th note
    expect(screen.getByText(/4 beats/i)).toBeTruthy();
  });

  it('calls deleteGrooveTemplate when delete button is clicked', () => {
    setupProject([makeGroove({ id: 'g1' })]);
    const deleteGrooveTemplate = vi.fn();
    useProjectStore.setState({ deleteGrooveTemplate });

    render(<GrooveTemplatesPanel />);
    fireEvent.click(screen.getByRole('button', { name: /delete groove/i }));
    expect(deleteGrooveTemplate).toHaveBeenCalledWith('g1');
  });

  it('enters rename mode on double-click and saves on Enter', () => {
    setupProject([makeGroove({ id: 'g1', name: 'Swing 16ths' })]);
    const renameGrooveTemplate = vi.fn();
    useProjectStore.setState({ renameGrooveTemplate });

    render(<GrooveTemplatesPanel />);
    fireEvent.doubleClick(screen.getByText('Swing 16ths'));

    const input = screen.getByDisplayValue('Swing 16ths');
    fireEvent.change(input, { target: { value: 'Funky Groove' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(renameGrooveTemplate).toHaveBeenCalledWith('g1', 'Funky Groove');
  });

  it('cancels rename on Escape', () => {
    setupProject([makeGroove({ id: 'g1', name: 'Swing 16ths' })]);
    const renameGrooveTemplate = vi.fn();
    useProjectStore.setState({ renameGrooveTemplate });

    render(<GrooveTemplatesPanel />);
    fireEvent.doubleClick(screen.getByText('Swing 16ths'));

    const input = screen.getByDisplayValue('Swing 16ths');
    fireEvent.change(input, { target: { value: 'New Name' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(renameGrooveTemplate).not.toHaveBeenCalled();
    // Original name should still be visible
    expect(screen.getByText('Swing 16ths')).toBeTruthy();
  });

  it('renders Apply button on each groove row', () => {
    setupProject([makeGroove({ id: 'g1' })]);
    render(<GrooveTemplatesPanel />);
    expect(screen.getByRole('button', { name: /apply groove/i })).toBeTruthy();
  });

  it('calls applyGrooveToClip when Apply is clicked with open clip', () => {
    setupProject([makeGroove({ id: 'g1' })], [makeTrack()]);
    const applyGrooveToClip = vi.fn();
    useProjectStore.setState({ applyGrooveToClip });
    useUIStore.setState({
      openPianoRollClipId: 'clip-1',
      selectedPianoRollNoteIds: ['note-1', 'note-2'],
      grooveStrength: 75,
    });

    render(<GrooveTemplatesPanel />);
    fireEvent.click(screen.getByRole('button', { name: /apply groove/i }));
    expect(applyGrooveToClip).toHaveBeenCalledWith('clip-1', ['note-1', 'note-2'], 'g1', { strength: 75 });
  });

  it('applies grooves to the visible fallback MIDI clip when the piano roll is opened at track scope', () => {
    setupProject([makeGroove({ id: 'g1' })], [makeTrack()]);
    const applyGrooveToClip = vi.fn();
    useProjectStore.setState({ applyGrooveToClip });
    useUIStore.setState({
      openPianoRollTrackId: 'track-1',
      openPianoRollClipId: null,
      selectedPianoRollNoteIds: [],
      grooveStrength: 80,
    });

    render(<GrooveTemplatesPanel />);
    fireEvent.click(screen.getByRole('button', { name: /apply groove/i }));
    expect(applyGrooveToClip).toHaveBeenCalledWith('clip-1', ['note-1', 'note-2'], 'g1', { strength: 80 });
  });

  it('disables groove actions in viewer mode', () => {
    setupProject([makeGroove({ id: 'g1', name: 'Swing 16ths' })], [makeTrack()]);
    const deleteGrooveTemplate = vi.fn();
    const renameGrooveTemplate = vi.fn();
    const applyGrooveToClip = vi.fn();
    useProjectStore.setState({
      deleteGrooveTemplate,
      renameGrooveTemplate,
      applyGrooveToClip,
    });
    useUIStore.setState({
      openPianoRollClipId: 'clip-1',
      selectedPianoRollNoteIds: ['note-1'],
    });
    useCollaborationStore.getState().setViewerMode(true);

    render(<GrooveTemplatesPanel />);
    const applyButton = screen.getByRole('button', { name: /apply groove/i }) as HTMLButtonElement;
    const deleteButton = screen.getByRole('button', { name: /delete groove/i }) as HTMLButtonElement;
    expect(applyButton.disabled).toBe(true);
    expect(deleteButton.disabled).toBe(true);

    fireEvent.click(applyButton);
    fireEvent.click(deleteButton);
    fireEvent.doubleClick(screen.getByText('Swing 16ths'));

    expect(applyGrooveToClip).not.toHaveBeenCalled();
    expect(deleteGrooveTemplate).not.toHaveBeenCalled();
    expect(renameGrooveTemplate).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue('Swing 16ths')).toBeNull();
  });

  it('shows strength slider defaulting to 100', () => {
    setupProject([makeGroove()]);
    render(<GrooveTemplatesPanel />);
    const slider = screen.getByRole('slider', { name: /strength/i });
    expect(slider).toBeTruthy();
    expect((slider as HTMLInputElement).value).toBe('100');
  });

  it('formats grid size to musical notation', () => {
    setupProject([
      makeGroove({ id: 'g1', gridBeats: 1, name: 'Quarter' }),
      makeGroove({ id: 'g2', gridBeats: 0.5, name: 'Eighth' }),
      makeGroove({ id: 'g3', gridBeats: 0.25, name: 'Sixteenth' }),
    ]);
    render(<GrooveTemplatesPanel />);
    expect(screen.getByText(/1\/4/)).toBeTruthy();
    expect(screen.getByText(/1\/8/)).toBeTruthy();
    expect(screen.getByText(/1\/16/)).toBeTruthy();
  });
});
