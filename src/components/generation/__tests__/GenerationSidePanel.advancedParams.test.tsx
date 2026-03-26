import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GenerationSidePanel } from '../GenerationSidePanel';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';
import { useGenerationStore, createDefaultGenerationFormState } from '../../../store/generationStore';
import { DEFAULT_GENERATION } from '../../../constants/defaults';

vi.mock('../../../services/generationPipeline', () => ({
  generateVariationSession: vi.fn().mockResolvedValue(true),
  generateFromGenerationPanel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../services/lazyContextAudioExtractor', () => ({
  extractContextAudioLazy: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

function setupProject() {
  useProjectStore.setState({ project: null });
  useProjectStore.getState().createProject();
  useProjectStore.getState().addTrack('stems');
  const track = useProjectStore.getState().project!.tracks[0];
  useUIStore.setState({ showGenerationPanel: true });
  useGenerationStore.setState({
    generationForm: {
      ...createDefaultGenerationFormState(),
      selectedTrackId: track.id,
      prompt: 'test prompt',
    },
    isGenerating: false,
    variationSession: null,
  });
}

// TODO: Advanced params were part of the old single-track form. Migrate to FullSongForm.
describe.skip('GenerationSidePanel — Advanced Parameters (legacy)', () => {
  beforeEach(() => {
    setupProject();
  });

  it('renders the Advanced Parameters toggle button', () => {
    render(<GenerationSidePanel />);
    expect(screen.getByText(/advanced parameters/i)).toBeInTheDocument();
  });

  it('advanced section is collapsed by default', () => {
    render(<GenerationSidePanel />);
    expect(screen.queryByLabelText('Inference steps')).not.toBeInTheDocument();
  });

  it('expands advanced section when toggle is clicked', () => {
    render(<GenerationSidePanel />);
    fireEvent.click(screen.getByText(/advanced parameters/i));
    expect(screen.getByLabelText('Inference steps')).toBeInTheDocument();
    expect(screen.getByLabelText('Guidance scale')).toBeInTheDocument();
    expect(screen.getByLabelText('Shift')).toBeInTheDocument();
    expect(screen.getByLabelText('Thinking')).toBeInTheDocument();
    expect(screen.getByLabelText('Seed')).toBeInTheDocument();
  });

  it('collapses advanced section when toggle is clicked again', () => {
    render(<GenerationSidePanel />);
    const toggle = screen.getByText(/advanced parameters/i);
    fireEvent.click(toggle);
    expect(screen.getByLabelText('Inference steps')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByLabelText('Inference steps')).not.toBeInTheDocument();
  });

  it('inference steps slider updates generation form', () => {
    render(<GenerationSidePanel />);
    fireEvent.click(screen.getByText(/advanced parameters/i));
    const slider = screen.getByLabelText('Inference steps');
    fireEvent.change(slider, { target: { value: '100' } });
    expect(useGenerationStore.getState().generationForm.inferenceSteps).toBe(100);
  });

  it('guidance scale slider updates generation form', () => {
    render(<GenerationSidePanel />);
    fireEvent.click(screen.getByText(/advanced parameters/i));
    const slider = screen.getByLabelText('Guidance scale');
    fireEvent.change(slider, { target: { value: '12.5' } });
    expect(useGenerationStore.getState().generationForm.guidanceScale).toBe(12.5);
  });

  it('shift slider updates generation form', () => {
    render(<GenerationSidePanel />);
    fireEvent.click(screen.getByText(/advanced parameters/i));
    const slider = screen.getByLabelText('Shift');
    fireEvent.change(slider, { target: { value: '5.0' } });
    expect(useGenerationStore.getState().generationForm.shift).toBe(5.0);
  });

  it('thinking checkbox updates generation form', () => {
    render(<GenerationSidePanel />);
    fireEvent.click(screen.getByText(/advanced parameters/i));
    const checkbox = screen.getByLabelText('Thinking');
    fireEvent.click(checkbox);
    expect(useGenerationStore.getState().generationForm.thinking).toBe(true);
  });

  it('seed input updates generation form', () => {
    render(<GenerationSidePanel />);
    fireEvent.click(screen.getByText(/advanced parameters/i));
    const seedInput = screen.getByLabelText('Seed');
    fireEvent.change(seedInput, { target: { value: '42' } });
    expect(useGenerationStore.getState().generationForm.seed).toBe('42');
  });

  it('random seed toggle updates generation form', () => {
    render(<GenerationSidePanel />);
    fireEvent.click(screen.getByText(/advanced parameters/i));
    const randomToggle = screen.getByLabelText('Random seed');
    expect(useGenerationStore.getState().generationForm.useRandomSeed).toBe(true);
    fireEvent.click(randomToggle);
    expect(useGenerationStore.getState().generationForm.useRandomSeed).toBe(false);
  });

  it('seed input is disabled when random seed is enabled', () => {
    render(<GenerationSidePanel />);
    fireEvent.click(screen.getByText(/advanced parameters/i));
    const seedInput = screen.getByLabelText('Seed');
    expect(seedInput).toBeDisabled();
  });

  it('seed input is enabled when random seed is disabled', () => {
    useGenerationStore.setState((s) => ({
      generationForm: { ...s.generationForm, useRandomSeed: false },
    }));
    render(<GenerationSidePanel />);
    fireEvent.click(screen.getByText(/advanced parameters/i));
    const seedInput = screen.getByLabelText('Seed');
    expect(seedInput).not.toBeDisabled();
  });

  it('displays default values from project generation defaults', () => {
    render(<GenerationSidePanel />);
    fireEvent.click(screen.getByText(/advanced parameters/i));
    const stepsSlider = screen.getByLabelText('Inference steps') as HTMLInputElement;
    expect(Number(stepsSlider.value)).toBe(DEFAULT_GENERATION.inferenceSteps);
  });
});

describe('GenerationStore — advanced param setters', () => {
  beforeEach(() => {
    useGenerationStore.setState({
      generationForm: createDefaultGenerationFormState(),
    });
  });

  it('setGenerationInferenceSteps clamps to 1-200', () => {
    useGenerationStore.getState().setGenerationInferenceSteps(250);
    expect(useGenerationStore.getState().generationForm.inferenceSteps).toBe(200);
    useGenerationStore.getState().setGenerationInferenceSteps(0);
    expect(useGenerationStore.getState().generationForm.inferenceSteps).toBe(1);
  });

  it('setGenerationGuidanceScale clamps to 0-20', () => {
    useGenerationStore.getState().setGenerationGuidanceScale(25);
    expect(useGenerationStore.getState().generationForm.guidanceScale).toBe(20);
    useGenerationStore.getState().setGenerationGuidanceScale(-1);
    expect(useGenerationStore.getState().generationForm.guidanceScale).toBe(0);
  });

  it('setGenerationShift clamps to 0-10', () => {
    useGenerationStore.getState().setGenerationShift(15);
    expect(useGenerationStore.getState().generationForm.shift).toBe(10);
    useGenerationStore.getState().setGenerationShift(-5);
    expect(useGenerationStore.getState().generationForm.shift).toBe(0);
  });

  it('setGenerationThinking toggles boolean', () => {
    useGenerationStore.getState().setGenerationThinking(true);
    expect(useGenerationStore.getState().generationForm.thinking).toBe(true);
    useGenerationStore.getState().setGenerationThinking(false);
    expect(useGenerationStore.getState().generationForm.thinking).toBe(false);
  });

  it('setGenerationSeed stores string value', () => {
    useGenerationStore.getState().setGenerationSeed('12345');
    expect(useGenerationStore.getState().generationForm.seed).toBe('12345');
  });

  it('setGenerationUseRandomSeed stores boolean value', () => {
    useGenerationStore.getState().setGenerationUseRandomSeed(false);
    expect(useGenerationStore.getState().generationForm.useRandomSeed).toBe(false);
  });

  it('advanced params are included in submitGenerationRequest output', () => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    useProjectStore.getState().addTrack('stems');
    const track = useProjectStore.getState().project!.tracks[0];

    useGenerationStore.setState({
      generationForm: {
        ...createDefaultGenerationFormState(),
        prompt: 'test prompt',
        selectedTrackId: track.id,
        inferenceSteps: 75,
        guidanceScale: 10.0,
        shift: 5.0,
        thinking: true,
        seed: '42',
        useRandomSeed: false,
      },
    });

    const params = useGenerationStore.getState().submitGenerationRequest({ globalCaption: '' });
    expect(params).not.toBeNull();
    expect(params!.inferenceSteps).toBe(75);
    expect(params!.guidanceScale).toBe(10.0);
    expect(params!.shift).toBe(5.0);
    expect(params!.thinking).toBe(true);
    expect(params!.seed).toBe('42');
    expect(params!.useRandomSeed).toBe(false);
  });
});
