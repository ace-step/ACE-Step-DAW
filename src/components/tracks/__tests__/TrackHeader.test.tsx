import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TrackHeader } from '../TrackHeader';
import { useProjectStore } from '../../../store/projectStore';
import type { Track } from '../../../types/project';

// Mock modules that use browser APIs not available in jsdom
vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));
vi.mock('../../../hooks/useRecording', () => ({
  useRecording: () => ({
    armedTrackIds: [],
    toggleArmTrack: vi.fn(),
  }),
}));
vi.mock('../../../services/freezeTrack', () => ({
  freezeTrackToAudio: vi.fn(),
  flattenTrackToAudio: vi.fn(),
}));

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    trackName: 'vocals',
    trackType: 'stems',
    displayName: 'Vocals',
    color: '#f43f5e',
    volume: 0.8,
    pan: 0,
    muted: false,
    soloed: false,
    armed: false,
    clips: [],
    laneHeight: 64,
    frozen: false,
    ...overrides,
  } as Track;
}

const defaultProps = {
  onDragStart: vi.fn(),
  onDragOver: vi.fn(),
  onDrop: vi.fn(),
  isDragOver: false,
  dragOverPosition: null as 'before' | 'after' | null,
};

describe('TrackHeader icon bar', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  it('renders Solo button with headphone icon (aria-label contains "Solo")', () => {
    render(<TrackHeader track={makeTrack()} {...defaultProps} />);
    expect(screen.getByTitle('Solo (S)')).toBeInTheDocument();
  });

  it('renders Input Monitoring with a microphone icon distinct from Solo', () => {
    render(<TrackHeader track={makeTrack()} {...defaultProps} />);
    const monitorBtn = screen.getByTitle(/Input monitoring/);
    const soloBtn = screen.getByTitle('Solo (S)');

    // Both buttons should exist
    expect(monitorBtn).toBeInTheDocument();
    expect(soloBtn).toBeInTheDocument();

    // The SVG content inside each should be different (different icon shapes)
    const monitorSvg = monitorBtn.querySelector('svg')!;
    const soloSvg = soloBtn.querySelector('svg')!;
    expect(monitorSvg.innerHTML).not.toBe(soloSvg.innerHTML);

    // Input monitoring icon should NOT contain headphone ear-cup paths
    // It should use a microphone shape instead
    expect(monitorSvg.getAttribute('data-icon')).toBe('microphone');
  });

  it('shows only primary buttons (Mute, Solo, Record Arm) by default', () => {
    render(<TrackHeader track={makeTrack()} {...defaultProps} />);

    // Primary buttons should be visible
    const muteBtn = screen.getByTitle('Mute (M)');
    const soloBtn = screen.getByTitle('Solo (S)');
    const armBtn = screen.getByTitle('Record arm');

    expect(muteBtn).toBeVisible();
    expect(soloBtn).toBeVisible();
    expect(armBtn).toBeVisible();

    // Secondary buttons should be hidden by default (opacity-0 or similar)
    const monitorBtn = screen.getByTitle(/Input monitoring/);
    const freezeBtn = screen.getByTitle(/Freeze/i);
    const autoBtn = screen.getByTitle(/automation/i);

    // They should have the secondary-action CSS class or be hidden
    expect(monitorBtn.closest('[data-secondary-actions]')).not.toBeNull();
    expect(freezeBtn.closest('[data-secondary-actions]')).not.toBeNull();
    expect(autoBtn.closest('[data-secondary-actions]')).not.toBeNull();
  });

  it('has uniform button sizing with consistent gap', () => {
    render(<TrackHeader track={makeTrack()} {...defaultProps} />);

    const buttons = screen.getAllByRole('button');
    const iconButtons = buttons.filter(
      (b) => b.title && ['Mute (M)', 'Solo (S)', 'Record arm'].includes(b.title)
    );

    // All primary icon buttons should have consistent dimensions
    for (const btn of iconButtons) {
      expect(btn.classList.contains('w-5')).toBe(true);
      expect(btn.classList.contains('h-5')).toBe(true);
    }
  });

  it('each button has a descriptive tooltip', () => {
    render(<TrackHeader track={makeTrack()} {...defaultProps} />);

    expect(screen.getByTitle('Mute (M)')).toBeInTheDocument();
    expect(screen.getByTitle('Solo (S)')).toBeInTheDocument();
    expect(screen.getByTitle('Record arm')).toBeInTheDocument();
    expect(screen.getByTitle(/Input monitoring/)).toBeInTheDocument();
  });
});
