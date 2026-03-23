import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

vi.mock('../../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    getTrackLevel: () => 0,
    getTrackMeter: () => ({ level: 0, clipped: false }),
    resetTrackClip: vi.fn(),
  }),
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

  it('renders Solo button with title "Solo (S)"', () => {
    render(<TrackHeader track={makeTrack()} {...defaultProps} />);
    expect(screen.getByTitle('Solo (S)')).toBeInTheDocument();
  });

  it('secondary actions (monitor, freeze, FX bypass) are NOT in the visible header', () => {
    render(<TrackHeader track={makeTrack()} {...defaultProps} />);
    // Secondary actions moved to context menu in Phase C
    expect(document.querySelector('[data-secondary-actions]')).toBeNull();
    expect(screen.queryByTitle(/Input monitoring/)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Freeze/)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Bypass all track effects/)).not.toBeInTheDocument();
  });

  it('shows primary buttons (Mute, Solo, FX) as labeled circular buttons', () => {
    render(<TrackHeader track={makeTrack()} {...defaultProps} />);

    const muteBtn = screen.getByTitle('Mute (M)');
    const soloBtn = screen.getByTitle('Solo (S)');
    const fxBtn = screen.getByTitle('Effects chain (FX)');

    expect(muteBtn).toBeVisible();
    expect(soloBtn).toBeVisible();
    expect(fxBtn).toBeVisible();

    // All in data-primary-actions container
    const primaryRail = muteBtn.closest('[data-primary-actions]');
    expect(primaryRail).not.toBeNull();

    // Circular buttons with text labels, no SVGs
    for (const btn of [muteBtn, soloBtn, fxBtn]) {
      expect(btn.querySelector('svg')).toBeNull();
      expect(btn.classList.contains('rounded-full')).toBe(true);
    }
    expect(muteBtn.textContent).toBe('M');
    expect(soloBtn.textContent).toBe('S');
    expect(fxBtn.textContent).toBe('FX');
  });

  it('primary actions container has simple flex layout without borders', () => {
    render(<TrackHeader track={makeTrack()} {...defaultProps} />);
    const muteBtn = screen.getByTitle('Mute (M)');
    const container = muteBtn.closest('[data-primary-actions]')!;
    expect(container.className).not.toContain('border-[#494949]');
    expect(container.className).not.toContain('rounded-lg');
  });

  it('each primary button has a descriptive tooltip', () => {
    render(<TrackHeader track={makeTrack()} {...defaultProps} />);
    expect(screen.getByTitle('Mute (M)')).toBeInTheDocument();
    expect(screen.getByTitle('Solo (S)')).toBeInTheDocument();
    expect(screen.getByTitle('Effects chain (FX)')).toBeInTheDocument();
  });
});
