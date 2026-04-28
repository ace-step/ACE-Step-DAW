import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ZoneMapEditor } from '../ZoneMapEditor';
import { useProjectStore } from '../../../store/projectStore';
import { createDefaultZone } from '../../../utils/sampleZones';
import type { Track, SamplerConfig, Project } from '../../../types/project';

function makeSamplerConfig(zones?: any[]): SamplerConfig {
  return {
    audioKey: 'primary',
    rootNote: 60,
    trimStart: 0,
    trimEnd: 1,
    playbackMode: 'classic' as const,
    loopStart: 0,
    loopEnd: 1,
    attack: 0.005,
    decay: 0.1,
    sustain: 1,
    release: 0.3,
    zones,
  };
}

function makeTrack(zones?: any[]): Track {
  return {
    id: 'track-1',
    displayName: 'Test Sampler',
    trackType: 'pianoRoll',
    color: '#ffffff',
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
    clips: [],
    laneHeight: 120,
    samplerConfig: makeSamplerConfig(zones),
  } as unknown as Track;
}

function setUpStore(zones?: any[]) {
  useProjectStore.setState({
    project: {
      id: 'proj-1',
      name: 'Test',
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      tracks: [makeTrack(zones)],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      clips: [],
      markers: [],
    } as unknown as Project,
  });
}

describe('ZoneMapEditor', () => {
  const mockLoadSample = vi.fn();

  beforeEach(() => {
    mockLoadSample.mockClear();
  });

  it('renders header with zone count', () => {
    const track = makeTrack();
    render(<ZoneMapEditor track={track} onLoadSampleForZone={mockLoadSample} />);
    expect(screen.getByText('Multi-Sample Zones (0)')).toBeTruthy();
  });

  it('renders with zones count', () => {
    const zones = [
      createDefaultZone('key-1', { id: 'z1' }),
      createDefaultZone('key-2', { id: 'z2' }),
    ];
    const track = makeTrack(zones);
    render(<ZoneMapEditor track={track} onLoadSampleForZone={mockLoadSample} />);
    expect(screen.getByText('Multi-Sample Zones (2)')).toBeTruthy();
  });

  it('toggles expanded state on header click', () => {
    const track = makeTrack();
    render(<ZoneMapEditor track={track} onLoadSampleForZone={mockLoadSample} />);

    const toggleBtn = screen.getByRole('button', { name: /toggle zone map editor/i });
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggleBtn);
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
    // Grid and Add Zone button should appear
    expect(screen.getByRole('button', { name: /add new sample zone/i })).toBeTruthy();
  });

  it('adds a zone when clicking Add Zone', () => {
    setUpStore();
    const track = makeTrack();
    render(<ZoneMapEditor track={track} onLoadSampleForZone={mockLoadSample} />);

    fireEvent.click(screen.getByRole('button', { name: /toggle zone map editor/i }));
    fireEvent.click(screen.getByRole('button', { name: /add new sample zone/i }));

    const updatedTrack = useProjectStore.getState().project!.tracks[0];
    expect(updatedTrack.samplerConfig!.zones).toHaveLength(1);
  });

  it('returns null when no samplerConfig', () => {
    const track = { ...makeTrack(), samplerConfig: undefined } as unknown as Track;
    const { container } = render(
      <ZoneMapEditor track={track} onLoadSampleForZone={mockLoadSample} />,
    );
    expect(container.innerHTML).toBe('');
  });
});
