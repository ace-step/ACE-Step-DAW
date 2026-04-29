import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useVoiceStore } from '../../../store/voiceStore';
import { VoiceEditDialog } from '../VoiceEditDialog';
import type { VoiceProfile } from '../../../types/voice';

vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => ({})),
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  keys: vi.fn().mockResolvedValue([]),
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
    tags: ['rock'],
    defaultAudioInfluence: 50,
    defaultStyleInfluence: 50,
    source: 'upload',
    language: 'English',
    ...overrides,
  };
}

describe('VoiceEditDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useVoiceStore.setState({
      voices: [makeVoice()],
      selectedVoiceId: null,
      searchQuery: '',
      filterTag: null,
    });
  });

  it('renders with pre-filled values', () => {
    render(<VoiceEditDialog voiceId="v1" onClose={vi.fn()} />);

    expect(screen.getByTestId('voice-edit-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('voice-edit-name')).toHaveValue('Test Voice');
    expect(screen.getByTestId('voice-edit-language')).toHaveValue('English');
    expect(screen.getByTestId('voice-edit-tags')).toHaveValue('rock');
  });

  it('saves updated metadata on save', () => {
    const onClose = vi.fn();
    render(<VoiceEditDialog voiceId="v1" onClose={onClose} />);

    const nameInput = screen.getByTestId('voice-edit-name');
    fireEvent.change(nameInput, { target: { value: 'Updated Voice' } });

    const tagsInput = screen.getByTestId('voice-edit-tags');
    fireEvent.change(tagsInput, { target: { value: 'jazz, smooth' } });

    fireEvent.click(screen.getByTestId('voice-edit-skill-professional'));
    fireEvent.click(screen.getByTestId('voice-edit-save'));

    const updated = useVoiceStore.getState().voices[0];
    expect(updated.name).toBe('Updated Voice');
    expect(updated.tags).toEqual(['jazz', 'smooth']);
    expect(updated.skillLevel).toBe('professional');
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when cancel is clicked', () => {
    const onClose = vi.fn();
    render(<VoiceEditDialog voiceId="v1" onClose={onClose} />);

    fireEvent.click(screen.getByTestId('voice-edit-cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<VoiceEditDialog voiceId="v1" onClose={onClose} />);

    fireEvent.click(screen.getByTestId('voice-edit-dialog'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not close when dialog content is clicked', () => {
    const onClose = vi.fn();
    render(<VoiceEditDialog voiceId="v1" onClose={onClose} />);

    // Click the inner dialog (not the backdrop)
    const nameInput = screen.getByTestId('voice-edit-name');
    fireEvent.click(nameInput);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('changes skill level when a button is clicked', () => {
    render(<VoiceEditDialog voiceId="v1" onClose={vi.fn()} />);

    fireEvent.click(screen.getByTestId('voice-edit-skill-advanced'));
    fireEvent.click(screen.getByTestId('voice-edit-save'));

    expect(useVoiceStore.getState().voices[0].skillLevel).toBe('advanced');
  });

  it('renders nothing for a non-existent voice', () => {
    const { container } = render(<VoiceEditDialog voiceId="non-existent" onClose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });
});
