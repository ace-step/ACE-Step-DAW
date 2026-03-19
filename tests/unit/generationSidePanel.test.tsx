import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GenerationSidePanel } from '../../src/components/generation/GenerationSidePanel';
import { useUIStore } from '../../src/store/uiStore';
import { useGenerationStore } from '../../src/store/generationStore';
import { useProjectStore } from '../../src/store/projectStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('GenerationSidePanel', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState(useUIStore.getInitialState(), true);
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useProjectStore.setState(useProjectStore.getInitialState(), true);

    useProjectStore.getState().createProject({ name: 'AI Panel Test', bpm: 132, keyScale: 'D minor' });
    useProjectStore.getState().addTrack('drums');
    useUIStore.getState().setShowGenerationPanel(true);
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

  it('starts a variation session from the shared store form state', () => {
    render(<GenerationSidePanel />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Generation prompt' }), {
      target: { value: 'cinematic strings with pulsing bass' },
    });
    fireEvent.click(within(screen.getByTestId('generation-style-tags')).getByRole('button', { name: 'Ambient' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Generation variation count' }), {
      target: { value: '3' },
    });

    fireEvent.click(screen.getByTestId('generation-generate-btn'));

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
      bpm: 132,
      keyScale: 'D minor',
      duration: 30,
      globalCaption: '',
    });
    expect(screen.getByTestId('variation-cards')).toBeInTheDocument();
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
});
