import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GenerationSidePanel } from '../../src/components/generation/GenerationSidePanel';
import { useUIStore } from '../../src/store/uiStore';
import { useGenerationStore } from '../../src/store/generationStore';
import { useProjectStore } from '../../src/store/projectStore';
import { generateVariationSession } from '../../src/services/generationPipeline';
import { listModels } from '../../src/services/aceStepApi';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../src/services/generationPipeline', () => ({
  generateVariationSession: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../../src/services/aceStepApi', () => ({
  listModels: vi.fn(() => Promise.resolve({
    models: [
      { name: 'ace-step-base', is_default: true, is_loaded: true },
      { name: 'ace-step-turbo', is_default: false, is_loaded: false },
    ],
    default_model: 'ace-step-base',
    lm_models: [],
    loaded_lm_model: null,
    llm_initialized: false,
  })),
}));

describe('GenerationSidePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.clearAllMocks();
    useUIStore.setState(useUIStore.getInitialState(), true);
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useProjectStore.setState(useProjectStore.getInitialState(), true);

    useProjectStore.getState().createProject({ name: 'AI Panel Test', bpm: 132, keyScale: 'D minor' });
    useProjectStore.setState((state) => ({
      project: state.project
        ? {
            ...state.project,
            generationDefaults: {
              ...state.project.generationDefaults,
              inferenceSteps: 48,
              guidanceScale: 8.5,
              shift: 2.5,
              thinking: true,
              model: 'ace-step-turbo',
            },
          }
        : state.project,
    }));
    useProjectStore.getState().addTrack('drums');
    useUIStore.getState().setShowGenerationPanel(true);
    vi.mocked(generateVariationSession).mockClear();
    vi.mocked(listModels).mockClear();
  });

  it('hydrates core generation controls from store-backed project defaults', () => {
    render(<GenerationSidePanel />);

    expect(screen.getByRole('combobox', { name: 'Generation target track' })).toHaveValue(
      useProjectStore.getState().project?.tracks[0].id,
    );
    expect(screen.getByRole('spinbutton', { name: 'Generation BPM' })).toHaveValue(132);
    expect(screen.getByRole('combobox', { name: 'Generation key' })).toHaveValue('D minor');
  });

  it('hydrates advanced generation overrides from project defaults without mutating the project defaults', async () => {
    render(<GenerationSidePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Show advanced parameters' }));

    expect(screen.getByRole('slider', { name: 'Inference steps' })).toHaveValue('48');
    expect(screen.getByRole('slider', { name: 'Guidance scale' })).toHaveValue('8.5');
    expect(screen.getByRole('slider', { name: 'Shift' })).toHaveValue('2.5');
    expect(screen.getByRole('checkbox', { name: 'Thinking mode' })).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'Seed' })).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: 'Random seed' })).toBeChecked();
    expect(screen.getByTestId('generation-model-summary')).toHaveTextContent('ace-step-turbo');

    fireEvent.change(screen.getByRole('slider', { name: 'Inference steps' }), { target: { value: '96' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Guidance scale' }), { target: { value: '12.5' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Shift' }), { target: { value: '4.5' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Thinking mode' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Random seed' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Seed' }), { target: { value: '4242' } });
    fireEvent.click(screen.getByRole('button', { name: 'Switch model' }));

    await waitFor(() => {
      expect(listModels).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'Generation model' }), {
      target: { value: 'ace-step-base' },
    });

    const form = useGenerationStore.getState().generationForm;
    expect(form.inferenceSteps).toBe(96);
    expect(form.guidanceScale).toBe(12.5);
    expect(form.shift).toBe(4.5);
    expect(form.thinking).toBe(false);
    expect(form.seed).toBe('4242');
    expect(form.useRandomSeed).toBe(false);
    expect(form.model).toBe('ace-step-base');

    expect(useProjectStore.getState().project?.generationDefaults).toMatchObject({
      inferenceSteps: 48,
      guidanceScale: 8.5,
      shift: 2.5,
      thinking: true,
      model: 'ace-step-turbo',
    });
  });

  it('persists prompt, style tags, key, bpm, length, temperature, and variation count through the store', () => {
    render(<GenerationSidePanel />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Generation prompt' }), {
      target: { value: 'warm synthwave with gated drums' },
    });
    fireEvent.click(within(screen.getByTestId('generation-style-tags')).getByRole('button', { name: 'Electronic' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Generation BPM' }), {
      target: { value: '118' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Generation key' }), {
      target: { value: 'A minor' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Generation length' }), {
      target: { value: '45' },
    });
    fireEvent.change(screen.getByRole('slider', { name: 'Generation temperature' }), {
      target: { value: '0.35' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Generation variation count' }), {
      target: { value: '4' },
    });

    const form = useGenerationStore.getState().generationForm;
    expect(form.prompt).toBe('warm synthwave with gated drums');
    expect(form.styleTags).toEqual(['Electronic']);
    expect(form.bpm).toBe(118);
    expect(form.keyScale).toBe('A minor');
    expect(form.lengthSeconds).toBe(45);
    expect(form.temperature).toBe(0.35);
    expect(form.variationCount).toBe(4);
  });

  it('shows actionable validation when the prompt is missing and disables submit', () => {
    render(<GenerationSidePanel />);

    const generateButton = screen.getByTestId('generation-generate-btn');
    expect(generateButton).toBeDisabled();

    fireEvent.click(generateButton);

    expect(screen.getByTestId('generation-panel-message')).toHaveTextContent(
      'Add a prompt that describes the material you want to generate.',
    );
  });

  it('submits selected generation parameters through the generation pipeline', async () => {
    render(<GenerationSidePanel />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Generation prompt' }), {
      target: { value: 'cinematic strings with pulsing bass' },
    });
    fireEvent.click(within(screen.getByTestId('generation-style-tags')).getByRole('button', { name: 'Ambient' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Generation BPM' }), {
      target: { value: '110' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Generation key' }), {
      target: { value: 'G minor' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Generation length' }), {
      target: { value: '64' },
    });
    fireEvent.change(screen.getByRole('slider', { name: 'Generation temperature' }), {
      target: { value: '0.55' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Generation variation count' }), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show advanced parameters' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Inference steps' }), {
      target: { value: '120' },
    });
    fireEvent.change(screen.getByRole('slider', { name: 'Guidance scale' }), {
      target: { value: '14.5' },
    });
    fireEvent.change(screen.getByRole('slider', { name: 'Shift' }), {
      target: { value: '6' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Random seed' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Seed' }), {
      target: { value: '12345' },
    });

    fireEvent.click(screen.getByTestId('generation-generate-btn'));

    await waitFor(() => {
      expect(generateVariationSession).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'cinematic strings with pulsing bass',
          trackId: useProjectStore.getState().project?.tracks[0].id,
          styleTags: ['Ambient'],
          bpm: 110,
          keyScale: 'G minor',
          duration: 64,
          temperature: 0.55,
          variationCount: 3,
          inferenceSteps: 120,
          guidanceScale: 14.5,
          shift: 6,
          thinking: true,
          model: 'ace-step-turbo',
          seed: '12345',
          useRandomSeed: false,
        }),
      );
    });

    const session = useGenerationStore.getState().variationSession;
    const submittedRequest = useGenerationStore.getState().lastSubmittedRequest;
    expect(session).not.toBeNull();
    expect(submittedRequest).not.toBeNull();
    expect(session?.params.prompt).toBe('cinematic strings with pulsing bass');
    expect(session?.params.styleTags).toEqual(['Ambient']);
    expect(session?.params.variationCount).toBe(3);
    expect(session?.params.inferenceSteps).toBe(120);
    expect(session?.params.guidanceScale).toBe(14.5);
    expect(session?.params.shift).toBe(6);
    expect(session?.params.seed).toBe('12345');
    expect(session?.params.useRandomSeed).toBe(false);
    expect(session?.params.model).toBe('ace-step-turbo');
    expect(submittedRequest).toMatchObject({
      prompt: 'cinematic strings with pulsing bass',
      styleTags: ['Ambient'],
      variationCount: 3,
      bpm: 110,
      keyScale: 'G minor',
      duration: 64,
      globalCaption: '',
      inferenceSteps: 120,
      guidanceScale: 14.5,
      shift: 6,
      thinking: true,
      model: 'ace-step-turbo',
      seed: '12345',
      useRandomSeed: false,
    });
    expect(screen.getByTestId('variation-cards')).toBeInTheDocument();
    expect(generateVariationSession).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'cinematic strings with pulsing bass',
      variationCount: 3,
    }));
  });

  it('surfaces variation errors as actionable feedback', () => {
    useGenerationStore.getState().startVariationSession({
      prompt: 'test',
      trackId: 'track-1',
      variationCount: 2,
      bpm: 120,
      keyScale: 'C major',
      duration: 30,
      guidanceScale: 0.7,
      temperature: 0.7,
    });
    useGenerationStore.getState().updateVariation(0, {
      status: 'error',
      error: 'Generation failed: choose a shorter length or lower the variation count.',
    });

    render(<GenerationSidePanel />);

    expect(screen.getByTestId('generation-panel-message')).toHaveTextContent(
      'Generation failed: choose a shorter length or lower the variation count.',
    );
  });

  it('shows live backend stage progress and ETA when confidence is high enough', () => {
    useGenerationStore.getState().addJob({
      id: 'job-1',
      clipId: 'clip-1',
      trackName: 'Drums',
      status: 'generating',
      progress: 'Diffusion pass 42%',
      stage: 'Diffusion pass',
      progressPercent: 42,
      etaSeconds: 18,
      etaConfidence: 'high',
    });

    render(<GenerationSidePanel />);

    expect(screen.getByTestId('generation-live-jobs')).toHaveTextContent('Live Progress');
    expect(screen.getByTestId('generation-job-job-1')).toHaveTextContent('Drums');
    expect(screen.getByTestId('generation-job-job-1')).toHaveTextContent('Diffusion pass');
    expect(screen.getByTestId('generation-job-job-1')).toHaveTextContent('42%');
    expect(screen.getByTestId('generation-job-job-1')).toHaveTextContent('ETA: ~18s');
  });

  it('falls back to stage-only messaging when ETA confidence is low', () => {
    useGenerationStore.getState().addJob({
      id: 'job-2',
      clipId: 'clip-2',
      trackName: 'Bass',
      status: 'generating',
      progress: 'Prompt analysis 8%',
      stage: 'Prompt analysis',
      progressPercent: 8,
      etaSeconds: null,
      etaConfidence: 'low',
    });

    render(<GenerationSidePanel />);

    expect(screen.getByTestId('generation-job-job-2')).toHaveTextContent('Prompt analysis');
    expect(screen.getByTestId('generation-job-job-2')).toHaveTextContent('ETA pending');
    expect(screen.getByTestId('generation-job-job-2')).not.toHaveTextContent('ETA:');
  });

  it('shows accessible autocomplete suggestions and applies the highlighted option from the keyboard', () => {
    render(<GenerationSidePanel />);

    const promptInput = screen.getByRole('combobox', { name: 'Generation prompt' });
    fireEvent.change(promptInput, { target: { value: 'lof' } });
    fireEvent.keyDown(promptInput, { key: 'ArrowDown' });
    fireEvent.keyDown(promptInput, { key: 'Enter' });

    expect(screen.getByRole('combobox', { name: 'Generation prompt' })).toHaveValue('lo-fi ');
    expect(screen.queryByRole('listbox', { name: 'Prompt autocomplete suggestions' })).not.toBeInTheDocument();
  });

  it('supports mouse selection from autocomplete suggestions', () => {
    render(<GenerationSidePanel />);

    const promptInput = screen.getByRole('combobox', { name: 'Generation prompt' });
    fireEvent.change(promptInput, { target: { value: 'warm ana' } });

    fireEvent.click(screen.getByRole('option', { name: 'analog technique' }));

    expect(screen.getByRole('combobox', { name: 'Generation prompt' })).toHaveValue('warm analog ');
  });

  it('does not open autocomplete while IME composition is active', () => {
    render(<GenerationSidePanel />);

    const promptInput = screen.getByRole('combobox', { name: 'Generation prompt' });
    fireEvent.compositionStart(promptInput);
    fireEvent.change(promptInput, { target: { value: 'lof' } });

    expect(screen.queryByRole('listbox', { name: 'Prompt autocomplete suggestions' })).not.toBeInTheDocument();

    fireEvent.compositionEnd(promptInput);
    fireEvent.change(promptInput, { target: { value: 'lof' } });

    expect(screen.getByRole('listbox', { name: 'Prompt autocomplete suggestions' })).toBeInTheDocument();
  });
});
