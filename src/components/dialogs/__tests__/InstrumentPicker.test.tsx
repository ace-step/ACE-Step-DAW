import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InstrumentPicker } from '../InstrumentPicker';
import { useUIStore } from '../../../store/uiStore';
import { useProjectStore } from '../../../store/projectStore';
import { useToastStore } from '../../../hooks/useToast';
import { getArrangementEmptyTrackId } from '../../arrangement/trackSlotLayout';
import type { Track, TrackPreset } from '../../../types/project';

// Mock modules that use browser APIs not available in jsdom
vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));
vi.mock('../../../hooks/useAudioImport', () => ({
  useAudioImport: () => ({
    openFilePicker: vi.fn(),
    openQuickSamplerFilePicker: vi.fn(),
  }),
}));
vi.mock('../../../hooks/useRecording', () => ({
  useRecording: () => ({
    armedTrackIds: [],
    toggleArmTrack: vi.fn(),
  }),
}));
vi.mock('../../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    getTrackLevel: () => 0,
  }),
}));

describe('InstrumentPicker', () => {
  beforeEach(() => {
    // Initialize project so the picker renders
    useProjectStore.getState().createProject('Test Project');
    // Open the picker
    useUIStore.getState().setShowInstrumentPicker(true);
    useUIStore.setState({ selectedTrackIds: new Set() });
    useToastStore.getState().clearToasts();
  });

  it('renders all track type options including Drum Machine', () => {
    render(<InstrumentPicker />);

    expect(screen.getByText('Stems')).toBeInTheDocument();
    expect(screen.getByText('Sample')).toBeInTheDocument();
    expect(screen.getByText('Sequencer')).toBeInTheDocument();
    expect(screen.getByText('Piano Roll')).toBeInTheDocument();
    expect(screen.getByText('Drum Machine')).toBeInTheDocument();
  });

  it('does not show Strudel in the track type picker', () => {
    render(<InstrumentPicker />);

    // Strudel was removed from the Add Track picker in Phase 2.
    // Users access Strudel via the dedicated dock panel toggle instead.
    expect(screen.queryByText('Strudel')).not.toBeInTheDocument();
  });

  it('shows drum machine instrument step when Drum Machine type is selected', () => {
    render(<InstrumentPicker />);

    // Click on the Drum Machine type button
    fireEvent.click(screen.getByText('Drum Machine'));

    // Should show the drum machine instrument view
    expect(screen.getByText('Add Drum Machine Track')).toBeInTheDocument();
  });

  it('creates a drum machine track when the button is clicked', () => {
    const addTrackSpy = vi.spyOn(useProjectStore.getState(), 'addTrack');
    render(<InstrumentPicker />);

    // Select Drum Machine type
    fireEvent.click(screen.getByText('Drum Machine'));

    // Click the drum machine creation button
    const drumMachineButton = screen.getByText('Drum Machine', { selector: '.text-sm.font-medium' });
    fireEvent.click(drumMachineButton);

    expect(addTrackSpy).toHaveBeenCalledWith('percussion', 'drumMachine', undefined);
  });

  it('keeps the picker open when applying a preset is blocked', () => {
    const project = useProjectStore.getState().project!;
    const preset: TrackPreset = {
      id: 'preset-1',
      name: 'Warm Pad',
      trackName: 'synth',
      trackType: 'pianoRoll',
      settings: { color: '#3b82f6' },
      effects: [],
      midiEffects: [],
      createdAt: Date.now(),
    };
    const originalApplyTrackPreset = useProjectStore.getState().applyTrackPreset;
    useProjectStore.setState({
      project: { ...project, trackPresets: [preset] },
      applyTrackPreset: vi.fn(() => undefined),
    });

    render(<InstrumentPicker />);
    fireEvent.click(screen.getByRole('button', { name: /apply track preset warm pad/i }));

    expect(useUIStore.getState().showInstrumentPicker).toBe(true);
    expect(useToastStore.getState().toasts[0].message).toMatch(/viewer mode/i);

    useProjectStore.setState({ applyTrackPreset: originalApplyTrackPreset });
  });

  it('applies a preset track at the selected empty slot', () => {
    const project = useProjectStore.getState().project!;
    const preset: TrackPreset = {
      id: 'preset-1',
      name: 'Warm Pad',
      trackName: 'synth',
      trackType: 'pianoRoll',
      settings: { color: '#3b82f6' },
      effects: [],
      midiEffects: [],
      createdAt: Date.now(),
    };
    const originalApplyTrackPreset = useProjectStore.getState().applyTrackPreset;
    const createdTrack = { id: 'track-new' } as Track;
    const applyTrackPreset = vi.fn(() => createdTrack);
    useProjectStore.setState({
      project: { ...project, trackPresets: [preset] },
      applyTrackPreset,
    });
    useUIStore.setState({ selectedTrackIds: new Set([getArrangementEmptyTrackId(4)]) });

    render(<InstrumentPicker />);
    fireEvent.click(screen.getByRole('button', { name: /apply track preset warm pad/i }));

    expect(applyTrackPreset).toHaveBeenCalledWith('preset-1', { order: 5 });
    expect(useUIStore.getState().showInstrumentPicker).toBe(false);

    useProjectStore.setState({ applyTrackPreset: originalApplyTrackPreset });
  });
});
