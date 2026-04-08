import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceLibrarySection } from '../VoiceLibrarySection';
import { useVoiceStore } from '../../../store/voiceStore';
import type { VoiceProfile } from '../../../types/voiceProfile';

vi.mock('../../../services/audioFileManager', () => ({
  storeAudioBlob: vi.fn().mockResolvedValue('mock-key'),
  loadAudioBlobByKey: vi.fn().mockResolvedValue(new Blob()),
  deleteAudioBlobByKey: vi.fn().mockResolvedValue(undefined),
}));

const MOCK_VOICE: VoiceProfile = {
  id: 'voice-1',
  name: 'Test Voice',
  createdAt: 1000,
  updatedAt: 1000,
  audioKey: 'audio-key-1',
  duration: 95,
  skillLevel: 'intermediate',
  language: 'English',
  tags: ['pop', 'female'],
  audioInfluence: 0.5,
  styleInfluence: 0.5,
};

const MOCK_VOICE_2: VoiceProfile = {
  ...MOCK_VOICE,
  id: 'voice-2',
  name: 'Jazz Singer',
  tags: ['jazz'],
  language: 'French',
  duration: 120,
};

function resetStore() {
  useVoiceStore.setState({
    voices: [],
    selectedVoiceId: null,
    searchQuery: '',
    isCreating: false,
    createError: null,
    previewingVoiceId: null,
  });
}

describe('VoiceLibrarySection', () => {
  beforeEach(() => {
    resetStore();
  });

  it('renders collapsed by default', () => {
    render(<VoiceLibrarySection />);
    expect(screen.getByTestId('voice-library-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('voice-library-content')).not.toBeInTheDocument();
  });

  it('expands when toggle is clicked', () => {
    render(<VoiceLibrarySection />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));
    expect(screen.getByTestId('voice-library-content')).toBeInTheDocument();
  });

  it('shows voice count badge when voices exist', () => {
    useVoiceStore.setState({ voices: [MOCK_VOICE, MOCK_VOICE_2] });
    render(<VoiceLibrarySection />);
    expect(screen.getByText('2 voices')).toBeInTheDocument();
  });

  it('shows singular "voice" for single voice', () => {
    useVoiceStore.setState({ voices: [MOCK_VOICE] });
    render(<VoiceLibrarySection />);
    expect(screen.getByText('1 voice')).toBeInTheDocument();
  });

  it('shows active badge when a voice is selected and collapsed', () => {
    useVoiceStore.setState({ voices: [MOCK_VOICE], selectedVoiceId: 'voice-1' });
    render(<VoiceLibrarySection />);
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('shows empty state when no voices exist', () => {
    render(<VoiceLibrarySection />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));
    expect(screen.getByTestId('voice-library-empty')).toBeInTheDocument();
    expect(screen.getByText(/No voice profiles yet/)).toBeInTheDocument();
  });

  it('renders voice cards when voices exist', () => {
    useVoiceStore.setState({ voices: [MOCK_VOICE, MOCK_VOICE_2] });
    render(<VoiceLibrarySection />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));
    expect(screen.getByTestId('voice-card-voice-1')).toBeInTheDocument();
    expect(screen.getByTestId('voice-card-voice-2')).toBeInTheDocument();
  });

  it('displays voice name and metadata on card', () => {
    useVoiceStore.setState({ voices: [MOCK_VOICE] });
    render(<VoiceLibrarySection />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));
    expect(screen.getByText('Test Voice')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('1:35')).toBeInTheDocument();
  });

  it('toggles selection when clicking a voice card', () => {
    useVoiceStore.setState({ voices: [MOCK_VOICE] });
    render(<VoiceLibrarySection />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));
    fireEvent.click(screen.getByTestId('voice-card-voice-1'));
    expect(useVoiceStore.getState().selectedVoiceId).toBe('voice-1');

    // Click again to deselect
    fireEvent.click(screen.getByTestId('voice-card-voice-1'));
    expect(useVoiceStore.getState().selectedVoiceId).toBeNull();
  });

  it('filters voices by search query', () => {
    useVoiceStore.setState({ voices: [MOCK_VOICE, MOCK_VOICE_2] });
    render(<VoiceLibrarySection />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));
    fireEvent.change(screen.getByTestId('voice-library-search'), {
      target: { value: 'jazz' },
    });
    expect(screen.queryByTestId('voice-card-voice-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('voice-card-voice-2')).toBeInTheDocument();
  });

  it('shows no-match message when search filters all voices', () => {
    useVoiceStore.setState({ voices: [MOCK_VOICE] });
    render(<VoiceLibrarySection />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));
    fireEvent.change(screen.getByTestId('voice-library-search'), {
      target: { value: 'nonexistent' },
    });
    expect(screen.getByText(/No voices match/)).toBeInTheDocument();
  });

  it('shows delete confirmation on delete button click', () => {
    useVoiceStore.setState({ voices: [MOCK_VOICE] });
    render(<VoiceLibrarySection />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));
    fireEvent.click(screen.getByTestId('voice-delete-voice-1'));
    expect(screen.getByTestId('voice-delete-confirm-voice-1')).toBeInTheDocument();
  });

  it('deletes voice on confirm', async () => {
    useVoiceStore.setState({ voices: [MOCK_VOICE] });
    render(<VoiceLibrarySection />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));
    fireEvent.click(screen.getByTestId('voice-delete-voice-1'));
    fireEvent.click(screen.getByTestId('voice-delete-confirm-voice-1'));
    // Wait for async delete
    await vi.waitFor(() => {
      expect(useVoiceStore.getState().voices).toHaveLength(0);
    });
  });

  it('shows error message when createError is set', () => {
    useVoiceStore.setState({ createError: 'Storage full' });
    render(<VoiceLibrarySection />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));
    expect(screen.getByTestId('voice-library-error')).toBeInTheDocument();
    expect(screen.getByText('Storage full')).toBeInTheDocument();
  });

  it('disables search input when disabled prop is true', () => {
    render(<VoiceLibrarySection disabled />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));
    expect(screen.getByTestId('voice-library-search')).toBeDisabled();
  });
});
