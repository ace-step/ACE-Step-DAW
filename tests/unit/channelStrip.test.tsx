import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MixerPanel } from '../../src/components/mixer/MixerPanel';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../src/hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    masterVolume: 1,
    getMasterLevel: () => 0,
    getTrackLevel: () => 0,
    getMasterMeter: () => ({ level: 0, clipped: false }),
    getTrackMeter: () => ({ level: 0, clipped: false }),
    resetTrackClip: vi.fn(),
    resetMasterClip: vi.fn(),
  }),
}));

function setupProject() {
  useProjectStore.getState().createProject({ name: 'Channel Strip Test' });
  useProjectStore.getState().addTrack('drums');
  useUIStore.getState().setShowMixer(true);
  useUIStore.getState().setMixerHeight(500);
}

describe('ChannelStrip — Inserts section', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    setupProject();
  });

  it('renders 4 insert slots per channel strip', () => {
    render(<MixerPanel />);
    const strips = screen.getAllByTestId('channel-strip');
    expect(strips.length).toBeGreaterThanOrEqual(1);
    const insertsSection = within(strips[0]).getByTestId('inserts-section');
    const slots = within(insertsSection).getAllByTestId(/^insert-slot-/);
    expect(slots).toHaveLength(4);
  });

  it('shows effect name when an insert slot is populated', () => {
    const tracks = useProjectStore.getState().project!.tracks;
    useProjectStore.getState().addTrackEffect(tracks[0].id, 'reverb');
    render(<MixerPanel />);
    const strips = screen.getAllByTestId('channel-strip');
    const insertsSection = within(strips[0]).getByTestId('inserts-section');
    const slots = within(insertsSection).getAllByTestId(/^insert-slot-/);
    // First slot should show 'reverb'
    expect(slots[0]).toHaveTextContent(/reverb/i);
    // Remaining slots should show '+' or be empty
    expect(slots[1]).toHaveTextContent('+');
  });

  it('shows bypass state when effect is disabled', () => {
    const tracks = useProjectStore.getState().project!.tracks;
    const effectId = useProjectStore.getState().addTrackEffect(tracks[0].id, 'delay');
    useProjectStore.getState().updateTrackEffect(tracks[0].id, effectId!, { enabled: false });
    render(<MixerPanel />);
    const strips = screen.getAllByTestId('channel-strip');
    const insertsSection = within(strips[0]).getByTestId('inserts-section');
    const slot = within(insertsSection).getByTestId('insert-slot-0');
    expect(slot).toHaveClass('opacity-50');
  });

  it('dims the inserts section and shows an active FX bypass button when the track bypass is enabled', () => {
    const track = useProjectStore.getState().project!.tracks[0];
    useProjectStore.getState().addTrackEffect(track.id, 'reverb');
    useProjectStore.getState().toggleTrackEffectsBypass(track.id);

    render(<MixerPanel />);

    const strip = screen.getAllByTestId('channel-strip')[0];
    expect(within(strip).getByRole('button', { name: /fx bypass drums/i })).toHaveClass('bg-orange-500');
    expect(within(strip).getByTestId('inserts-section')).toHaveClass('opacity-45');
  });

  it('toggles track-wide FX bypass from the mixer channel button', () => {
    const track = useProjectStore.getState().project!.tracks[0];
    useProjectStore.getState().addTrackEffect(track.id, 'reverb');

    render(<MixerPanel />);

    fireEvent.click(screen.getByRole('button', { name: /fx bypass drums/i }));
    expect(useProjectStore.getState().project!.tracks[0].effectsBypassed).toBe(true);
  });

  it('keeps the FX bypass button visually compact beside mute and solo', () => {
    render(<MixerPanel />);

    const fxButton = screen.getByRole('button', { name: /fx bypass drums/i });
    expect(fxButton).toHaveClass('h-[18px]');
    expect(fxButton).toHaveClass('min-w-[26px]');
    expect(fxButton).toHaveClass('rounded-sm');
    expect(fxButton).toHaveClass('text-[9px]');
  });
});

describe('ChannelStrip — Sends section', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    setupProject();
  });

  it('renders 2 send slots per channel strip', () => {
    render(<MixerPanel />);
    const strips = screen.getAllByTestId('channel-strip');
    const sendsSection = within(strips[0]).getByTestId('sends-section');
    const slots = within(sendsSection).getAllByTestId(/^send-slot-/);
    expect(slots).toHaveLength(2);
  });

  it('shows send amount when a return track exists and send is active', () => {
    const tracks = useProjectStore.getState().project!.tracks;
    const rt = useProjectStore.getState().addReturnTrack('FX A');
    useProjectStore.getState().updateTrackSend(tracks[0].id, rt.id, 0.5);
    render(<MixerPanel />);
    const strips = screen.getAllByTestId('channel-strip');
    const sendsSection = within(strips[0]).getByTestId('sends-section');
    const slot = within(sendsSection).getByTestId('send-slot-0');
    expect(slot).toHaveTextContent(/FX A/i);
  });

  it('shows empty send slots when no return tracks exist', () => {
    render(<MixerPanel />);
    const strips = screen.getAllByTestId('channel-strip');
    const sendsSection = within(strips[0]).getByTestId('sends-section');
    const slots = within(sendsSection).getAllByTestId(/^send-slot-/);
    expect(slots[0]).toHaveTextContent('—');
    expect(slots[1]).toHaveTextContent('—');
  });
});

describe('ChannelStrip — Accessibility & data attributes', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    setupProject();
  });

  it('each channel strip has data-track-id attribute', () => {
    render(<MixerPanel />);
    const strips = screen.getAllByTestId('channel-strip');
    const tracks = useProjectStore.getState().project!.tracks;
    expect(strips[0]).toHaveAttribute('data-track-id', tracks[0].id);
  });

  it('mute and solo buttons have accessible names', () => {
    render(<MixerPanel />);
    expect(screen.getByRole('button', { name: /mute drums/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /solo drums/i })).toBeInTheDocument();
  });

  it('volume fader has accessible label', () => {
    render(<MixerPanel />);
    expect(screen.getByRole('slider', { name: 'Drums volume fader' })).toBeInTheDocument();
  });

  it('pan knob section is labeled', () => {
    render(<MixerPanel />);
    const strips = screen.getAllByTestId('channel-strip');
    // Pan knob should exist
    expect(within(strips[0]).getByText('Pan')).toBeInTheDocument();
  });
});
