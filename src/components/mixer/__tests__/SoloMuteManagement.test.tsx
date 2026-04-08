import { describe, it, expect, vi } from 'vitest';
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
  const t1 = useProjectStore.getState().addTrack('vocals');
  const t2 = useProjectStore.getState().addTrack('drums');
  useUIStore.setState({ showMixer: true, mixerHeight: 500 });
  return { t1, t2 };
}

describe('Solo/Mute Management UI', () => {
  it('shows "Clear Solos" button when any track is soloed', () => {
    const { t1 } = setup();
    useProjectStore.getState().updateTrack(t1.id, { soloed: true });
    render(<MixerPanel />);

    expect(screen.getByTestId('clear-all-solos-btn')).toBeInTheDocument();
  });

  it('hides "Clear Solos" button when no tracks are soloed', () => {
    setup();
    render(<MixerPanel />);

    expect(screen.queryByTestId('clear-all-solos-btn')).toBeNull();
  });

  it('clears all solos when "Clear Solos" button is clicked', () => {
    const { t1, t2 } = setup();
    useProjectStore.getState().updateTrack(t1.id, { soloed: true });
    useProjectStore.getState().updateTrack(t2.id, { soloed: true });
    render(<MixerPanel />);

    fireEvent.click(screen.getByTestId('clear-all-solos-btn'));

    const tracks = useProjectStore.getState().project!.tracks;
    expect(tracks.every((t) => !t.soloed)).toBe(true);
  });

  it('shows "Clear Mutes" button when any track is muted', () => {
    const { t1 } = setup();
    useProjectStore.getState().updateTrack(t1.id, { muted: true });
    render(<MixerPanel />);

    expect(screen.getByTestId('clear-all-mutes-btn')).toBeInTheDocument();
  });

  it('hides "Clear Mutes" button when no tracks are muted', () => {
    setup();
    render(<MixerPanel />);

    expect(screen.queryByTestId('clear-all-mutes-btn')).toBeNull();
  });

  it('clears all mutes when "Clear Mutes" button is clicked', () => {
    const { t1, t2 } = setup();
    useProjectStore.getState().updateTrack(t1.id, { muted: true });
    useProjectStore.getState().updateTrack(t2.id, { muted: true });
    render(<MixerPanel />);

    fireEvent.click(screen.getByTestId('clear-all-mutes-btn'));

    const tracks = useProjectStore.getState().project!.tracks;
    expect(tracks.every((t) => !t.muted)).toBe(true);
  });
});
