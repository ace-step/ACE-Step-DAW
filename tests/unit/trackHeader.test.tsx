import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TrackHeader } from '../../src/components/tracks/TrackHeader';
import { useProjectStore } from '../../src/store/projectStore';
import type { Track } from '../../src/types/project';

vi.mock('../../src/services/aceStepApi', () => ({
  listModels: vi.fn().mockResolvedValue([]),
  initModel: vi.fn().mockResolvedValue({}),
  getBackendUrl: vi.fn().mockReturnValue('http://localhost:8001'),
  setBackendUrl: vi.fn(),
}));

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../src/services/freezeTrack', () => ({
  freezeTrackToAudio: vi.fn().mockResolvedValue(undefined),
  flattenTrackToAudio: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/hooks/useRecording', () => ({
  useRecording: () => ({
    armedTrackIds: [],
    toggleArmTrack: vi.fn(),
  }),
}));

vi.mock('../../src/hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    getTrackLevel: () => 0,
    getTrackMeter: () => ({ level: 0, clipped: false }),
    resetTrackClip: vi.fn(),
  }),
}));

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    trackType: 'stems',
    trackName: 'drums',
    displayName: 'Drums',
    color: '#ef4444',
    order: 0,
    volume: 0.8,
    muted: false,
    soloed: false,
    clips: [],
    laneHeight: 64,
    frozen: false,
    ...overrides,
  };
}

const noop = () => {};

function renderHeader(trackOverrides: Partial<Track> = {}) {
  const track = makeTrack(trackOverrides);
  return render(
    <TrackHeader
      track={track}
      onDragStart={noop}
      onDragOver={noop as any}
      onDrop={noop as any}
      isDragOver={false}
      dragOverPosition={null}
    />,
  );
}

describe('TrackHeader — icon bar cleanup (#267)', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  describe('icon-only dot buttons (Phase C)', () => {
    it('renders Mute, Solo, FX as labeled circular buttons', () => {
      renderHeader();
      const muteBtn = screen.getByTitle('Mute (M)');
      const soloBtn = screen.getByTitle('Solo (S)');
      const fxBtn = screen.getByTitle('Effects chain (FX)');

      for (const btn of [muteBtn, soloBtn, fxBtn]) {
        expect(btn.classList.contains('rounded-full')).toBe(true);
        // No SVG icons inside buttons
        expect(btn.querySelector('svg')).toBeNull();
      }
      // Buttons have text labels
      expect(muteBtn.textContent).toBe('M');
      expect(soloBtn.textContent).toBe('S');
      expect(fxBtn.textContent).toBe('FX');
    });

    it('mute dot turns red when active', () => {
      renderHeader({ muted: true });
      const muteBtn = screen.getByTitle('Mute (M)');
      expect(muteBtn.className).toContain('text-red-400');
    });

    it('solo dot turns amber when active', () => {
      renderHeader({ soloed: true });
      const soloBtn = screen.getByTitle('Solo (S)');
      expect(soloBtn.className).toContain('text-amber-400');
    });
  });

  describe('progressive disclosure (Phase C)', () => {
    it('primary buttons (Mute, Solo, FX) are always visible', () => {
      renderHeader();
      const muteBtn = screen.getByTitle('Mute (M)');
      const soloBtn = screen.getByTitle('Solo (S)');
      const fxBtn = screen.getByTitle('Effects chain (FX)');
      const primaryRail = muteBtn.closest('[data-primary-actions]');
      expect(primaryRail).not.toBeNull();
      expect(soloBtn.closest('[data-primary-actions]')).toBe(primaryRail);
      expect(fxBtn.closest('[data-primary-actions]')).toBe(primaryRail);
    });

    it('secondary actions (Monitor, Freeze, FX Bypass) are NOT rendered in header', () => {
      renderHeader({ inputMonitoring: 'off', frozen: false });
      // Secondary actions are moved to context menu only
      expect(document.querySelector('[data-secondary-actions]')).toBeNull();
      expect(screen.queryByTitle(/Input monitoring/)).not.toBeInTheDocument();
      expect(screen.queryByTitle(/Freeze Track/)).not.toBeInTheDocument();
      expect(screen.queryByTitle(/Bypass all track effects/)).not.toBeInTheDocument();
    });
  });

  describe('layout clarity', () => {
    it('primary actions container uses simple flex without bordered styling', () => {
      renderHeader();
      const muteBtn = screen.getByTitle('Mute (M)');
      const container = muteBtn.closest('[data-primary-actions]')!;
      expect(container).not.toBeNull();
      expect(container.className).not.toContain('border-[#494949]');
      expect(container.className).not.toContain('rounded-lg');
    });
  });

  describe('button tooltips', () => {
    it('all primary icon buttons have descriptive titles', () => {
      renderHeader();
      expect(screen.getByTitle('Mute (M)')).toBeInTheDocument();
      expect(screen.getByTitle('Solo (S)')).toBeInTheDocument();
      expect(screen.getByTitle('Effects chain (FX)')).toBeInTheDocument();
    });
  });

  describe('volume fader', () => {
    it('renders a fader-meter with aria-label and slider role', () => {
      renderHeader();
      const fader = screen.getByLabelText('Drums volume');
      expect(fader).toBeInTheDocument();
      expect(fader.getAttribute('role')).toBe('slider');
    });
  });

  describe('track name visibility (#297)', () => {
    it('track display name text is visible in the DOM', () => {
      renderHeader({ displayName: 'My Cool Track' });
      expect(screen.getByText('My Cool Track')).toBeInTheDocument();
    });

    it('name column has a minimum width to prevent complete collapse', () => {
      renderHeader();
      const nameSpan = screen.getByText('Drums');
      const nameColumn = nameSpan.parentElement!;
      // The name+controls column must enforce a minimum width
      expect(nameColumn.className).toMatch(/min-w-\[/);
    });
  });
});
