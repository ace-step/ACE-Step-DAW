import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CustomModelsPanel } from '../CustomModelsPanel';
import { useCustomModelStore } from '../../../store/customModelStore';
import { useUIStore } from '../../../store/uiStore';
import type { TrainingDataTrack, CustomModel } from '../../../types/api';

vi.mock('../../../services/aceStepApi', () => ({
  uploadTrainingTrack: vi.fn(),
  submitTrainingJob: vi.fn(),
  queryTrainingStatus: vi.fn(),
  deleteCustomModel: vi.fn(),
  listCustomModels: vi.fn().mockResolvedValue({ models: [] }),
}));
vi.mock('../../../services/projectStorage', () => ({ saveProject: vi.fn() }));

const sampleTracks: TrainingDataTrack[] = [
  { id: 't1', filename: 'rock_song.wav', duration: 180, bpm: 120, genre: ['rock'], sizeBytes: 5000000, mimeType: 'audio/wav', uploadedAt: 1 },
  { id: 't2', filename: 'pop_track.mp3', duration: 240, bpm: 128, genre: ['pop'], sizeBytes: 3000000, mimeType: 'audio/mpeg', uploadedAt: 2 },
  { id: 't3', filename: 'blues.flac', duration: 300, bpm: 90, genre: ['blues'], sizeBytes: 8000000, mimeType: 'audio/flac', uploadedAt: 3 },
];

const sampleModel: CustomModel = {
  id: 'model-1',
  name: 'My Rock Model',
  description: 'A custom rock style model',
  trackCount: 5,
  styleTags: ['rock', 'alternative'],
  trainedAt: Date.now(),
  trainingJobId: 'job-1',
  modelPath: '/models/custom/rock',
};

function setupVisible() {
  useUIStore.setState({ showCustomModels: true });
  useCustomModelStore.setState({
    trainingTracks: [],
    customModels: [],
    trainingJobs: {},
    isUploading: false,
    uploadError: null,
    trainingError: null,
  });
}

