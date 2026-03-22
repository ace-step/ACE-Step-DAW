import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GenerationSidePanel } from '../../src/components/generation/GenerationSidePanel';
import { useUIStore } from '../../src/store/uiStore';
import { useGenerationStore } from '../../src/store/generationStore';
import { useProjectStore } from '../../src/store/projectStore';
import { generateVariationSession } from '../../src/services/generationPipeline';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../src/services/generationPipeline', () => ({
  generateVariationSession: vi.fn(() => Promise.resolve(true)),
  generateBatch: vi.fn(() => Promise.resolve(undefined)),
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
    useProjectStore.getState().addTrack('drums');
    useUIStore.getState().setShowGenerationPanel(true);
    vi.mocked(generateVariationSession).mockClear();
  });

  it('hydrates core generation controls from store-backed project defaults', () => {
    render(<GenerationSidePanel />);

    expect(screen.getByRole('combobox', { name: 'Generation target track' })).toHaveValue(
      useProjectStore.getState().project?.tracks[0].id,
    );
    expect(screen.getByRole('spinbutton', { name: 'Generation BPM' })).toHaveValue(132);
    expect(screen.getByRole('combobox', { name: 'Generation key' })).toHaveValue('D minor');
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
    expect(submittedRequest).toMatchObject({
      prompt: 'cinematic strings with pulsing bass',
      styleTags: ['Ambient'],
      variationCount: 3,
      bpm: 110,
      keyScale: 'G minor',
      duration: 64,
      globalCaption: '',
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

  it('switches between text-to-music, multi-track, and history inside the same side panel', () => {
    render(<GenerationSidePanel />);

    expect(screen.getByRole('button', { name: 'Full Song' })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('generation-panel-tab-multi-track'));
    expect(screen.getByTestId('multi-track-generation-section')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('generation-panel-tab-history'));
    expect(screen.getByTestId('generation-history-section')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('generation-panel-tab-text-to-music'));
    expect(screen.getByRole('combobox', { name: 'Generation target track' })).toBeInTheDocument();
  });

  it('lets users add or remove multi-track rows and choose from the 12 default track roles', () => {
    render(<GenerationSidePanel />);

    fireEvent.click(screen.getByTestId('generation-panel-tab-multi-track'));

    const firstRoleSelect = screen.getByTestId('multi-track-role-select-0');
    expect(within(firstRoleSelect).getAllByRole('option')).toHaveLength(12);

    const beforeCount = screen.getAllByLabelText(/Target track type for row/i).length;
    fireEvent.click(screen.getByTestId('multi-track-add-row'));
    expect(screen.getAllByLabelText(/Target track type for row/i)).toHaveLength(beforeCount + 1);

    const newRoleSelect = screen.getByTestId(`multi-track-role-select-${beforeCount}`);
    fireEvent.change(newRoleSelect, { target: { value: 'vocals' } });
    expect(screen.getAllByText('Lyrics').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByLabelText(`Remove track row ${beforeCount + 1}`));
    expect(screen.getAllByLabelText(/Target track type for row/i)).toHaveLength(beforeCount);
  });
});
