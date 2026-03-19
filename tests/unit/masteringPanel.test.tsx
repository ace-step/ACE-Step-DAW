import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MasteringPanel } from '../../src/components/mixer/MasteringPanel';
import { useProjectStore } from '../../src/store/projectStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../src/services/audioFileManager', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/audioFileManager')>('../../src/services/audioFileManager');
  return {
    ...actual,
    loadAudioBlobByKey: vi.fn(),
    saveAudioBlob: vi.fn(),
  };
});

vi.mock('../../src/hooks/useToast', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../src/hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    masterVolume: 1,
    getMasterLevel: () => 0,
    getTrackLevel: () => 0,
    getMasterMeter: () => ({ level: 0, clipped: false }),
    getTrackMeter: () => ({ level: 0, clipped: false }),
    getMasterInputMeter: () => ({ level: 0, clipped: false }),
    getMasterOutputMeter: () => ({ level: 0, clipped: false }),
    resetMasterClip: vi.fn(),
    ctx: {
      createBuffer: vi.fn((channels: number, length: number, rate: number) => ({
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        duration: length / rate,
        getChannelData: () => new Float32Array(length),
      })),
    },
    decodeAudioData: vi.fn(),
  }),
}));

function setupProject() {
  useProjectStore.getState().createProject({ name: 'Mastering Test' });
  useProjectStore.getState().addTrack('stems');
}

describe('MasteringPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
  });

  it('renders nothing without a project', () => {
    const { container } = render(<MasteringPanel />);
    expect(container.innerHTML).toBe('');
  });

  it('renders AI Master button when project exists', () => {
    setupProject();
    render(<MasteringPanel />);
    expect(screen.getByRole('button', { name: 'Analyze mix for AI mastering' })).toBeInTheDocument();
  });

  it('shows AI Master heading label', () => {
    setupProject();
    render(<MasteringPanel />);
    // Both the heading div and button contain "AI Master" text
    const elements = screen.getAllByText('AI Master');
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows analyzing state when clicked', () => {
    setupProject();
    render(<MasteringPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Analyze mix for AI mastering' }));

    // Button text changes to "Analyzing..."
    expect(screen.getByText('Analyzing...')).toBeInTheDocument();
  });

  it('shows all 4 preset buttons after analysis completes', async () => {
    setupProject();
    await useProjectStore.getState().analyzeMastering();
    render(<MasteringPanel />);

    expect(screen.getByRole('button', { name: 'Use Balanced mastering preset' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use Loud mastering preset' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use Warm mastering preset' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use Bright mastering preset' })).toBeInTheDocument();
  });

  it('shows loudness target buttons after analysis', async () => {
    setupProject();
    await useProjectStore.getState().analyzeMastering();
    render(<MasteringPanel />);

    expect(screen.getByRole('button', { name: 'Set mastering loudness target to -14 LUFS' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set mastering loudness target to -11 LUFS' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set mastering loudness target to -8 LUFS' })).toBeInTheDocument();
  });

  it('shows A/B toggle after analysis', async () => {
    setupProject();
    await useProjectStore.getState().analyzeMastering();
    render(<MasteringPanel />);

    expect(screen.getByRole('button', { name: 'Preview original signal' })).toBeInTheDocument();
  });

  it('shows Master On/Off toggle after analysis', async () => {
    setupProject();
    await useProjectStore.getState().analyzeMastering();
    render(<MasteringPanel />);

    expect(screen.getByRole('button', { name: 'Disable mastered output' })).toBeInTheDocument();
  });

  it('shows Remove button after analysis', async () => {
    setupProject();
    await useProjectStore.getState().analyzeMastering();
    render(<MasteringPanel />);

    expect(screen.getByRole('button', { name: 'Remove AI mastering chain' })).toBeInTheDocument();
  });

  it('shows before/after loudness metering sections', async () => {
    setupProject();
    await useProjectStore.getState().analyzeMastering();
    render(<MasteringPanel />);

    expect(screen.getByText('Before')).toBeInTheDocument();
    expect(screen.getByText('After')).toBeInTheDocument();
  });

  it('shows analysis details (dynamics, stereo, tone)', async () => {
    setupProject();
    await useProjectStore.getState().analyzeMastering();
    render(<MasteringPanel />);

    expect(screen.getByText('Dynamics')).toBeInTheDocument();
    expect(screen.getByText('Stereo')).toBeInTheDocument();
    expect(screen.getByText('Tone')).toBeInTheDocument();
  });

  it('changes preset when preset button is clicked', async () => {
    setupProject();
    await useProjectStore.getState().analyzeMastering();
    render(<MasteringPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Use Warm mastering preset' }));
    expect(useProjectStore.getState().project?.mastering?.preset).toBe('warm');
  });

  it('changes loudness target when target button is clicked', async () => {
    setupProject();
    await useProjectStore.getState().analyzeMastering();
    render(<MasteringPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Set mastering loudness target to -8 LUFS' }));
    expect(useProjectStore.getState().project?.mastering?.loudnessTarget).toBe(-8);
  });

  it('toggles A/B preview', async () => {
    setupProject();
    await useProjectStore.getState().analyzeMastering();
    render(<MasteringPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Preview original signal' }));
    expect(useProjectStore.getState().project?.mastering?.previewOriginal).toBe(true);
  });

  it('removes mastering when remove button is clicked', async () => {
    setupProject();
    await useProjectStore.getState().analyzeMastering();
    render(<MasteringPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove AI mastering chain' }));
    const mastering = useProjectStore.getState().project?.mastering;
    expect(mastering?.enabled).toBe(false);
    expect(mastering?.analysis).toBeNull();
  });

  it('shows Re-analyze button after initial analysis', async () => {
    setupProject();
    await useProjectStore.getState().analyzeMastering();
    render(<MasteringPanel />);

    expect(screen.getByRole('button', { name: 'Re-analyze master bus' })).toBeInTheDocument();
  });

  it('shows LUFS values in before/after sections', async () => {
    setupProject();
    await useProjectStore.getState().analyzeMastering();
    render(<MasteringPanel />);

    const lufsTexts = screen.getAllByText(/LUFS/);
    expect(lufsTexts.length).toBeGreaterThanOrEqual(2);
  });

  it('shows progress bar during analysis', () => {
    setupProject();
    render(<MasteringPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Analyze mix for AI mastering' }));
    expect(screen.getByText(/Analyzing loudness, dynamics/)).toBeInTheDocument();
  });
});
