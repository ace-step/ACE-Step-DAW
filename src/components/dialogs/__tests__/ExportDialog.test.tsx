import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ExportDialog } from '../ExportDialog';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';

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
});
