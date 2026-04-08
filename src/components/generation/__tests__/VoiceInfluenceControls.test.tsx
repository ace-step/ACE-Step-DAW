import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceInfluenceControls } from '../VoiceInfluenceControls';
import { useGenerationStore } from '../../../store/generationStore';
import type { VoiceProfile } from '../../../types/voice';
import { DEFAULT_AUDIO_INFLUENCE, DEFAULT_STYLE_INFLUENCE, VOICE_INFLUENCE_PRESETS } from '../../../types/voice';

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

describe('VoiceInfluenceControls', () => {
  beforeEach(() => {
    localStorage.clear();
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
  });

  it('renders nothing when no voice profile is selected', () => {
    const { container } = render(<VoiceInfluenceControls />);
    expect(container.firstChild).toBeNull();
  });

  it('renders sliders when a voice profile is selected', () => {
    const profile = makeVoiceProfile({ id: 'v1' });
    useGenerationStore.getState().addVoiceProfile(profile);
    useGenerationStore.getState().setSelectedVoiceProfile('v1');

    render(<VoiceInfluenceControls />);

    expect(screen.getByText('Audio Influence')).toBeInTheDocument();
    expect(screen.getByText('Style Influence')).toBeInTheDocument();
  });

  it('displays current percentage values', () => {
    const profile = makeVoiceProfile({ id: 'v1', defaultAudioInfluence: 40, defaultStyleInfluence: 60 });
    useGenerationStore.getState().addVoiceProfile(profile);
    useGenerationStore.getState().setSelectedVoiceProfile('v1');

    render(<VoiceInfluenceControls />);

    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('renders all preset buttons', () => {
    const profile = makeVoiceProfile({ id: 'v1' });
    useGenerationStore.getState().addVoiceProfile(profile);
    useGenerationStore.getState().setSelectedVoiceProfile('v1');

    render(<VoiceInfluenceControls />);

    for (const preset of VOICE_INFLUENCE_PRESETS) {
      expect(screen.getByText(preset.label)).toBeInTheDocument();
    }
  });

  it('applies preset values when clicking preset button', () => {
    const profile = makeVoiceProfile({ id: 'v1' });
    useGenerationStore.getState().addVoiceProfile(profile);
    useGenerationStore.getState().setSelectedVoiceProfile('v1');

    render(<VoiceInfluenceControls />);

    fireEvent.click(screen.getByText('AI Enhanced'));

    const form = useGenerationStore.getState().generationForm;
    expect(form.audioInfluence).toBe(20);
    expect(form.styleInfluence).toBe(80);
  });

  it('updates audio influence via slider', () => {
    const profile = makeVoiceProfile({ id: 'v1' });
    useGenerationStore.getState().addVoiceProfile(profile);
    useGenerationStore.getState().setSelectedVoiceProfile('v1');

    render(<VoiceInfluenceControls />);

    const audioSlider = screen.getByLabelText('Audio Influence');
    fireEvent.change(audioSlider, { target: { value: '75' } });

    expect(useGenerationStore.getState().generationForm.audioInfluence).toBe(75);
  });

  it('updates style influence via slider', () => {
    const profile = makeVoiceProfile({ id: 'v1' });
    useGenerationStore.getState().addVoiceProfile(profile);
    useGenerationStore.getState().setSelectedVoiceProfile('v1');

    render(<VoiceInfluenceControls />);

    const styleSlider = screen.getByLabelText('Style Influence');
    fireEvent.change(styleSlider, { target: { value: '30' } });

    expect(useGenerationStore.getState().generationForm.styleInfluence).toBe(30);
  });

  it('resets to defaults on double-click', () => {
    const profile = makeVoiceProfile({ id: 'v1' });
    useGenerationStore.getState().addVoiceProfile(profile);
    useGenerationStore.getState().setSelectedVoiceProfile('v1');
    useGenerationStore.getState().setAudioInfluence(90);
    useGenerationStore.getState().setStyleInfluence(10);

    render(<VoiceInfluenceControls />);

    const audioSlider = screen.getByLabelText('Audio Influence');
    fireEvent.doubleClick(audioSlider);
    expect(useGenerationStore.getState().generationForm.audioInfluence).toBe(DEFAULT_AUDIO_INFLUENCE);

    const styleSlider = screen.getByLabelText('Style Influence');
    fireEvent.doubleClick(styleSlider);
    expect(useGenerationStore.getState().generationForm.styleInfluence).toBe(DEFAULT_STYLE_INFLUENCE);
  });

  it('highlights the active preset', () => {
    const profile = makeVoiceProfile({ id: 'v1', defaultAudioInfluence: 40, defaultStyleInfluence: 60 });
    useGenerationStore.getState().addVoiceProfile(profile);
    useGenerationStore.getState().setSelectedVoiceProfile('v1');

    render(<VoiceInfluenceControls />);

    // "Natural" preset matches 40/60 defaults
    const naturalBtn = screen.getByText('Natural');
    expect(naturalBtn.className).toContain('accent');
  });

  it('shows voice name label', () => {
    const profile = makeVoiceProfile({ id: 'v1', name: 'My Singer' });
    useGenerationStore.getState().addVoiceProfile(profile);
    useGenerationStore.getState().setSelectedVoiceProfile('v1');

    render(<VoiceInfluenceControls />);

    expect(screen.getByText('My Singer')).toBeInTheDocument();
  });
});
