import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { VoiceInfluenceControls } from '../VoiceInfluenceControls';
import { useVoiceStore } from '../../../store/voiceStore';
import type { VoiceProfile } from '../../../types/voice';
import {
  DEFAULT_AUDIO_INFLUENCE,
  DEFAULT_STYLE_INFLUENCE,
  VOICE_INFLUENCE_PRESETS,
} from '../../../types/voice';

function makeVoiceProfile(overrides: Partial<VoiceProfile> = {}): VoiceProfile {
  const now = Date.now();
  return {
    id: `voice-${Math.random().toString(36).slice(2)}`,
    name: 'Test Voice',
    createdAt: now,
    updatedAt: now,
    audioKey: 'test-audio-key',
    durationSeconds: 45,
    skillLevel: 'intermediate',
    tags: [],
    defaultAudioInfluence: DEFAULT_AUDIO_INFLUENCE,
    defaultStyleInfluence: DEFAULT_STYLE_INFLUENCE,
    source: 'upload',
    ...overrides,
  };
}

function setSelectedVoice(profile: VoiceProfile) {
  useVoiceStore.setState({
    voices: [profile],
    selectedVoiceId: profile.id,
    searchQuery: '',
    filterTag: null,
  });
}

describe('VoiceInfluenceControls', () => {
  beforeEach(() => {
    localStorage.clear();
    useVoiceStore.setState({
      voices: [],
      selectedVoiceId: null,
      searchQuery: '',
      filterTag: null,
    });
  });

  it('renders nothing when no voice profile is selected', () => {
    const { container } = render(<VoiceInfluenceControls />);
    expect(container.firstChild).toBeNull();
  });

  it('renders sliders when a voice profile is selected', () => {
    setSelectedVoice(makeVoiceProfile({ id: 'v1' }));

    render(<VoiceInfluenceControls />);

    expect(screen.getByText('Audio Influence')).toBeInTheDocument();
    expect(screen.getByText('Style Influence')).toBeInTheDocument();
  });

  it('displays current percentage values', () => {
    setSelectedVoice(makeVoiceProfile({
      id: 'v1',
      defaultAudioInfluence: 40,
      defaultStyleInfluence: 60,
    }));

    render(<VoiceInfluenceControls />);

    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('renders all preset buttons', () => {
    setSelectedVoice(makeVoiceProfile({ id: 'v1' }));

    render(<VoiceInfluenceControls />);

    for (const preset of VOICE_INFLUENCE_PRESETS) {
      expect(screen.getByText(preset.label)).toBeInTheDocument();
    }
  });

  it('applies preset values to the selected voice', () => {
    setSelectedVoice(makeVoiceProfile({ id: 'v1' }));

    render(<VoiceInfluenceControls />);
    fireEvent.click(screen.getByText('AI Enhanced'));

    const profile = useVoiceStore.getState().voices[0];
    expect(profile.defaultAudioInfluence).toBe(20);
    expect(profile.defaultStyleInfluence).toBe(80);
  });

  it('updates audio influence via slider', () => {
    setSelectedVoice(makeVoiceProfile({ id: 'v1' }));

    render(<VoiceInfluenceControls />);

    fireEvent.change(screen.getByLabelText('Audio Influence'), { target: { value: '75' } });

    expect(useVoiceStore.getState().voices[0].defaultAudioInfluence).toBe(75);
  });

  it('updates style influence via slider', () => {
    setSelectedVoice(makeVoiceProfile({ id: 'v1' }));

    render(<VoiceInfluenceControls />);

    fireEvent.change(screen.getByLabelText('Style Influence'), { target: { value: '30' } });

    expect(useVoiceStore.getState().voices[0].defaultStyleInfluence).toBe(30);
  });

  it('resets both sliders to the selected voice defaults on double-click', () => {
    setSelectedVoice(makeVoiceProfile({
      id: 'v1',
      defaultAudioInfluence: 35,
      defaultStyleInfluence: 65,
    }));

    render(<VoiceInfluenceControls />);

    fireEvent.change(screen.getByLabelText('Audio Influence'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Style Influence'), { target: { value: '10' } });

    fireEvent.doubleClick(screen.getByLabelText('Audio Influence'));
    expect(useVoiceStore.getState().voices[0].defaultAudioInfluence).toBe(35);

    fireEvent.doubleClick(screen.getByLabelText('Style Influence'));
    expect(useVoiceStore.getState().voices[0].defaultStyleInfluence).toBe(65);
  });

  it('highlights the active preset', () => {
    setSelectedVoice(makeVoiceProfile({
      id: 'v1',
      defaultAudioInfluence: 40,
      defaultStyleInfluence: 60,
    }));

    render(<VoiceInfluenceControls />);

    expect(screen.getByText('Natural').className).toContain('accent');
  });

  it('shows voice name label', () => {
    setSelectedVoice(makeVoiceProfile({ id: 'v1', name: 'My Singer' }));

    render(<VoiceInfluenceControls />);

    expect(screen.getByText('My Singer')).toBeInTheDocument();
  });
});
