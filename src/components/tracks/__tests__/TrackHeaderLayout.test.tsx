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

describe('TrackHeader layout improvements (#546)', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  describe('M/S/Arm button minimum sizes', () => {
    it('primary buttons have min-w-[20px] and min-h-[20px] classes', () => {
      render(<TrackHeader track={makeTrack()} {...defaultProps} />);

      const muteBtn = screen.getByTitle('Mute (M)');
      const soloBtn = screen.getByTitle('Solo (S)');
      const armBtn = screen.getByTitle('Record arm');

      for (const btn of [muteBtn, soloBtn, armBtn]) {
        expect(btn.classList.contains('min-w-[20px]')).toBe(true);
        expect(btn.classList.contains('min-h-[20px]')).toBe(true);
      }
    });
  });

  describe('color strip improvements', () => {
    it('color strip uses 6px base width instead of 4px', () => {
      render(<TrackHeader track={makeTrack()} {...defaultProps} />);

      const colorStrip = screen.getByTitle('Click to change track color');
      expect(colorStrip.classList.contains('w-[6px]')).toBe(true);
      expect(colorStrip.classList.contains('w-[4px]')).toBe(false);
    });

    it('color strip has hover:w-2 class for wider hover state', () => {
      render(<TrackHeader track={makeTrack()} {...defaultProps} />);

      const colorStrip = screen.getByTitle('Click to change track color');
      expect(colorStrip.classList.contains('hover:w-2')).toBe(true);
    });

    it('color strip has hover glow shadow', () => {
      render(<TrackHeader track={makeTrack()} {...defaultProps} />);

      const colorStrip = screen.getByTitle('Click to change track color');
      // Check for the hover shadow class
      const classStr = colorStrip.className;
      expect(classStr).toContain('hover:shadow-[0_0_6px_var(--track-color)]');
    });

    it('color strip has --track-color CSS variable set', () => {
      const track = makeTrack({ color: '#f43f5e' });
      render(<TrackHeader track={track} {...defaultProps} />);

      const colorStrip = screen.getByTitle('Click to change track color');
      expect(colorStrip.style.getPropertyValue('--track-color')).toBe('#f43f5e');
    });
  });

  describe('two-row layout for non-compact mode (laneHeight >= 60)', () => {
    it('uses two-row layout when laneHeight >= 60', () => {
      render(<TrackHeader track={makeTrack({ laneHeight: 80 })} {...defaultProps} />);

      // Row 1 should contain the track name and M/S/Arm buttons
      const row1 = screen.getByTestId('track-header-row1');
      expect(row1).toBeInTheDocument();

      // Row 2 should contain the volume slider and level meter
      const row2 = screen.getByTestId('track-header-row2');
      expect(row2).toBeInTheDocument();
    });

    it('does NOT use two-row layout when laneHeight < 60', () => {
      render(<TrackHeader track={makeTrack({ laneHeight: 48 })} {...defaultProps} />);

      expect(screen.queryByTestId('track-header-row1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('track-header-row2')).not.toBeInTheDocument();
    });

    it('row1 contains drag handle, instrument icon, track name, and M/S/Arm buttons', () => {
      render(<TrackHeader track={makeTrack({ laneHeight: 80 })} {...defaultProps} />);

      const row1 = screen.getByTestId('track-header-row1');
      // M/S/Arm buttons should be inside row1
      expect(row1.querySelector('[data-primary-actions]')).not.toBeNull();
    });

    it('row2 contains volume slider and level meter', () => {
      render(<TrackHeader track={makeTrack({ laneHeight: 80 })} {...defaultProps} />);

      const row2 = screen.getByTestId('track-header-row2');
      // Volume slider should be in row2
      expect(row2.querySelector('input[type="range"]')).not.toBeNull();
      // Level meter should be in row2
      expect(row2.querySelector('[aria-label]')).not.toBeNull();
    });
  });

  describe('level meter minimum width', () => {
    it('level meter container has min-w-[6px] class', () => {
      render(<TrackHeader track={makeTrack()} {...defaultProps} />);

      const meter = screen.getByLabelText(/level meter/i);
      expect(meter.classList.contains('min-w-[6px]')).toBe(true);
    });
  });

  describe('group class on header container', () => {
    it('header container has the group class for group-hover support', () => {
      render(<TrackHeader track={makeTrack()} {...defaultProps} />);

      const header = screen.getByRole('button', { name: /Track: Vocals/i });
      expect(header.classList.contains('group')).toBe(true);
    });
  });
});
