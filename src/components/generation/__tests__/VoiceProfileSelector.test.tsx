import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceProfileSelector } from '../VoiceProfileSelector';
import { useGenerationStore } from '../../../store/generationStore';
import type { VoiceProfile } from '../../../types/voice';

function makeVoiceProfile(overrides: Partial<VoiceProfile> = {}): VoiceProfile {
  return {
    id: `voice-${Math.random().toString(36).slice(2)}`,
    name: 'Test Voice',
    audioKey: 'test-audio-key',
    duration: 45,
    defaultAudioInfluence: 40,
    defaultStyleInfluence: 60,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('VoiceProfileSelector', () => {
  beforeEach(() => {
    localStorage.clear();
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
  });

  it('renders "No voice" option when profiles exist and none selected', () => {
    const profile = makeVoiceProfile({ id: 'v1', name: 'Singer A' });
    useGenerationStore.getState().addVoiceProfile(profile);

    render(<VoiceProfileSelector />);
    const select = screen.getByLabelText('Voice Profile') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(screen.getByText('No voice')).toBeInTheDocument();
  });

  it('lists available voice profiles', () => {
    const p1 = makeVoiceProfile({ id: 'v1', name: 'Singer A' });
    const p2 = makeVoiceProfile({ id: 'v2', name: 'Singer B' });
    useGenerationStore.getState().addVoiceProfile(p1);
    useGenerationStore.getState().addVoiceProfile(p2);

    render(<VoiceProfileSelector />);

    expect(screen.getByText('Singer A')).toBeInTheDocument();
    expect(screen.getByText('Singer B')).toBeInTheDocument();
  });

  it('selects a voice profile', () => {
    const profile = makeVoiceProfile({ id: 'v1', name: 'Singer A' });
    useGenerationStore.getState().addVoiceProfile(profile);

    render(<VoiceProfileSelector />);

    const select = screen.getByLabelText('Voice Profile');
    fireEvent.change(select, { target: { value: 'v1' } });

    expect(useGenerationStore.getState().generationForm.selectedVoiceProfileId).toBe('v1');
  });

  it('deselects voice profile', () => {
    const profile = makeVoiceProfile({ id: 'v1' });
    useGenerationStore.getState().addVoiceProfile(profile);
    useGenerationStore.getState().setSelectedVoiceProfile('v1');

    render(<VoiceProfileSelector />);

    const select = screen.getByLabelText('Voice Profile');
    fireEvent.change(select, { target: { value: '' } });

    expect(useGenerationStore.getState().generationForm.selectedVoiceProfileId).toBeNull();
  });

  it('renders nothing when no profiles exist', () => {
    const { container } = render(<VoiceProfileSelector />);
    // Should still render the selector even with no profiles (shows "No voice" only)
    expect(container.querySelector('select')).toBeNull();
  });
});
