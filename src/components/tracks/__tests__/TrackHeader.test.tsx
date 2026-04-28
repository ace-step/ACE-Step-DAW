import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TrackHeader } from '../TrackHeader';
import { useProjectStore } from '../../../store/projectStore';
import type { Track } from '../../../types/project';

const mockToggleArmTrack = vi.fn();
let mockArmedTrackIds: string[] = [];

// Mock modules that use browser APIs not available in jsdom
vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));
vi.mock('../../../hooks/useRecording', () => ({
  useRecording: () => ({
    armedTrackIds: mockArmedTrackIds,
    toggleArmTrack: mockToggleArmTrack,
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

  it('shows snowflake icon when track is frozen', () => {
    render(<TrackHeader track={makeTrack({ frozen: true })} {...defaultProps} />);
    expect(screen.getByTitle('Frozen')).toBeInTheDocument();
  });

  it('does not show snowflake icon when track is not frozen', () => {
    render(<TrackHeader track={makeTrack({ frozen: false })} {...defaultProps} />);
    expect(screen.queryByTitle('Frozen')).not.toBeInTheDocument();
  });

  it('FX button shows grayed-out style and frozen tooltip when track is frozen', () => {
    render(<TrackHeader track={makeTrack({ frozen: true })} {...defaultProps} />);
    const fxBtn = screen.getByTitle('Effects bypassed (track frozen)');
    expect(fxBtn).toBeInTheDocument();
    expect(fxBtn.className).toContain('cursor-not-allowed');
  });
});

describe('TrackHeader arm button', () => {
  beforeEach(() => {
    mockArmedTrackIds = [];
    mockToggleArmTrack.mockClear();
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  it('renders arm button for non-group tracks', () => {
    render(<TrackHeader track={makeTrack()} {...defaultProps} />);
    const armBtn = screen.getByTitle('Record Arm');
    expect(armBtn).toBeInTheDocument();
    expect(armBtn).toBeVisible();
  });

  it('does not render arm button for group tracks', () => {
    render(<TrackHeader track={makeTrack({ isGroup: true })} {...defaultProps} />);
    expect(screen.queryByTitle('Record Arm')).not.toBeInTheDocument();
  });

  it('calls toggleArmTrack when clicked', () => {
    render(<TrackHeader track={makeTrack({ id: 'track-42' })} {...defaultProps} />);
    const armBtn = screen.getByTitle('Record Arm');
    fireEvent.click(armBtn);
    expect(mockToggleArmTrack).toHaveBeenCalledWith('track-42');
  });

  it('shows bright red style when track is armed', () => {
    mockArmedTrackIds = ['track-1'];
    render(<TrackHeader track={makeTrack({ id: 'track-1', armed: true })} {...defaultProps} />);
    const armBtn = screen.getByTitle('Record Arm');
    const dot = armBtn.querySelector('div');
    expect(dot!.className).toContain('bg-red-500');
  });

  it('shows muted style when track is not armed', () => {
    mockArmedTrackIds = [];
    render(<TrackHeader track={makeTrack({ id: 'track-1', armed: false })} {...defaultProps} />);
    const armBtn = screen.getByTitle('Record Arm');
    const dot = armBtn.querySelector('div');
    expect(dot!.className).not.toContain('bg-red-500');
  });

  it('arm button is inside the primary actions container', () => {
    render(<TrackHeader track={makeTrack()} {...defaultProps} />);
    const armBtn = screen.getByTitle('Record Arm');
    const primaryRail = armBtn.closest('[data-primary-actions]');
    expect(primaryRail).not.toBeNull();
  });
});
