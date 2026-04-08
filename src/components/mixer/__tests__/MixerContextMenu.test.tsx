import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MixerPanel } from '../MixerPanel';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    getTrackLevel: () => 0,
    getTrackMeter: () => ({ level: 0, leftLevel: 0, rightLevel: 0, clipped: false }),
    getMasterMeter: () => ({ level: 0, clipped: false }),
    resetTrackClip: vi.fn(),
    resetMasterClip: vi.fn(),
    masterVolume: 1,
    getMasterLevel: () => ({ left: 0, right: 0 }),
    getMasterInputLevel: () => ({ left: 0, right: 0 }),
    getAnalyserData: () => null,
  }),
}));

vi.mock('../SpectrumAnalyzer', () => ({
  SpectrumAnalyzer: () => null,
}));

function setup() {
  useProjectStore.getState().createProject();
  const track = useProjectStore.getState().addTrack('vocals');
  useUIStore.setState({ showMixer: true, mixerHeight: 500 });
  render(<MixerPanel />);
  return track;
}

describe('Mixer Channel Strip Context Menu', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('opens context menu on right-click of channel strip', () => {
    setup();
    const strip = screen.getAllByTestId('channel-strip')[0];
    fireEvent.contextMenu(strip);
    expect(screen.getByTestId('mixer-context-menu')).toBeInTheDocument();
  });

  it('shows Mute, Solo, FX Bypass, Freeze, Duplicate, Reset, Remove items', () => {
    setup();
    const strip = screen.getAllByTestId('channel-strip')[0];
    fireEvent.contextMenu(strip);

    expect(screen.getByText('Mute')).toBeInTheDocument();
    expect(screen.getByText('Solo')).toBeInTheDocument();
    expect(screen.getByText('Effects Bypass')).toBeInTheDocument();
    expect(screen.getByText('Freeze Track')).toBeInTheDocument();
    expect(screen.getByText('Duplicate Track')).toBeInTheDocument();
    expect(screen.getByText('Reset Channel Strip')).toBeInTheDocument();
    expect(screen.getByText('Remove Track')).toBeInTheDocument();
  });

  it('toggles mute when Mute is clicked', () => {
    const track = setup();
    const strip = screen.getAllByTestId('channel-strip')[0];
    fireEvent.contextMenu(strip);
    fireEvent.click(screen.getByText('Mute'));

    const updated = useProjectStore.getState().project!.tracks.find((t) => t.id === track.id)!;
    expect(updated.muted).toBe(true);
  });

  it('toggles solo when Solo is clicked', () => {
    const track = setup();
    const strip = screen.getAllByTestId('channel-strip')[0];
    fireEvent.contextMenu(strip);
    fireEvent.click(screen.getByText('Solo'));

    const updated = useProjectStore.getState().project!.tracks.find((t) => t.id === track.id)!;
    expect(updated.soloed).toBe(true);
  });

  it('resets channel strip when Reset is clicked', () => {
    const track = setup();
    useProjectStore.getState().updateTrackMixer(track.id, { eqLowGain: 5, compressorEnabled: true });
    useProjectStore.getState().addTrackEffect(track.id, 'reverb');

    const strip = screen.getAllByTestId('channel-strip')[0];
    fireEvent.contextMenu(strip);
    fireEvent.click(screen.getByText('Reset Channel Strip'));

    const updated = useProjectStore.getState().project!.tracks.find((t) => t.id === track.id)!;
    expect(updated.eqLowGain).toBe(0);
    expect(updated.compressorEnabled).toBe(false);
    expect(updated.effects).toEqual([]);
  });

  it('duplicates track when Duplicate is clicked', () => {
    setup();
    const strip = screen.getAllByTestId('channel-strip')[0];
    fireEvent.contextMenu(strip);
    fireEvent.click(screen.getByText('Duplicate Track'));

    expect(useProjectStore.getState().project!.tracks).toHaveLength(2);
  });

  it('removes track when Remove is clicked', () => {
    setup();
    const strip = screen.getAllByTestId('channel-strip')[0];
    fireEvent.contextMenu(strip);
    fireEvent.click(screen.getByText('Remove Track'));

    expect(useProjectStore.getState().project!.tracks).toHaveLength(0);
  });

  it('closes context menu after clicking an item', () => {
    setup();
    const strip = screen.getAllByTestId('channel-strip')[0];
    fireEvent.contextMenu(strip);
    expect(screen.getByTestId('mixer-context-menu')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Solo'));
    expect(screen.queryByTestId('mixer-context-menu')).toBeNull();
  });
});
