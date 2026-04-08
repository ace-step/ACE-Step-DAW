import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceLibrarySection } from '../VoiceLibrarySection';
import { useVoiceStore } from '../../../store/voiceStore';
import type { VoiceProfile } from '../../../types/voice';
import { DEFAULT_AUDIO_INFLUENCE, DEFAULT_STYLE_INFLUENCE } from '../../../types/voice';

// Mock idb-keyval
vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
  keys: vi.fn().mockResolvedValue([]),
}));

function makeProfile(overrides: Partial<VoiceProfile> = {}): VoiceProfile {
  return {
    id: `voice-${Math.random().toString(36).slice(2)}`,
    name: 'Test Voice',
    audioKey: 'voice-audio:test',
    duration: 45,
    defaultAudioInfluence: DEFAULT_AUDIO_INFLUENCE,
    defaultStyleInfluence: DEFAULT_STYLE_INFLUENCE,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('VoiceLibrarySection', () => {
  beforeEach(() => {
    localStorage.clear();
    useVoiceStore.setState(useVoiceStore.getInitialState(), true);
  });

  it('renders the section header', () => {
    render(<VoiceLibrarySection />);
    expect(screen.getByText('Voice Library')).toBeInTheDocument();
  });

  it('shows empty state when no profiles exist', () => {
    render(<VoiceLibrarySection />);
    expect(screen.getByText(/no voice profiles/i)).toBeInTheDocument();
  });

  it('lists existing voice profiles', () => {
    useVoiceStore.getState().addProfile(makeProfile({ id: 'v1', name: 'Singer A' }));
    useVoiceStore.getState().addProfile(makeProfile({ id: 'v2', name: 'Singer B' }));

    render(<VoiceLibrarySection />);

    expect(screen.getByText('Singer A')).toBeInTheDocument();
    expect(screen.getByText('Singer B')).toBeInTheDocument();
  });

  it('shows duration for each profile', () => {
    useVoiceStore.getState().addProfile(makeProfile({ id: 'v1', name: 'Voice', duration: 65 }));

    render(<VoiceLibrarySection />);

    expect(screen.getByText('1:05')).toBeInTheDocument();
  });

  it('renders upload button', () => {
    render(<VoiceLibrarySection />);
    expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument();
  });

  it('renders delete button for each profile', () => {
    useVoiceStore.getState().addProfile(makeProfile({ id: 'v1', name: 'Voice' }));

    render(<VoiceLibrarySection />);

    const deleteBtn = screen.getByLabelText(/delete.*voice/i);
    expect(deleteBtn).toBeInTheDocument();
  });

  it('shows processing state', () => {
    useVoiceStore.setState({ isProcessing: true });

    render(<VoiceLibrarySection />);

    expect(screen.getByText(/processing/i)).toBeInTheDocument();
  });

  it('shows error message', () => {
    useVoiceStore.setState({ error: 'Something went wrong' });

    render(<VoiceLibrarySection />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
