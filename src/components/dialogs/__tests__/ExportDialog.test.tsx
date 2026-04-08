import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ExportDialog } from '../ExportDialog';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';
import { useExportPresetsStore } from '../../../store/exportPresetsStore';

vi.mock('../../../hooks/useAudioEngine', () => ({
  getAudioEngine: vi.fn(() => ({
    decodeAudioData: vi.fn(),
  })),
}));

vi.mock('../../../services/audioFileManager', () => ({
  loadAudioBlobByKey: vi.fn(),
}));

vi.mock('../../../services/browserDownload', () => ({
  downloadBlob: vi.fn(),
}));

vi.mock('../../../engine/exportMix', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../engine/exportMix')>();
  return {
    ...actual,
    exportMix: vi.fn(),
    exportTrackStems: vi.fn(),
  };
});

vi.mock('../../../engine/offlineRender', () => ({
  renderMidiTrackOffline: vi.fn(),
  renderSamplerTrackOffline: vi.fn(),
  renderSequencerTrackOffline: vi.fn(),
}));

vi.mock('../../../hooks/useToast', () => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

describe('ExportDialog', () => {
  beforeEach(() => {
    useProjectStore.getState().createProject({ name: 'Stem Test Project' });
    const track1 = useProjectStore.getState().addTrack('drums');
    const track2 = useProjectStore.getState().addTrack('bass');
    useProjectStore.getState().updateTrack(track1.id, { displayName: 'Drums' });
    useProjectStore.getState().updateTrack(track2.id, { displayName: 'Bass' });
    useUIStore.getState().selectTrack(track1.id);
    useUIStore.getState().setShowExportDialog(true);
  });

  it('shows stem export mode and selected-track scope controls', () => {
    render(<ExportDialog />);

    expect(screen.getByLabelText(/export stems/i)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/export stems/i));

    expect(screen.getByLabelText(/all audible tracks/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/selected tracks only/i)).toBeInTheDocument();
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
  });

  it('renders preset selector with built-in presets', () => {
    useExportPresetsStore.getState().resetToDefaults();
    render(<ExportDialog />);
    const select = screen.getByTestId('export-preset-select') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    const options = Array.from(select.options).map((o) => o.text);
    expect(options).toContain('Quick MP3');
    expect(options).toContain('Master WAV 24-bit');
    expect(options).toContain('All Formats Bundle');
  });

  it('changes format when a preset is selected', () => {
    useExportPresetsStore.getState().resetToDefaults();
    render(<ExportDialog />);
    const presetSelect = screen.getByTestId('export-preset-select') as HTMLSelectElement;
    const mp3Option = Array.from(presetSelect.options).find((o) => o.text === 'Quick MP3');
    expect(mp3Option).toBeDefined();
    fireEvent.change(presetSelect, { target: { value: mp3Option!.value } });

    const formatSelect = screen.getByTestId('export-format-select') as HTMLSelectElement;
    expect(formatSelect.value).toBe('mp3');
  });

  it('shows BPM and key metadata inputs for MP3 format', () => {
    render(<ExportDialog />);
    const formatSelect = screen.getByTestId('export-format-select') as HTMLSelectElement;
    fireEvent.change(formatSelect, { target: { value: 'mp3' } });

    expect(screen.getByTestId('export-metadata-bpm')).toBeInTheDocument();
    expect(screen.getByTestId('export-metadata-key')).toBeInTheDocument();
  });

  it('auto-fills BPM from project state', () => {
    useExportPresetsStore.getState().resetToDefaults();
    useProjectStore.getState().updateProject({ bpm: 140 });

    render(<ExportDialog />);
    // Select Quick MP3 preset (autoFillMetadata = true)
    const presetSelect = screen.getByTestId('export-preset-select') as HTMLSelectElement;
    const mp3Option = Array.from(presetSelect.options).find((o) => o.text === 'Quick MP3');
    fireEvent.change(presetSelect, { target: { value: mp3Option!.value } });

    const bpmInput = screen.getByTestId('export-metadata-bpm') as HTMLInputElement;
    expect(bpmInput.value).toBe('140');
  });
});
