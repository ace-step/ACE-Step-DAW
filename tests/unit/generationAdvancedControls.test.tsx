import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FullSongForm } from '../../src/components/generation/FullSongForm';
import { useGenerationStore } from '../../src/store/generationStore';
import { useProjectStore } from '../../src/store/projectStore';
import { useModelStore } from '../../src/store/modelStore';
import { useUIStore } from '../../src/store/uiStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../src/services/generationPipeline', () => ({
  generateText2Music: vi.fn(() => Promise.resolve()),
  regenerateClip: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../src/services/aceStepApi', () => ({
  formatInput: vi.fn(() => Promise.resolve({ caption: '', lyrics: '' })),
  createRandomSample: vi.fn(() => Promise.resolve({})),
}));

const mockOnFooterChange = vi.fn();

function renderForm() {
  return render(<FullSongForm onFooterChange={mockOnFooterChange} />);
}

describe('Generation Advanced Controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useUIStore.setState(useUIStore.getInitialState(), true);
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useModelStore.setState(useModelStore.getInitialState(), true);

    useProjectStore.getState().createProject({ name: 'Test Project', bpm: 120, keyScale: 'C major' });
    useProjectStore.getState().addTrack('drums');
  });

  describe('Temperature Control', () => {
    it('renders a temperature slider with default value 0.7', () => {
      renderForm();
      const slider = screen.getByTestId('temperature-slider');
      expect(slider).toBeInTheDocument();
      expect(slider).toHaveValue('0.7');
    });

    it('updates generationStore temperature when slider changes', () => {
      renderForm();
      const slider = screen.getByTestId('temperature-slider');
      fireEvent.change(slider, { target: { value: '0.3' } });
      expect(useGenerationStore.getState().generationForm.temperature).toBe(0.3);
    });

    it('displays current temperature value as text', () => {
      renderForm();
      expect(screen.getByTestId('temperature-value')).toHaveTextContent('0.7');
    });

    it('clamps temperature to valid range 0-1', () => {
      renderForm();
      const slider = screen.getByTestId('temperature-slider');
      fireEvent.change(slider, { target: { value: '1.5' } });
      expect(useGenerationStore.getState().generationForm.temperature).toBeLessThanOrEqual(1);
    });

    it('hydrates temperature from store on mount', () => {
      useGenerationStore.getState().setGenerationTemperature(0.4);
      renderForm();
      const slider = screen.getByTestId('temperature-slider');
      expect(slider).toHaveValue('0.4');
    });
  });

  describe('Style Tags Picker', () => {
    it('renders style tags section with predefined tags', () => {
      renderForm();
      const section = screen.getByTestId('style-tags-section');
      expect(section).toBeInTheDocument();
    });

    it('can toggle a style tag on', () => {
      renderForm();
      const tag = screen.getByTestId('style-tag-lo-fi');
      fireEvent.click(tag);
      expect(useGenerationStore.getState().generationForm.styleTags).toContain('lo-fi');
    });

    it('can toggle a style tag off', () => {
      useGenerationStore.getState().setGenerationStyleTags(['lo-fi']);
      renderForm();
      const tag = screen.getByTestId('style-tag-lo-fi');
      fireEvent.click(tag);
      expect(useGenerationStore.getState().generationForm.styleTags).not.toContain('lo-fi');
    });

    it('shows selected tags with active styling and aria-pressed', () => {
      useGenerationStore.getState().setGenerationStyleTags(['ambient']);
      renderForm();
      const tag = screen.getByTestId('style-tag-ambient');
      expect(tag.className).toContain('bg-indigo-600');
      expect(tag).toHaveAttribute('aria-pressed', 'true');
    });

    it('unselected tags have aria-pressed false', () => {
      renderForm();
      const tag = screen.getByTestId('style-tag-ambient');
      expect(tag).toHaveAttribute('aria-pressed', 'false');
    });

    it('limits to MAX 6 style tags', () => {
      useGenerationStore.getState().setGenerationStyleTags([
        'lo-fi', 'ambient', 'jazz', 'house', 'techno', 'trap',
      ]);
      renderForm();
      const tag = screen.getByTestId('style-tag-cinematic');
      fireEvent.click(tag);
      expect(useGenerationStore.getState().generationForm.styleTags).toHaveLength(6);
    });
  });
});
