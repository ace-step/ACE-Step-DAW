import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InstrumentPicker } from '../InstrumentPicker';
import { useUIStore } from '../../../store/uiStore';
import { useProjectStore } from '../../../store/projectStore';

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

    expect(addTrackSpy).toHaveBeenCalledWith('percussion', 'drumMachine');
  });
});
