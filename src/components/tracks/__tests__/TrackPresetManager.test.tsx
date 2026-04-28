import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TrackPresetManager } from '../TrackPresetManager';
import { useProjectStore } from '../../../store/projectStore';
import { useToastStore } from '../../../hooks/useToast';
import { useCollaborationStore } from '../../../store/collaborationStore';
import type { Project, TrackPreset } from '../../../types/project';

function makePreset(overrides: Partial<TrackPreset> = {}): TrackPreset {
  return {
    id: overrides.id ?? 'preset-1',
    name: overrides.name ?? 'Warm Pad',
    trackName: 'synth',
    trackType: 'pianoRoll',
    settings: {
      synthPreset: 'pad',
      volume: 0.8,
      pan: 0,
    },
    effects: [],
    midiEffects: [],
    createdAt: Date.now(),
    ...overrides,
  } as TrackPreset;
}

function setupProject(presets: TrackPreset[] = []) {
  useProjectStore.setState({
    project: {
      id: 'p',
      name: 'Test',
      tracks: [{ id: 'track-1', trackName: 'synth', displayName: 'Synth', color: '#ff0000', order: 0, volume: 0.8, muted: false, soloed: false, clips: [], effects: [], effectsEnabled: true }],
      bpm: 120,
      keyScale: 'C major',
      timeSignature: 4,
      timeSignatureDenominator: 4,
      totalDuration: 0,
      markers: [],
      tempoMap: [],
      timeSignatureMap: [],
      trackPresets: presets,
    } as unknown as Project,
  });
}

describe('TrackPresetManager', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useCollaborationStore.getState().reset();
    useToastStore.getState().clearToasts();
  });

  it('renders empty state when no presets exist', () => {
    setupProject([]);
    render(<TrackPresetManager />);
    expect(screen.getByText(/no track presets/i)).toBeTruthy();
  });

  it('lists presets by name', () => {
    setupProject([
      makePreset({ id: 'p1', name: 'Warm Pad' }),
      makePreset({ id: 'p2', name: 'Pluck Lead' }),
    ]);
    render(<TrackPresetManager />);
    expect(screen.getByText('Warm Pad')).toBeTruthy();
    expect(screen.getByText('Pluck Lead')).toBeTruthy();
  });

  it('shows track type for each preset', () => {
    setupProject([makePreset({ trackType: 'pianoRoll' })]);
    render(<TrackPresetManager />);
    expect(screen.getByText(/pianoRoll/i)).toBeTruthy();
  });

  it('calls deleteTrackPreset when delete is clicked', () => {
    setupProject([makePreset({ id: 'p1' })]);
    const deleteTrackPreset = vi.fn();
    useProjectStore.setState({ deleteTrackPreset });

    render(<TrackPresetManager />);
    fireEvent.click(screen.getByRole('button', { name: /delete preset/i }));
    expect(deleteTrackPreset).toHaveBeenCalledWith('p1');
  });

  it('calls applyTrackPreset when apply is clicked', () => {
    setupProject([makePreset({ id: 'p1' })]);
    const applyTrackPreset = vi.fn(() => undefined);
    useProjectStore.setState({ applyTrackPreset });

    render(<TrackPresetManager />);
    fireEvent.click(screen.getByRole('button', { name: /apply preset/i }));
    expect(applyTrackPreset).toHaveBeenCalledWith('p1');
  });

  it('shows feedback when applying a preset is blocked in viewer mode', () => {
    setupProject([makePreset({ id: 'p1' })]);
    useCollaborationStore.getState().setViewerMode(true);
    useProjectStore.setState({
      applyTrackPreset: vi.fn(() => undefined),
    });

    render(<TrackPresetManager />);
    fireEvent.click(screen.getByRole('button', { name: /apply preset/i }));
    expect(useToastStore.getState().toasts[0].message).toMatch(/viewer mode/i);
  });

  it('shows feedback instead of deleting presets in viewer mode', () => {
    setupProject([makePreset({ id: 'p1' })]);
    useCollaborationStore.getState().setViewerMode(true);
    const deleteTrackPreset = vi.fn();
    useProjectStore.setState({
      deleteTrackPreset,
    });

    render(<TrackPresetManager />);
    fireEvent.click(screen.getByRole('button', { name: /delete preset/i }));
    expect(deleteTrackPreset).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts[0].message).toMatch(/viewer mode/i);
  });

  it('shows save preset form with track selector when multiple tracks exist', () => {
    setupProject([]);
    // Add a second track so the selector renders
    const project = useProjectStore.getState().project!;
    useProjectStore.setState({
      project: {
        ...project,
        tracks: [
          ...project.tracks,
          { id: 'track-2', trackName: 'bass', displayName: 'Bass', color: '#00ff00', order: 1, volume: 0.8, muted: false, soloed: false, clips: [], effects: [], effectsEnabled: true },
        ],
      } as typeof project,
    });
    render(<TrackPresetManager />);
    expect(screen.getByPlaceholderText(/preset name/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /save preset/i })).toBeTruthy();
    expect(screen.getByRole('combobox')).toBeTruthy(); // track selector visible
  });

  it('calls saveTrackPreset with selected track and name', () => {
    setupProject([]);
    const saveTrackPreset = vi.fn(() => makePreset());
    useProjectStore.setState({ saveTrackPreset });

    render(<TrackPresetManager />);
    const nameInput = screen.getByPlaceholderText(/preset name/i);
    fireEvent.change(nameInput, { target: { value: 'My Preset' } });
    fireEvent.click(screen.getByRole('button', { name: /save preset/i }));
    expect(saveTrackPreset).toHaveBeenCalledWith('track-1', 'My Preset');
  });

  it('does not save with empty name', () => {
    setupProject([]);
    const saveTrackPreset = vi.fn(() => makePreset());
    useProjectStore.setState({ saveTrackPreset });

    render(<TrackPresetManager />);
    fireEvent.click(screen.getByRole('button', { name: /save preset/i }));
    expect(saveTrackPreset).not.toHaveBeenCalled();
  });

  it('clears name input after saving', () => {
    setupProject([]);
    useProjectStore.setState({ saveTrackPreset: vi.fn(() => makePreset()) });

    render(<TrackPresetManager />);
    const nameInput = screen.getByPlaceholderText(/preset name/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'My Preset' } });
    fireEvent.click(screen.getByRole('button', { name: /save preset/i }));
    expect(nameInput.value).toBe('');
  });

  it('keeps the name input when saving is blocked', () => {
    setupProject([]);
    useProjectStore.setState({ saveTrackPreset: vi.fn(() => undefined as unknown as TrackPreset) });

    render(<TrackPresetManager />);
    const nameInput = screen.getByPlaceholderText(/preset name/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Readonly Preset' } });
    fireEvent.click(screen.getByRole('button', { name: /save preset/i }));
    expect(nameInput.value).toBe('Readonly Preset');
    expect(screen.getByRole('alert').textContent).toContain('Preset was not saved.');
  });
});
