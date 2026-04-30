import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useProjectStore } from '../../../store/projectStore';
import { SessionMixer } from '../SessionMixer';
import { SessionMixerStrip } from '../SessionMixerStrip';

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../../hooks/useAudioEngine', () => ({
  getTauriPlaybackClockOwner: () => 'web-audio',
  getAudioEngine: () => ({
    getTrackMeter: () => ({ leftLevel: 0, rightLevel: 0, clipped: false }),
    getTrackLevel: () => 0,
    resetTrackClip: vi.fn(),
    masterVolume: 1,
    getMasterLevel: () => ({ left: 0, right: 0 }),
    getMasterInputLevel: () => ({ left: 0, right: 0 }),
    getAnalyserData: () => null,
  }),
}));

function setupProjectWithTrack() {
  useProjectStore.getState().createProject();
  useProjectStore.getState().addTrack('stems');
}

describe('SessionMixerStrip', () => {
  it('renders volume fader for the given track', () => {
    render(
      <SessionMixerStrip
        trackId="track-1"
        trackName="Vocals"
        trackColor="#ff5555"
        volume={0.8}
        pan={0}
        muted={false}
        soloed={false}
      />
    );

    expect(screen.getByRole('slider', { name: /volume/i })).toBeInTheDocument();
  });

  it('renders pan knob', () => {
    render(
      <SessionMixerStrip
        trackId="track-1"
        trackName="Vocals"
        trackColor="#ff5555"
        volume={0.8}
        pan={0}
        muted={false}
        soloed={false}
      />
    );

    expect(screen.getByLabelText(/pan knob/i)).toBeInTheDocument();
  });

  it('renders solo and mute buttons', () => {
    render(
      <SessionMixerStrip
        trackId="track-1"
        trackName="Vocals"
        trackColor="#ff5555"
        volume={0.8}
        pan={0}
        muted={false}
        soloed={false}
      />
    );

    expect(screen.getByRole('button', { name: /solo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mute/i })).toBeInTheDocument();
  });

  it('calls onVolumeChange when fader is interacted with', () => {
    const onVolumeChange = vi.fn();

    render(
      <SessionMixerStrip
        trackId="track-1"
        trackName="Vocals"
        trackColor="#ff5555"
        volume={0.8}
        pan={0}
        muted={false}
        soloed={false}
        onVolumeChange={onVolumeChange}
      />
    );

    const fader = screen.getByRole('slider', { name: /volume/i });
    fireEvent.pointerDown(fader, { clientX: 50 });
    expect(onVolumeChange).toHaveBeenCalled();
  });

  it('calls onMuteToggle when M button is clicked', () => {
    const onMuteToggle = vi.fn();

    render(
      <SessionMixerStrip
        trackId="track-1"
        trackName="Vocals"
        trackColor="#ff5555"
        volume={0.8}
        pan={0}
        muted={false}
        soloed={false}
        onMuteToggle={onMuteToggle}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /mute/i }));
    expect(onMuteToggle).toHaveBeenCalled();
  });

  it('calls onSoloToggle when S button is clicked', () => {
    const onSoloToggle = vi.fn();

    render(
      <SessionMixerStrip
        trackId="track-1"
        trackName="Vocals"
        trackColor="#ff5555"
        volume={0.8}
        pan={0}
        muted={false}
        soloed={false}
        onSoloToggle={onSoloToggle}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /solo/i }));
    expect(onSoloToggle).toHaveBeenCalled();
  });

  it('shows active state on solo button when track is soloed', () => {
    render(
      <SessionMixerStrip
        trackId="track-1"
        trackName="Vocals"
        trackColor="#ff5555"
        volume={0.8}
        pan={0}
        muted={false}
        soloed={true}
      />
    );

    const soloBtn = screen.getByRole('button', { name: /solo/i });
    expect(soloBtn.className).toContain('bg-amber-400');
  });

  it('shows active state on mute button when track is muted', () => {
    render(
      <SessionMixerStrip
        trackId="track-1"
        trackName="Vocals"
        trackColor="#ff5555"
        volume={0.8}
        pan={0}
        muted={true}
        soloed={false}
      />
    );

    const muteBtn = screen.getByRole('button', { name: /mute/i });
    expect(muteBtn.className).toContain('bg-red-500');
  });

  it('shows track color accent on left edge', () => {
    const { container } = render(
      <SessionMixerStrip
        trackId="track-1"
        trackName="Vocals"
        trackColor="#ff5555"
        volume={0.8}
        pan={0}
        muted={false}
        soloed={false}
      />
    );

    const colorAccent = container.querySelector('[data-testid="track-color-accent"]');
    expect(colorAccent).toBeInTheDocument();
    // JSDOM converts hex colors to rgb() format
    expect(colorAccent!.getAttribute('style')).toContain('background-color');
  });
});

describe('SessionMixer', () => {
  beforeEach(() => {
    setupProjectWithTrack();
  });

  it('renders a mixer strip for each track when visible', () => {
    const project = useProjectStore.getState().project!;

    render(<SessionMixer visible={true} onToggle={() => {}} />);

    for (const track of project.tracks) {
      expect(screen.getByTestId(`session-mixer-strip-${track.id}`)).toBeInTheDocument();
    }
  });

  it('does not render strips when hidden', () => {
    render(<SessionMixer visible={false} onToggle={() => {}} />);

    const mixer = screen.getByTestId('session-mixer');
    // The inner container should have height 0
    const container = mixer.querySelector('.overflow-hidden');
    expect(container).toBeInTheDocument();
    expect((container as HTMLElement).style.height).toBe('0px');
  });

  it('calls onToggle when toggle button is clicked', () => {
    const onToggle = vi.fn();
    render(<SessionMixer visible={true} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole('button', { name: /mixer/i }));
    expect(onToggle).toHaveBeenCalled();
  });

  it('updates store when volume is changed on a strip', () => {
    render(<SessionMixer visible={true} onToggle={() => {}} />);

    const project = useProjectStore.getState().project!;
    const track = project.tracks[0];
    const fader = screen.getAllByRole('slider', { name: /volume/i })[0];

    // Simulate fader interaction
    const rect = { left: 0, width: 100, top: 0, bottom: 14, height: 14, right: 100, x: 0, y: 0, toJSON: () => {} };
    vi.spyOn(fader, 'getBoundingClientRect').mockReturnValue(rect as DOMRect);
    fireEvent.pointerDown(fader, { clientX: 50 });

    const updatedTrack = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
    expect(updatedTrack.volume).toBeCloseTo(0.5, 1);
  });

  it('updates store when mute is toggled', () => {
    render(<SessionMixer visible={true} onToggle={() => {}} />);

    const project = useProjectStore.getState().project!;
    const track = project.tracks[0];
    const initialMuted = track.muted;

    const muteButtons = screen.getAllByRole('button', { name: /mute/i });
    fireEvent.click(muteButtons[0]);

    const updatedTrack = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
    expect(updatedTrack.muted).toBe(!initialMuted);
  });

  it('updates store when solo is toggled', () => {
    render(<SessionMixer visible={true} onToggle={() => {}} />);

    const project = useProjectStore.getState().project!;
    const track = project.tracks[0];
    const initialSoloed = track.soloed;

    const soloButtons = screen.getAllByRole('button', { name: /solo/i });
    fireEvent.click(soloButtons[0]);

    const updatedTrack = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
    expect(updatedTrack.soloed).toBe(!initialSoloed);
  });
});
