import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { useVoiceStore } from '../../../store/voiceStore';
import { VoiceLibraryPanel } from '../VoiceLibraryPanel';
import type { VoiceProfile } from '../../../types/voice';

vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  keys: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../hooks/useToast', () => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
}));

function makeVoice(overrides: Partial<VoiceProfile> = {}): VoiceProfile {
  return {
    id: 'v1',
    name: 'Test Voice',
    createdAt: 1000,
    updatedAt: 1000,
    audioKey: 'voice-audio:v1',
    durationSeconds: 45,
    skillLevel: 'intermediate',
    tags: [],
    defaultAudioInfluence: 50,
    defaultStyleInfluence: 50,
    source: 'upload',
    ...overrides,
  };
}

describe('VoiceLibraryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useVoiceStore.setState({
      voices: [],
      selectedVoiceId: null,
      searchQuery: '',
      filterTag: null,
    });
  });

  it('renders empty state when no voices exist', () => {
    render(<VoiceLibraryPanel />);
    expect(screen.getByTestId('voice-empty-state')).toBeInTheDocument();
    expect(screen.getByText(/No voices yet/)).toBeInTheDocument();
  });

  it('renders voice cards when voices exist', () => {
    useVoiceStore.setState({
      voices: [
        makeVoice({ id: 'v1', name: 'Rock Voice' }),
        makeVoice({ id: 'v2', name: 'Jazz Voice' }),
      ],
    });
    render(<VoiceLibraryPanel />);
    expect(screen.getByTestId('voice-card-v1')).toBeInTheDocument();
    expect(screen.getByTestId('voice-card-v2')).toBeInTheDocument();
    expect(screen.getByText('Rock Voice')).toBeInTheDocument();
    expect(screen.getByText('Jazz Voice')).toBeInTheDocument();
  });

  it('shows voice count in header', () => {
    useVoiceStore.setState({
      voices: [makeVoice({ id: 'v1' }), makeVoice({ id: 'v2' })],
    });
    render(<VoiceLibraryPanel />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('filters voices by search query', () => {
    useVoiceStore.setState({
      voices: [
        makeVoice({ id: 'v1', name: 'Rock Voice' }),
        makeVoice({ id: 'v2', name: 'Jazz Voice' }),
      ],
    });
    render(<VoiceLibraryPanel />);

    const searchInput = screen.getByTestId('voice-search-input');
    fireEvent.change(searchInput, { target: { value: 'rock' } });

    // After search, only Rock Voice should be visible via the store
    const state = useVoiceStore.getState();
    expect(state.searchQuery).toBe('rock');
  });

  it('collapses and expands the panel', () => {
    render(<VoiceLibraryPanel />);
    const toggle = screen.getByTestId('voice-library-toggle');

    // Initially expanded — empty state should be visible
    expect(screen.getByTestId('voice-empty-state')).toBeInTheDocument();

    // Collapse
    fireEvent.click(toggle);
    expect(screen.queryByTestId('voice-empty-state')).not.toBeInTheDocument();

    // Expand again
    fireEvent.click(toggle);
    expect(screen.getByTestId('voice-empty-state')).toBeInTheDocument();
  });

  it('selects and deselects a voice card', () => {
    useVoiceStore.setState({
      voices: [makeVoice({ id: 'v1', name: 'Rock Voice' })],
    });
    render(<VoiceLibraryPanel />);

    const card = screen.getByTestId('voice-card-v1');

    // Select
    fireEvent.click(card);
    expect(useVoiceStore.getState().selectedVoiceId).toBe('v1');

    // Deselect
    fireEvent.click(card);
    expect(useVoiceStore.getState().selectedVoiceId).toBeNull();
  });

  it('renders tag filter chips when voices have tags', () => {
    useVoiceStore.setState({
      voices: [
        makeVoice({ id: 'v1', tags: ['rock', 'energetic'] }),
        makeVoice({ id: 'v2', tags: ['jazz'] }),
      ],
    });
    render(<VoiceLibraryPanel />);

    expect(screen.getByTestId('voice-tag-all')).toBeInTheDocument();
    expect(screen.getByTestId('voice-tag-rock')).toBeInTheDocument();
    expect(screen.getByTestId('voice-tag-jazz')).toBeInTheDocument();
    expect(screen.getByTestId('voice-tag-energetic')).toBeInTheDocument();
  });

  it('filters by tag when a tag chip is clicked', () => {
    useVoiceStore.setState({
      voices: [
        makeVoice({ id: 'v1', tags: ['rock'] }),
        makeVoice({ id: 'v2', tags: ['jazz'] }),
      ],
    });
    render(<VoiceLibraryPanel />);

    fireEvent.click(screen.getByTestId('voice-tag-rock'));
    expect(useVoiceStore.getState().filterTag).toBe('rock');

    // Click again to clear
    fireEvent.click(screen.getByTestId('voice-tag-rock'));
    expect(useVoiceStore.getState().filterTag).toBeNull();
  });

  it('has an upload button', () => {
    render(<VoiceLibraryPanel />);
    expect(screen.getByTestId('voice-upload-btn')).toBeInTheDocument();
  });
});
