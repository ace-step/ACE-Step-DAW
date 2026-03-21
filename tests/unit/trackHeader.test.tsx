import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TrackHeader } from '../../src/components/tracks/TrackHeader';
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
  describe('icon differentiation', () => {
    it('renders Solo button with headphone icon (arc path)', () => {
      renderHeader();
      const soloBtn = screen.getByTitle('Solo (S)');
      expect(soloBtn).toBeInTheDocument();
      // Headphone icon has the arc "a4 4 0 018 0" in its SVG path
      const svg = soloBtn.querySelector('svg');
      expect(svg).toBeTruthy();
      const paths = svg!.querySelectorAll('path');
      const hasHeadphoneArc = Array.from(paths).some((p) =>
        p.getAttribute('d')?.includes('a4 4 0 018 0'),
      );
      expect(hasHeadphoneArc).toBe(true);
    });

    it('renders Input Monitoring button with microphone icon (rect element)', () => {
      renderHeader();
      const monitorBtn = screen.getByTitle(/Input monitoring/);
      expect(monitorBtn).toBeInTheDocument();
      const svg = monitorBtn.querySelector('svg');
      expect(svg).toBeTruthy();
      // Microphone icon uses a <rect> for the mic body, not a headphone arc
      const rects = svg!.querySelectorAll('rect');
      expect(rects.length).toBeGreaterThan(0);
      // Should NOT contain headphone-style arc path
      const paths = svg!.querySelectorAll('path');
      const hasHeadphoneArc = Array.from(paths).some((p) =>
        p.getAttribute('d')?.includes('a4 4 0 018 0'),
      );
      expect(hasHeadphoneArc).toBe(false);
    });

    it('Solo and Input Monitoring use visually distinct SVG shapes', () => {
      renderHeader();
      const soloSvg = screen.getByTitle('Solo (S)').querySelector('svg')!;
      const monitorSvg = screen.getByTitle(/Input monitoring/).querySelector('svg')!;
      // They must not be identical
      expect(soloSvg.innerHTML).not.toBe(monitorSvg.innerHTML);
    });
  });

  describe('progressive disclosure', () => {
    it('primary buttons (Mute, Solo, Record arm) are always visible', () => {
      renderHeader();
      const muteBtn = screen.getByTitle('Mute (M)');
      const soloBtn = screen.getByTitle('Solo (S)');
      const armBtn = screen.getByTitle('Record arm');
      const primaryRail = muteBtn.closest('[data-primary-actions]');
      expect(primaryRail).not.toBeNull();
      expect(soloBtn.closest('[data-primary-actions]')).toBe(primaryRail);
      expect(armBtn.closest('[data-primary-actions]')).toBe(primaryRail);
    });

    it('secondary buttons (Monitor, Freeze, Automation) are in a hover-reveal container when inactive', () => {
      renderHeader({ inputMonitoring: 'off', frozen: false });
      const monitorBtn = screen.getByTitle(/Input monitoring/);
      const freezeBtn = screen.getByTitle(/Freeze Track/);
      const autoBtn = screen.getByTitle(/automation/i);
      // All three should share a common parent with opacity-0 class
      const container = monitorBtn.parentElement!;
      expect(container.classList.contains('opacity-0')).toBe(true);
      expect(container.classList.contains('group-hover:opacity-100')).toBe(true);
      expect(container.classList.contains('pointer-events-none')).toBe(true);
      expect(freezeBtn.parentElement).toBe(container);
      expect(autoBtn.parentElement).toBe(container);
    });

    it('secondary buttons become visible when input monitoring is active', () => {
      renderHeader({ inputMonitoring: 'on' });
      const monitorBtn = screen.getByTitle(/Input monitoring/);
      const container = monitorBtn.parentElement!;
      expect(container.classList.contains('opacity-100')).toBe(true);
      expect(container.classList.contains('opacity-0')).toBe(false);
      expect(container.classList.contains('pointer-events-none')).toBe(false);
    });

    it('secondary buttons become visible when track is frozen', () => {
      renderHeader({ frozen: true });
      const freezeBtn = screen.getByTitle(/Unfreeze Track/);
      const container = freezeBtn.parentElement!;
      expect(container.classList.contains('opacity-100')).toBe(true);
      expect(container.classList.contains('opacity-0')).toBe(false);
    });
  });

  describe('layout clarity', () => {
    it('uses a larger pill for the always-visible primary controls', () => {
      renderHeader();
      const muteBtn = screen.getByTitle('Mute (M)');
      const soloBtn = screen.getByTitle('Solo (S)');
      const armBtn = screen.getByTitle('Record arm');

      for (const btn of [muteBtn, soloBtn, armBtn]) {
        expect(btn.classList.contains('w-6')).toBe(true);
        expect(btn.classList.contains('h-6')).toBe(true);
      }
    });
  });

  describe('button tooltips', () => {
    it('all icon buttons have descriptive titles', () => {
      renderHeader();
      expect(screen.getByTitle('Mute (M)')).toBeInTheDocument();
      expect(screen.getByTitle('Solo (S)')).toBeInTheDocument();
      expect(screen.getByTitle('Record arm')).toBeInTheDocument();
      expect(screen.getByTitle(/Input monitoring/)).toBeInTheDocument();
      expect(screen.getByTitle(/Freeze Track/)).toBeInTheDocument();
      expect(screen.getByTitle(/Bypass all track effects \(P\)/)).toBeInTheDocument();
      expect(screen.getByTitle(/automation/i)).toBeInTheDocument();
    });
  });

  describe('FX bypass toggle', () => {
    it('shows the active FX bypass state on the track header', () => {
      renderHeader({ effectsBypassed: true });
      const bypassButton = screen.getByTitle(/Bypass all track effects \(P\).*active/i);
      expect(bypassButton).toHaveClass('bg-orange-600/90');
      expect(bypassButton.parentElement).toHaveClass('opacity-100');
    });
  });

  describe('track name visibility (#297)', () => {
    it('track display name text is visible in the DOM', () => {
      renderHeader({ displayName: 'My Cool Track' });
      expect(screen.getByText('My Cool Track')).toBeInTheDocument();
    });

    it('hidden secondary actions collapse layout space (max-w-0 overflow-hidden)', () => {
      renderHeader({ inputMonitoring: 'off', frozen: false });
      const monitorBtn = screen.getByTitle(/Input monitoring/);
      const container = monitorBtn.parentElement!;
      // When secondary actions are hidden, they must not consume layout width
      expect(container.classList.contains('max-w-0')).toBe(true);
      expect(container.classList.contains('overflow-hidden')).toBe(true);
    });

    it('visible secondary actions have layout space restored', () => {
      renderHeader({ inputMonitoring: 'on' });
      const monitorBtn = screen.getByTitle(/Input monitoring/);
      const container = monitorBtn.parentElement!;
      expect(container.classList.contains('max-w-0')).toBe(false);
      expect(container.classList.contains('overflow-hidden')).toBe(false);
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
