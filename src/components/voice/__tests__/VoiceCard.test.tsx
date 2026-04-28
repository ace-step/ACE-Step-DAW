import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceCard } from '../VoiceCard';
import type { VoiceProfile } from '../../../types/voice';

vi.mock('idb-keyval', () => ({
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
    tags: [],
    defaultAudioInfluence: 50,
    defaultStyleInfluence: 50,
    source: 'upload',
    ...overrides,
  };
}

const defaultProps = {
  isSelected: false,
  isPlaying: false,
  onSelect: vi.fn(),
  onPlay: vi.fn(),
  onStop: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
};

describe('VoiceCard', () => {
  it('renders voice name and duration', () => {
    render(<VoiceCard voice={makeVoice()} {...defaultProps} />);
    expect(screen.getByText('Test Voice')).toBeInTheDocument();
    expect(screen.getByText('45s')).toBeInTheDocument();
  });

  it('renders skill level badge', () => {
    render(<VoiceCard voice={makeVoice({ skillLevel: 'professional' })} {...defaultProps} />);
    expect(screen.getByText('professional')).toBeInTheDocument();
  });

  it('renders tags', () => {
    render(<VoiceCard voice={makeVoice({ tags: ['rock', 'energetic'] })} {...defaultProps} />);
    expect(screen.getByText('rock')).toBeInTheDocument();
    expect(screen.getByText('energetic')).toBeInTheDocument();
  });

  it('renders duration in m:s format for longer durations', () => {
    render(<VoiceCard voice={makeVoice({ durationSeconds: 125 })} {...defaultProps} />);
    expect(screen.getByText('2m 5s')).toBeInTheDocument();
  });

  it('normalizes rounded duration overflow into the minutes value', () => {
    render(<VoiceCard voice={makeVoice({ durationSeconds: 119.6 })} {...defaultProps} />);
    expect(screen.getByText('2m 0s')).toBeInTheDocument();
    expect(screen.queryByText('1m 60s')).not.toBeInTheDocument();
  });

  it('calls onSelect when clicked', () => {
    const onSelect = vi.fn();
    render(<VoiceCard voice={makeVoice()} {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('voice-card-v1'));
    expect(onSelect).toHaveBeenCalledWith('v1');
  });

  it('calls onPlay when play button is clicked', () => {
    const onPlay = vi.fn();
    render(<VoiceCard voice={makeVoice()} {...defaultProps} onPlay={onPlay} />);
    fireEvent.click(screen.getByTestId('voice-play-v1'));
    expect(onPlay).toHaveBeenCalledWith('v1');
  });

  it('calls onStop when stop button is clicked while playing', () => {
    const onStop = vi.fn();
    render(<VoiceCard voice={makeVoice()} {...defaultProps} isPlaying onStop={onStop} />);
    fireEvent.click(screen.getByTestId('voice-play-v1'));
    expect(onStop).toHaveBeenCalled();
  });

  it('calls onEdit when edit button is clicked', () => {
    const onEdit = vi.fn();
    render(<VoiceCard voice={makeVoice()} {...defaultProps} onEdit={onEdit} />);
    fireEvent.click(screen.getByTestId('voice-edit-v1'));
    expect(onEdit).toHaveBeenCalledWith('v1');
  });

  it('calls onDelete when delete button is clicked', () => {
    const onDelete = vi.fn();
    render(<VoiceCard voice={makeVoice()} {...defaultProps} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('voice-delete-v1'));
    expect(onDelete).toHaveBeenCalledWith('v1');
  });

  it('shows selected state styling', () => {
    render(<VoiceCard voice={makeVoice()} {...defaultProps} isSelected />);
    const card = screen.getByTestId('voice-card-v1');
    expect(card.className).toContain('border-daw-accent');
  });

  it('shows waveform when peaks are available', () => {
    const peaks = [0.1, 0.5, 0.8, 0.3, 0.6, 0.2, 0.9, 0.4];
    render(<VoiceCard voice={makeVoice({ waveformPeaks: peaks })} {...defaultProps} />);
    // Waveform SVG should exist with a path
    const card = screen.getByTestId('voice-card-v1');
    expect(card.querySelector('svg')).not.toBeNull();
    expect(card.querySelector('[data-testid="waveform-path"]')).not.toBeNull();
  });

  it('shows "No waveform" when no peaks', () => {
    render(<VoiceCard voice={makeVoice({ waveformPeaks: undefined })} {...defaultProps} />);
    expect(screen.getByText('No waveform')).toBeInTheDocument();
  });
});
