import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FullSongForm } from '../../src/components/generation/FullSongForm';
import { useGenerationStore } from '../../src/store/generationStore';
import { useProjectStore } from '../../src/store/projectStore';
import { useModelStore } from '../../src/store/modelStore';
import { useUIStore } from '../../src/store/uiStore';
import { useVoiceStore } from '../../src/store/voiceStore';

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
    useVoiceStore.setState(useVoiceStore.getInitialState(), true);

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
    expect(tag).toHaveAttribute('aria-label', 'Remove ambient style tag');
  });

  it('unselected tags have aria-pressed false', () => {
    renderForm();
    const tag = screen.getByTestId('style-tag-ambient');
    expect(tag).toHaveAttribute('aria-pressed', 'false');
    expect(tag).toHaveAttribute('aria-label', 'Add ambient style tag');
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

  it('renders the temperature slider with the default value', () => {
    renderForm();
    expect(screen.getByTestId('full-song-temperature')).toHaveValue('0.7');
    expect(screen.getByText('0.7')).toBeInTheDocument();
  });

  it('updates generation temperature from the slider', () => {
    renderForm();
    fireEvent.change(screen.getByTestId('full-song-temperature'), { target: { value: '0.9' } });
    expect(useGenerationStore.getState().generationForm.temperature).toBe(0.9);
    expect(screen.getByText('0.9')).toBeInTheDocument();
  });

  it('preserves legacy guidanceScale when regenerating older clips', async () => {
    useGenerationStore.getState().setGenerationTemperature(0.2);
    const track = useProjectStore.getState().project!.tracks[0];
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 30,
      prompt: 'legacy prompt',
      lyrics: 'legacy lyrics',
      source: 'generated',
    });
    useProjectStore.getState().updateClip(clip.id, {
      generationParams: {
        type: 'text2music',
        prompt: 'legacy prompt',
        lyrics: 'legacy lyrics',
        durationSeconds: 30,
        guidanceScale: 7,
      },
    });
    useUIStore.getState().setEditingText2MusicClipId(clip.id);

    renderForm();

    await waitFor(() => {
      expect(mockOnFooterChange.mock.calls.at(-1)?.[0].disabled).toBe(false);
    });
    expect(screen.getByTestId('full-song-temperature')).toHaveValue('0.7');
    mockOnFooterChange.mock.calls.at(-1)?.[0].action();

    const updatedClip = useProjectStore.getState().project!.tracks[0].clips.find((item) => item.id === clip.id);
    expect(updatedClip?.generationParams?.guidanceScale).toBe(7);
    expect(updatedClip?.generationParams?.temperature).toBeUndefined();
  });

  it('clears stale style tags when hydrating legacy clips without generationParams', async () => {
    useGenerationStore.getState().setGenerationStyleTags(['lo-fi']);
    useGenerationStore.getState().setGenerationTemperature(0.2);
    const track = useProjectStore.getState().project!.tracks[0];
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 30,
      prompt: 'legacy prompt',
      lyrics: 'legacy lyrics',
      source: 'generated',
    });
    useUIStore.getState().setEditingText2MusicClipId(clip.id);

    renderForm();

    await waitFor(() => {
      expect(useGenerationStore.getState().generationForm.styleTags).toEqual([]);
    });
    expect(useGenerationStore.getState().generationForm.temperature).toBe(0.7);
  });

  it('preserves saved voice params when regenerating an edited clip', async () => {
    useVoiceStore.setState({
      voices: [{
        id: 'saved-voice',
        name: 'Saved Voice',
        createdAt: 1,
        updatedAt: 1,
        audioKey: 'voice-audio:saved',
        durationSeconds: 12,
        skillLevel: 'professional',
        tags: [],
        defaultAudioInfluence: 20,
        defaultStyleInfluence: 80,
        source: 'upload',
      }],
      selectedVoiceId: null,
      searchQuery: '',
      filterTag: null,
    });
    const track = useProjectStore.getState().project!.tracks[0];
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 30,
      prompt: 'voice prompt',
      lyrics: 'voice lyrics',
      source: 'generated',
    });
    useProjectStore.getState().updateClip(clip.id, {
      generationParams: {
        type: 'text2music',
        prompt: 'voice prompt',
        lyrics: 'voice lyrics',
        durationSeconds: 30,
        voiceProfileId: 'saved-voice',
        audioInfluence: 70,
        styleInfluence: 30,
      },
    });
    useUIStore.getState().setEditingText2MusicClipId(clip.id);

    renderForm();

    await waitFor(() => {
      expect(useVoiceStore.getState().selectedVoiceId).toBe('saved-voice');
    });
    mockOnFooterChange.mock.calls.at(-1)?.[0].action();

    const updatedClip = useProjectStore.getState().project!.tracks[0].clips.find((item) => item.id === clip.id);
    expect(updatedClip?.generationParams?.voiceProfileId).toBe('saved-voice');
    expect(updatedClip?.generationParams?.audioInfluence).toBe(70);
    expect(updatedClip?.generationParams?.styleInfluence).toBe(30);
    const voice = useVoiceStore.getState().getVoiceById('saved-voice');
    expect(voice?.defaultAudioInfluence).toBe(20);
    expect(voice?.defaultStyleInfluence).toBe(80);
  });

  it('does not use stale selected voice when the edited clip voice is missing', async () => {
    useVoiceStore.setState({
      voices: [{
        id: 'stale-voice',
        name: 'Stale Voice',
        createdAt: 1,
        updatedAt: 1,
        audioKey: 'voice-audio:stale',
        durationSeconds: 12,
        skillLevel: 'professional',
        tags: [],
        defaultAudioInfluence: 95,
        defaultStyleInfluence: 95,
        source: 'upload',
      }],
      selectedVoiceId: 'stale-voice',
      searchQuery: '',
      filterTag: null,
    });
    const track = useProjectStore.getState().project!.tracks[0];
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 30,
      prompt: 'missing voice prompt',
      lyrics: 'missing voice lyrics',
      source: 'generated',
    });
    useProjectStore.getState().updateClip(clip.id, {
      generationParams: {
        type: 'text2music',
        prompt: 'missing voice prompt',
        lyrics: 'missing voice lyrics',
        durationSeconds: 30,
        voiceProfileId: 'missing-voice',
        audioInfluence: 70,
        styleInfluence: 30,
      },
    });
    useUIStore.getState().setEditingText2MusicClipId(clip.id);

    renderForm();

    await waitFor(() => {
      expect(useVoiceStore.getState().selectedVoiceId).toBeNull();
    });
    mockOnFooterChange.mock.calls.at(-1)?.[0].action();

    const updatedClip = useProjectStore.getState().project!.tracks[0].clips.find((item) => item.id === clip.id);
    expect(updatedClip?.generationParams?.voiceProfileId).toBe('missing-voice');
    expect(updatedClip?.generationParams?.audioInfluence).toBe(70);
    expect(updatedClip?.generationParams?.styleInfluence).toBe(30);
  });

  it('clears stale selected voice when the edited clip has no saved voice', async () => {
    useVoiceStore.setState({
      voices: [{
        id: 'stale-voice',
        name: 'Stale Voice',
        createdAt: 1,
        updatedAt: 1,
        audioKey: 'voice-audio:stale',
        durationSeconds: 12,
        skillLevel: 'professional',
        tags: [],
        defaultAudioInfluence: 95,
        defaultStyleInfluence: 95,
        source: 'upload',
      }],
      selectedVoiceId: 'stale-voice',
      searchQuery: '',
      filterTag: null,
    });
    const track = useProjectStore.getState().project!.tracks[0];
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 30,
      prompt: 'plain prompt',
      lyrics: 'plain lyrics',
      source: 'generated',
    });
    useProjectStore.getState().updateClip(clip.id, {
      generationParams: {
        type: 'text2music',
        prompt: 'plain prompt',
        lyrics: 'plain lyrics',
        durationSeconds: 30,
      },
    });
    useUIStore.getState().setEditingText2MusicClipId(clip.id);

    renderForm();

    await waitFor(() => {
      expect(useVoiceStore.getState().selectedVoiceId).toBeNull();
    });
    mockOnFooterChange.mock.calls.at(-1)?.[0].action();

    const updatedClip = useProjectStore.getState().project!.tracks[0].clips.find((item) => item.id === clip.id);
    expect(updatedClip?.generationParams?.voiceProfileId).toBeUndefined();
    expect(updatedClip?.generationParams?.audioInfluence).toBeUndefined();
    expect(updatedClip?.generationParams?.styleInfluence).toBeUndefined();
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

  it('does not duplicate an existing style-tag prefix', async () => {
    const { prependStyleTags } = await import('../../src/services/generationPipeline');
    expect(prependStyleTags('lo-fi, ambient. padded prompt', ['lo-fi', 'ambient']))
      .toBe('lo-fi, ambient. padded prompt');
  });
});
