import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InstrumentPicker } from '../../src/components/dialogs/InstrumentPicker';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

vi.mock('../../src/hooks/useAudioImport', () => ({
  useAudioImport: () => ({
    openFilePicker: vi.fn(),
  }),
}));

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('InstrumentPicker track presets', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState({ project: null });
    useUIStore.setState({
      showInstrumentPicker: true,
    });

    const store = useProjectStore.getState();
    store.createProject({ name: 'Preset Test Project' });
    const track = store.addTrack('keyboard', 'pianoRoll');
    store.updateTrack(track.id, { synthPreset: 'pad', color: '#123456' });
    store.saveTrackPreset(track.id, 'Dream Keys');
  });

  it('shows saved presets and applies them as new tracks', () => {
    render(<InstrumentPicker />);

    expect(screen.getByText('Track Presets')).toBeInTheDocument();
    const presetButton = screen.getByRole('button', { name: /dream keys/i });
    fireEvent.click(presetButton);

    const project = useProjectStore.getState().project;
    expect(project?.tracks).toHaveLength(2);

    const appliedTrack = project?.tracks.at(-1);
    expect(appliedTrack?.trackType).toBe('pianoRoll');
    expect(appliedTrack?.synthPreset).toBe('pad');
    expect(appliedTrack?.color).toBe('#123456');
    expect(useUIStore.getState().showInstrumentPicker).toBe(false);
  });
});