describe('CustomModelsPanel', () => {
  beforeEach(() => {
    setupVisible();
  });

  it('renders nothing when hidden', () => {
    useUIStore.setState({ showCustomModels: false });
    const { container } = render(<CustomModelsPanel />);
    expect(container.innerHTML).toBe('');
  });

  it('renders when visible', () => {
    render(<CustomModelsPanel />);
    expect(screen.getByTestId('custom-models-panel')).toBeInTheDocument();
  });

  it('shows header with title', () => {
    render(<CustomModelsPanel />);
    expect(screen.getByText('Custom Models')).toBeInTheDocument();
  });

  it('shows three tabs', () => {
    render(<CustomModelsPanel />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute('aria-label', 'Training Data');
    expect(tabs[1]).toHaveAttribute('aria-label', 'Training');
    expect(tabs[2]).toHaveAttribute('aria-label', 'My Models');
  });

  it('closes panel when close button clicked', () => {
    render(<CustomModelsPanel />);
    fireEvent.click(screen.getByTestId('custom-models-close'));
    expect(useUIStore.getState().showCustomModels).toBe(false);
  });

  describe('Upload tab', () => {
    it('shows upload zone by default', () => {
      render(<CustomModelsPanel />);
      expect(screen.getByText(/drop audio files/i)).toBeInTheDocument();
    });

    it('shows track count guidance', () => {
      render(<CustomModelsPanel />);
      expect(screen.getByText(/0 \/ 3 min tracks/)).toBeInTheDocument();
    });

    it('displays uploaded tracks', () => {
      useCustomModelStore.setState({ trainingTracks: sampleTracks });
      render(<CustomModelsPanel />);
      expect(screen.getByText('rock_song.wav')).toBeInTheDocument();
      expect(screen.getByText('pop_track.mp3')).toBeInTheDocument();
      expect(screen.getByText('blues.flac')).toBeInTheDocument();
    });

    it('shows track metadata', () => {
      useCustomModelStore.setState({ trainingTracks: [sampleTracks[0]] });
      render(<CustomModelsPanel />);
      expect(screen.getByText('3:00')).toBeInTheDocument();
      expect(screen.getByText('120 BPM')).toBeInTheDocument();
      expect(screen.getByText('rock')).toBeInTheDocument();
    });

    it('shows model name input when enough tracks', () => {
      useCustomModelStore.setState({ trainingTracks: sampleTracks });
      render(<CustomModelsPanel />);
      expect(screen.getByLabelText(/model name/i)).toBeInTheDocument();
    });

    it('does not show training form with fewer than 3 tracks', () => {
      useCustomModelStore.setState({ trainingTracks: [sampleTracks[0]] });
      render(<CustomModelsPanel />);
      expect(screen.queryByLabelText(/model name/i)).not.toBeInTheDocument();
    });

    it('shows clear all button when tracks exist', () => {
      useCustomModelStore.setState({ trainingTracks: sampleTracks });
      render(<CustomModelsPanel />);
      expect(screen.getByText(/clear all/i)).toBeInTheDocument();
    });

    it('shows upload error', () => {
      useCustomModelStore.setState({ uploadError: 'File too large' });
      render(<CustomModelsPanel />);
      expect(screen.getByText('File too large')).toBeInTheDocument();
    });

    it('shows uploading spinner', () => {
      useCustomModelStore.setState({ isUploading: true });
      render(<CustomModelsPanel />);
      expect(screen.getByText(/uploading/i)).toBeInTheDocument();
    });
  });

  describe('Models tab', () => {
    it('shows empty state when no models', () => {
      render(<CustomModelsPanel />);
      fireEvent.click(screen.getAllByRole('tab')[2]);
      expect(screen.getByText(/no custom models yet/i)).toBeInTheDocument();
    });

    it('displays custom models', () => {
      useCustomModelStore.setState({ customModels: [sampleModel] });
      render(<CustomModelsPanel />);
      fireEvent.click(screen.getAllByRole('tab')[2]);
      expect(screen.getByText('My Rock Model')).toBeInTheDocument();
      expect(screen.getByText('A custom rock style model')).toBeInTheDocument();
      expect(screen.getByText('5 tracks')).toBeInTheDocument();
    });

    it('shows style tags on model card', () => {
      useCustomModelStore.setState({ customModels: [sampleModel] });
      render(<CustomModelsPanel />);
      fireEvent.click(screen.getAllByRole('tab')[2]);
      expect(screen.getByText('rock')).toBeInTheDocument();
      expect(screen.getByText('alternative')).toBeInTheDocument();
    });

    it('shows delete confirmation', () => {
      useCustomModelStore.setState({ customModels: [sampleModel] });
      render(<CustomModelsPanel />);
      fireEvent.click(screen.getAllByRole('tab')[2]);
      fireEvent.click(screen.getByRole('button', { name: /delete my rock model/i }));
      expect(screen.getByText(/delete this model/i)).toBeInTheDocument();
    });
  });

  describe('Training tab', () => {
    it('shows empty state when no jobs', () => {
      render(<CustomModelsPanel />);
      fireEvent.click(screen.getAllByRole('tab')[1]);
      expect(screen.getByText(/no training jobs/i)).toBeInTheDocument();
    });

    it('shows active training job with progress', () => {
      useCustomModelStore.setState({
        trainingJobs: {
          'job-1': {
            jobId: 'job-1',
            name: 'Test Model',
            description: '',
            status: 'training',
            stage: 'training',
            progressPercent: 45,
            submittedTrackCount: 3,
            submittedStyleTags: [],
          },
        },
      });
      render(<CustomModelsPanel />);
      fireEvent.click(screen.getAllByRole('tab')[1]);
      expect(screen.getByText('Test Model')).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.getByText('45%')).toBeInTheDocument();
    });

    it('shows failed training job with error', () => {
      useCustomModelStore.setState({
        trainingJobs: {
          'job-2': {
            jobId: 'job-2',
            name: 'Failed Model',
            description: '',
            status: 'failed',
            stage: 'failed',
            progressPercent: 0,
            error: 'Insufficient VRAM',
            submittedTrackCount: 3,
            submittedStyleTags: [],
          },
        },
      });
      render(<CustomModelsPanel />);
      fireEvent.click(screen.getAllByRole('tab')[1]);
      expect(screen.getByText('Failed Model')).toBeInTheDocument();
      expect(screen.getByText('Insufficient VRAM')).toBeInTheDocument();
    });
  });
});
