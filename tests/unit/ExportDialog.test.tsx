import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ExportDialog } from '../../src/components/dialogs/ExportDialog';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

const mockGetAudioEngine = vi.fn();
const mockRenderMidiTrackOffline = vi.fn();
const mockRenderSamplerTrackOffline = vi.fn();
const mockRenderSequencerTrackOffline = vi.fn();
const mockExportMix = vi.fn();
const mockDownloadBlob = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
let resolveExport: ((blob: Blob) => void) | null = null;

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/audioFileManager', () => ({
  loadAudioBlobByKey: vi.fn(),
}));

vi.mock('../../src/hooks/useAudioEngine', () => ({
  getAudioEngine: () => mockGetAudioEngine(),
}));

vi.mock('../../src/engine/exportMix', () => ({
  exportMix: (...args: unknown[]) => mockExportMix(...args),
}));

vi.mock('../../src/engine/offlineRender', () => ({
  renderMidiTrackOffline: (...args: unknown[]) => mockRenderMidiTrackOffline(...args),
  renderSamplerTrackOffline: (...args: unknown[]) => mockRenderSamplerTrackOffline(...args),
  renderSequencerTrackOffline: (...args: unknown[]) => mockRenderSequencerTrackOffline(...args),
}));

vi.mock('../../src/engine/SamplerEngine', () => ({
  createSamplerConfig: vi.fn(),
}));

vi.mock('../../src/services/browserDownload', () => ({
  downloadBlob: (...args: unknown[]) => mockDownloadBlob(...args),
}));

vi.mock('../../src/hooks/useToast', () => ({
  toastSuccess: (...args: unknown[]) => mockToastSuccess(...args),
  toastError: (...args: unknown[]) => mockToastError(...args),
}));

describe('ExportDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    mockGetAudioEngine.mockReset();
    mockRenderMidiTrackOffline.mockReset();
    mockRenderSamplerTrackOffline.mockReset();
    mockRenderSequencerTrackOffline.mockReset();
    mockExportMix.mockReset();
    mockDownloadBlob.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    resolveExport = null;

    const sampleRate = 44100;
    const buffer = {
      numberOfChannels: 2,
      sampleRate,
      length: sampleRate,
      duration: 1,
      getChannelData: () => new Float32Array(sampleRate),
    } as unknown as AudioBuffer;

    mockGetAudioEngine.mockReturnValue({
      decodeAudioData: vi.fn(),
    });
    mockRenderMidiTrackOffline.mockResolvedValue(buffer);
    mockExportMix.mockImplementation((_clips, _totalDuration, _options, onProgress) => {
      onProgress?.({ stage: 'encoding', progress: 0.5 });
      return new Promise((resolve) => {
        resolveExport = resolve;
      });
    });

    useProjectStore.getState().createProject({ name: 'MP3 Export Test', bpm: 120 });
    useUIStore.getState().setShowExportDialog(true);
  });

  it('shows MP3 bitrate controls and forwards the selected bitrate with progress updates', async () => {
    const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 1,
      prompt: 'Test clip',
      globalCaption: '',
      lyrics: '',
      source: 'uploaded',
      midiData: {
        grid: '1/16',
        notes: [
          {
            id: 'note-1',
            pitch: 60,
            startBeat: 0,
            durationBeats: 1,
            velocity: 0.8,
          },
        ],
      },
    });

    render(<ExportDialog />);

    fireEvent.change(screen.getByTestId('export-format-select'), {
      target: { value: 'mp3' },
    });

    expect(screen.getByTestId('export-bitrate-select')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('export-bitrate-select'), {
      target: { value: '192' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Export MP3' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Exporting... 80%' })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(mockExportMix).toHaveBeenCalledOnce();
    });

    const exportCall = mockExportMix.mock.calls[0];
    expect(exportCall?.[2]).toMatchObject({
      format: 'mp3',
      mp3Bitrate: 192,
    });
    expect(typeof exportCall?.[3]).toBe('function');

    resolveExport?.(new Blob(['mp3'], { type: 'audio/mpeg' }));

    await waitFor(() => {
      expect(mockDownloadBlob).toHaveBeenCalledOnce();
      expect(mockToastSuccess).toHaveBeenCalledWith('MP3 exported successfully');
    });
  });

  it('offers MIDI export with selected-track scope and routes the selected track ids through the store action', () => {
    const piano = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    useProjectStore.getState().updateTrack(piano.id, { displayName: 'Lead' });
    const clip = useProjectStore.getState().ensureMidiClip(piano.id);
    useProjectStore.getState().addMidiNote(clip.id, {
      pitch: 60,
      startBeat: 0,
      durationBeats: 1,
      velocity: 0.8,
    });

    useProjectStore.getState().addTrack('drums');
    useUIStore.getState().selectTracks([piano.id]);

    const exportProjectMidi = vi.fn();
    useProjectStore.setState({ exportProjectMidi });

    render(<ExportDialog />);

    fireEvent.click(screen.getByRole('button', { name: 'MIDI' }));
    expect(screen.getByLabelText('All MIDI tracks')).toBeInTheDocument();
    expect(screen.getByLabelText('Selected tracks only')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Selected tracks only'));
    fireEvent.click(screen.getByRole('button', { name: 'Export MIDI' }));

    expect(exportProjectMidi).toHaveBeenCalledWith({ trackIds: [piano.id] });
  });
});
