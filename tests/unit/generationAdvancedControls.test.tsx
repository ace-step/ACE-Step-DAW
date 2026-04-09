import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FullSongForm } from '../../src/components/generation/FullSongForm';
import { useGenerationStore } from '../../src/store/generationStore';
import { useProjectStore } from '../../src/store/projectStore';
import { useModelStore } from '../../src/store/modelStore';
import { useUIStore } from '../../src/store/uiStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../src/services/generationPipeline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/generationPipeline')>();
  return {
    ...actual,
    generateText2Music: vi.fn(() => Promise.resolve()),
    regenerateClip: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('../../src/services/aceStepApi', () => ({
  formatInput: vi.fn(() => Promise.resolve({ caption: '', lyrics: '' })),
  createRandomSample: vi.fn(() => Promise.resolve({})),
}));

const mockOnFooterChange = vi.fn();

function renderForm() {
  return render(<FullSongForm onFooterChange={mockOnFooterChange} />);
}

describe('Generation Advanced Controls — Style Tags', () => {
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

describe('prependStyleTags helper', () => {
  it('returns prompt unchanged when no tags', async () => {
    const { prependStyleTags } = await import('../../src/services/generationPipeline');
    expect(prependStyleTags('hello world')).toBe('hello world');
    expect(prependStyleTags('hello world', [])).toBe('hello world');
    expect(prependStyleTags('hello world', undefined)).toBe('hello world');
  });

  it('prepends tags with comma-dot format', async () => {
    const { prependStyleTags } = await import('../../src/services/generationPipeline');
    expect(prependStyleTags('describe the music', ['lo-fi', 'ambient']))
      .toBe('lo-fi, ambient. describe the music');
  });

  it('handles single tag', async () => {
    const { prependStyleTags } = await import('../../src/services/generationPipeline');
    expect(prependStyleTags('my prompt', ['jazz']))
      .toBe('jazz. my prompt');
  });

  it('trims whitespace from prompt and tags', async () => {
    const { prependStyleTags } = await import('../../src/services/generationPipeline');
    expect(prependStyleTags('  padded prompt  ', ['  lo-fi  ', '  ambient  ']))
      .toBe('lo-fi, ambient. padded prompt');
  });

  it('filters out empty tags', async () => {
    const { prependStyleTags } = await import('../../src/services/generationPipeline');
    expect(prependStyleTags('prompt', ['lo-fi', '', '  ', 'jazz']))
      .toBe('lo-fi, jazz. prompt');
  });
});
