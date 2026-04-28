import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useUIStore } from '../../../store/uiStore';
import { VocalReplacementModal } from '../VocalReplacementModal';

vi.mock('../../../services/generationPipeline', () => ({
  generateVocalReplacement: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../store/generationStore', () => ({
  useGenerationStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ isGenerating: false }),
    { getState: () => ({ isGenerating: false, tryAcquireGenerationLock: vi.fn().mockReturnValue(true) }) },
  ),
}));

vi.mock('../../../store/projectStore', () => ({
  useProjectStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) => {
      const state = {
        project: {
          id: 'proj-1',
          bpm: 120,
          keyScale: 'C major',
          timeSignature: 4,
          generationDefaults: { inferenceSteps: 30, guidanceScale: 5, shift: 5, thinking: false, model: 'test-model' },
          tracks: [
            {
              id: 'track-drums',
              trackName: 'drums',
              trackType: 'stems',
              displayName: 'Drums',
              clips: [{
                id: 'clip-1',
                trackId: 'track-drums',
                startTime: 0,
                duration: 30,
                prompt: 'Energetic rock drums',
                generationStatus: 'ready',
                isolatedAudioKey: 'audio-key-1',
                cumulativeMixKey: null,
                inferredMetas: { bpm: 120, keyScale: 'C major' },
              }],
            },
            {
              id: 'track-vocals',
              trackName: 'vocals',
              trackType: 'stems',
              displayName: 'Vocals',
              clips: [],
            },
          ],
        },
        getClipById: vi.fn().mockImplementation((id: string) => {
          if (id === 'clip-1') return {
            id: 'clip-1',
            trackId: 'track-drums',
            startTime: 0,
            duration: 30,
            prompt: 'Energetic rock drums',
            generationStatus: 'ready',
            isolatedAudioKey: 'audio-key-1',
            cumulativeMixKey: null,
            inferredMetas: { bpm: 120, keyScale: 'C major' },
          };
          return null;
        }),
        addTrack: vi.fn().mockReturnValue({ id: 'new-track-1' }),
        addClip: vi.fn().mockReturnValue({ id: 'new-clip-1' }),
      };
      return selector(state);
    },
    {
      getState: () => ({
        project: { id: 'proj-1', bpm: 120 },
        addTrack: vi.fn().mockReturnValue({ id: 'new-track-1' }),
        addClip: vi.fn().mockReturnValue({ id: 'new-clip-1' }),
      }),
    },
  ),
}));

describe('VocalReplacementModal', () => {
  beforeEach(() => {
    useUIStore.setState({ vocalReplacementClipId: null });
  });

  it('does not render when vocalReplacementClipId is null', () => {
    const { container } = render(<VocalReplacementModal />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the modal when a clip is selected', () => {
    useUIStore.setState({ vocalReplacementClipId: 'clip-1' });
    render(<VocalReplacementModal />);

    expect(screen.getAllByText('Generate Vocals').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('vocal-replacement-modal')).toBeInTheDocument();
  });

  it('shows source instrumental clip info', () => {
    useUIStore.setState({ vocalReplacementClipId: 'clip-1' });
    render(<VocalReplacementModal />);

    expect(screen.getByText('Source instrumental')).toBeInTheDocument();
    expect(screen.getByText('Drums')).toBeInTheDocument();
    expect(screen.getByText('Energetic rock drums')).toBeInTheDocument();
  });

  it('shows lyrics and vocal style inputs', () => {
    useUIStore.setState({ vocalReplacementClipId: 'clip-1' });
    render(<VocalReplacementModal />);

    expect(screen.getByTestId('vocal-lyrics-input')).toBeInTheDocument();
    expect(screen.getByTestId('vocal-style-input')).toBeInTheDocument();
  });

  it('shows target track selector with existing vocals track and new option', () => {
    useUIStore.setState({ vocalReplacementClipId: 'clip-1' });
    render(<VocalReplacementModal />);

    const selector = screen.getByTestId('vocal-target-track');
    expect(selector).toBeInTheDocument();
    // Should have "Create new" option and existing vocals track
    expect(screen.getByText('+ Create new Vocals track')).toBeInTheDocument();
    expect(screen.getByText('Vocals')).toBeInTheDocument();
  });

  it('disables generate button when lyrics or style are empty', () => {
    useUIStore.setState({ vocalReplacementClipId: 'clip-1' });
    render(<VocalReplacementModal />);

    const generateBtn = screen.getByTestId('vocal-generate-button');
    expect(generateBtn).toBeDisabled();
  });

  it('closes when cancel button is clicked', () => {
    useUIStore.setState({ vocalReplacementClipId: 'clip-1' });
    render(<VocalReplacementModal />);

    screen.getByText('Cancel').click();
    expect(useUIStore.getState().vocalReplacementClipId).toBeNull();
  });

  it('closes when close button is clicked', () => {
    useUIStore.setState({ vocalReplacementClipId: 'clip-1' });
    render(<VocalReplacementModal />);

    screen.getByLabelText('Close vocal replacement modal').click();
    expect(useUIStore.getState().vocalReplacementClipId).toBeNull();
  });

  it('shows language selector', () => {
    useUIStore.setState({ vocalReplacementClipId: 'clip-1' });
    render(<VocalReplacementModal />);

    expect(screen.getByText('Auto-detect')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
  });

  it('shows BPM and Key options', () => {
    useUIStore.setState({ vocalReplacementClipId: 'clip-1' });
    render(<VocalReplacementModal />);

    expect(screen.getByText('BPM')).toBeInTheDocument();
    expect(screen.getByText('Key')).toBeInTheDocument();
    expect(screen.getByText(/Project \(120\)/)).toBeInTheDocument();
  });
});
