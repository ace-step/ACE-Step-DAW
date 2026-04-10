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

  describe('M/S/FX labeled circular buttons', () => {
    it('M/S/FX buttons are circular with text labels', () => {
      render(<TrackHeader track={makeTrack()} {...defaultProps} />);

      const muteBtn = screen.getByLabelText('Mute Vocals');
      const soloBtn = screen.getByLabelText('Solo Vocals');
      const fxBtn = screen.getByLabelText('Effects for Vocals');

      for (const btn of [muteBtn, soloBtn, fxBtn]) {
        expect(btn.classList.contains('rounded-full')).toBe(true);
      }
      expect(muteBtn.textContent).toBe('M');
      expect(soloBtn.textContent).toBe('S');
      expect(fxBtn.textContent).toBe('FX');
    });

    it('mute button is red when active', () => {
      render(<TrackHeader track={makeTrack({ muted: true })} {...defaultProps} />);
      const muteBtn = screen.getByLabelText('Mute Vocals');
      expect(muteBtn.className).toContain('text-red-400');
    });

    it('solo button is amber when active', () => {
      render(<TrackHeader track={makeTrack({ soloed: true })} {...defaultProps} />);
      const soloBtn = screen.getByLabelText('Solo Vocals');
      expect(soloBtn.className).toContain('text-amber-400');
    });

    it('M/S/FX buttons have no SVG icons', () => {
      render(<TrackHeader track={makeTrack()} {...defaultProps} />);
      const muteBtn = screen.getByLabelText('Mute Vocals');
      const soloBtn = screen.getByLabelText('Solo Vocals');
      const fxBtn = screen.getByLabelText('Effects for Vocals');

      for (const btn of [muteBtn, soloBtn, fxBtn]) {
        expect(btn.querySelector('svg')).toBeNull();
      }
    });

    it('primary actions container has no bordered styling', () => {
      render(<TrackHeader track={makeTrack({ laneHeight: 80 })} {...defaultProps} />);
      const container = screen.getByTestId('track-header-row1').querySelector('[data-primary-actions]');
      expect(container).not.toBeNull();
      // Should NOT have the old bordered container classes
      expect(container!.className).not.toContain('border-[#494949]');
      expect(container!.className).not.toContain('rounded-lg');
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

    it('row2 contains combined fader-meter', () => {
      render(<TrackHeader track={makeTrack({ laneHeight: 80 })} {...defaultProps} />);

      const row2 = screen.getByTestId('track-header-row2');
      // Combined fader-meter should be in row2
      expect(row2.querySelector('[data-testid="fader-meter"]')).not.toBeNull();
      expect(row2.querySelector('[role="slider"]')).not.toBeNull();
    });
  });

  describe('collapsed thumbnail rail mode', () => {
    it('renders a compact label and hides the standard detail rows', () => {
      render(<TrackHeader track={makeTrack({ displayName: 'Lead Vocal' })} isCollapsed {...defaultProps} />);

      expect(screen.getByTestId('track-header-collapsed-label')).toHaveTextContent('LV');
      expect(screen.queryByTestId('track-header-row1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('track-header-row2')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Mute (M)')).not.toBeInTheDocument();
    });
  });

  describe('level meter minimum width', () => {
    it('stereo meter renders left and right channel bars', () => {
      render(<TrackHeader track={makeTrack()} {...defaultProps} />);

      const leftMeter = screen.getByTestId('meter-left');
      const rightMeter = screen.getByTestId('meter-right');
      expect(leftMeter).toBeInTheDocument();
      expect(rightMeter).toBeInTheDocument();
    });
  });

  describe('group class on header container', () => {
    it('header container has the group class for group-hover support', () => {
      render(<TrackHeader track={makeTrack()} {...defaultProps} />);

      const header = screen.getByRole('button', { name: /Track: Vocals/i });
      expect(header.classList.contains('group')).toBe(true);
    });
  });

  describe('Phase C: secondary actions removed from visible header', () => {
    it('does NOT render secondary actions container in the header', () => {
      render(<TrackHeader track={makeTrack({ laneHeight: 80 })} {...defaultProps} />);

      // The data-secondary-actions element should not exist anywhere
      const secondaryActions = document.querySelector('[data-secondary-actions]');
      expect(secondaryActions).toBeNull();
    });

    it('does NOT render monitor button in the header', () => {
      render(<TrackHeader track={makeTrack({ laneHeight: 80 })} {...defaultProps} />);
      expect(screen.queryByLabelText(/Input monitoring/)).not.toBeInTheDocument();
    });

    it('does NOT render freeze button in the header', () => {
      render(<TrackHeader track={makeTrack({ laneHeight: 80 })} {...defaultProps} />);
      expect(screen.queryByLabelText(/Freeze/)).not.toBeInTheDocument();
    });

    it('does NOT render effects bypass button in the header', () => {
      render(<TrackHeader track={makeTrack({ laneHeight: 80 })} {...defaultProps} />);
      expect(screen.queryByLabelText(/FX bypass/)).not.toBeInTheDocument();
    });
  });

  describe('Phase C: fader-meter in header', () => {
    it('renders a fader-meter with correct aria-label in two-row layout', () => {
      render(<TrackHeader track={makeTrack({ laneHeight: 80 })} {...defaultProps} />);
      const fader = screen.getByLabelText('Vocals volume');
      expect(fader).toBeInTheDocument();
      expect(fader.getAttribute('role')).toBe('slider');
    });

    it('renders a fader-meter in single-row compact layout', () => {
      render(<TrackHeader track={makeTrack({ laneHeight: 48 })} {...defaultProps} />);
      const fader = screen.getByLabelText('Vocals volume');
      expect(fader).toBeInTheDocument();
    });
  });

  describe('track name truncation fix', () => {
    it('name wrapper has min-w-[60px] for adequate text display', () => {
      render(<TrackHeader track={makeTrack({ laneHeight: 80, displayName: 'Percussion' })} {...defaultProps} />);
      const row1 = screen.getByTestId('track-header-row1');
      const nameWrapper = row1.querySelector('.flex-1.min-w-\\[60px\\]');
      expect(nameWrapper).not.toBeNull();
    });

    it('primary actions container uses overflow-hidden to prevent button overflow', () => {
      render(<TrackHeader track={makeTrack({ laneHeight: 80 })} {...defaultProps} />);
      const row1 = screen.getByTestId('track-header-row1');
      const actionsContainer = row1.querySelector('[data-primary-actions]');
      expect(actionsContainer).not.toBeNull();
      expect(actionsContainer!.className).toContain('overflow-hidden');
    });

    it('displays full track name in title attribute for tooltip access', () => {
      render(<TrackHeader track={makeTrack({ laneHeight: 80, displayName: 'Percussion Long Name' })} {...defaultProps} />);
      const nameSpan = screen.getByTitle('Percussion Long Name');
      expect(nameSpan).toBeInTheDocument();
      expect(nameSpan.textContent).toContain('Percussion Long Name');
    });
  });
});
