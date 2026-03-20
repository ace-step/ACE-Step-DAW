import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GenerationSidePanel } from '../../src/components/generation/GenerationSidePanel';
import { useGenerationStore } from '../../src/store/generationStore';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

describe('GenerationSidePanel', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState(useUIStore.getInitialState(), true);
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useProjectStore.setState(useProjectStore.getInitialState(), true);

    const projectStore = useProjectStore.getState();
    projectStore.createProject({ name: 'Generation Panel Test' });
    const track = projectStore.addTrack('custom', 'stems');
    projectStore.updateTrack(track.id, { displayName: 'Idea Track' });

    useUIStore.getState().setShowGenerationPanel(true);
  });

  it('shows actionable validation, syncs UI changes into the store, and starts generation', () => {
    render(<GenerationSidePanel />);

    expect(screen.getByText('Add a prompt that describes the material you want to generate.')).toBeInTheDocument();
    expect(screen.getByLabelText('Generation target track')).toHaveValue(
      useProjectStore.getState().project?.tracks.find((track) => track.trackType === 'stems')?.id ?? '',
    );

    fireEvent.change(screen.getByLabelText('Generation prompt'), {
      target: { value: 'Dusty lo-fi beat with soft piano chords' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Lo-Fi' }).find(
      (btn) => btn.getAttribute('aria-pressed') !== null,
    )!);
    fireEvent.change(screen.getByLabelText('Generation BPM'), { target: { value: '88' } });
    fireEvent.change(screen.getByLabelText('Generation key'), { target: { value: 'D minor' } });
    fireEvent.change(screen.getByLabelText('Generation length'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('Generation temperature'), { target: { value: '0.9' } });
    fireEvent.change(screen.getByLabelText('Generation variation count'), { target: { value: '3' } });

    const form = useGenerationStore.getState().generationForm;
    expect(form).toMatchObject({
      prompt: 'Dusty lo-fi beat with soft piano chords',
      bpm: 88,
      keyScale: 'D minor',
      lengthSeconds: 45,
      temperature: 0.9,
      variationCount: 3,
      styleTags: ['Lo-Fi'],
    });

    const generateButton = screen.getByRole('button', { name: 'Generate 3 Variations' });
    expect(generateButton).toBeEnabled();

    fireEvent.click(generateButton);

    expect(useGenerationStore.getState().variationSession?.params).toMatchObject({
      prompt: 'Dusty lo-fi beat with soft piano chords',
      trackId: useProjectStore.getState().project?.tracks.find((track) => track.trackType === 'stems')?.id,
      bpm: 88,
      keyScale: 'D minor',
      duration: 45,
      guidanceScale: 7.0,
      temperature: 0.9,
      styleTags: ['Lo-Fi'],
      variationCount: 3,
    });
    expect(screen.getByRole('button', { name: 'Generating...' })).toBeDisabled();
  });

  it('renders actionable request errors from the store', () => {
    render(<GenerationSidePanel />);

    act(() => {
      useGenerationStore.getState().setGenerationRequestError(
        'Generation failed. Add more detail to the prompt or reduce the variation count.',
      );
    });

    expect(
      screen.getByRole('status'),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Generation failed. Add more detail to the prompt or reduce the variation count.',
    );
  });
});
