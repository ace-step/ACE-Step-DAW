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

describe('ChannelStrip — Dynamic Inserts section', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    setupProject();
  });

  it('renders only an add-insert button when no effects exist', () => {
    render(<MixerPanel />);
    const strips = screen.getAllByTestId('channel-strip');
    const insertsSection = within(strips[0]).getByTestId('inserts-section');
    const slots = insertsSection.querySelectorAll('[data-testid^="insert-slot-"]');
    expect(slots).toHaveLength(0);
    expect(within(insertsSection).getByTestId('add-insert-btn')).toBeInTheDocument();
  });

  it('renders one insert slot per effect plus add button', () => {
    const tracks = useProjectStore.getState().project!.tracks;
    useProjectStore.getState().addTrackEffect(tracks[0].id, 'reverb');
    useProjectStore.getState().addTrackEffect(tracks[0].id, 'delay');
    render(<MixerPanel />);
    const strips = screen.getAllByTestId('channel-strip');
    const insertsSection = within(strips[0]).getByTestId('inserts-section');
    const slots = within(insertsSection).getAllByTestId(/^insert-slot-/);
    expect(slots).toHaveLength(2);
    expect(slots[0]).toHaveTextContent(/reverb/i);
    expect(slots[1]).toHaveTextContent(/delay/i);
    expect(within(insertsSection).getByTestId('add-insert-btn')).toBeInTheDocument();
  });

  it('shows effect name when an insert slot is populated', () => {
    const tracks = useProjectStore.getState().project!.tracks;
    useProjectStore.getState().addTrackEffect(tracks[0].id, 'reverb');
    render(<MixerPanel />);
    const strips = screen.getAllByTestId('channel-strip');
    const insertsSection = within(strips[0]).getByTestId('inserts-section');
    const slots = within(insertsSection).getAllByTestId(/^insert-slot-/);
    expect(slots[0]).toHaveTextContent(/reverb/i);
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

  it('adds an effect when the add-insert button is clicked', () => {
    render(<MixerPanel />);
    const strips = screen.getAllByTestId('channel-strip');
    const insertsSection = within(strips[0]).getByTestId('inserts-section');
    fireEvent.click(within(insertsSection).getByTestId('add-insert-btn'));
    const effects = useProjectStore.getState().project!.tracks[0].effects ?? [];
    expect(effects).toHaveLength(1);
  });

  it('removes an effect when the remove button on an insert slot is clicked', () => {
    const tracks = useProjectStore.getState().project!.tracks;
    useProjectStore.getState().addTrackEffect(tracks[0].id, 'reverb');
    useProjectStore.getState().addTrackEffect(tracks[0].id, 'delay');
    render(<MixerPanel />);
    const strips = screen.getAllByTestId('channel-strip');
    const insertsSection = within(strips[0]).getByTestId('inserts-section');
    const removeButtons = within(insertsSection).getAllByTestId(/^remove-insert-btn-/);
    expect(removeButtons).toHaveLength(2);
    fireEvent.click(removeButtons[0]);
    const effects = useProjectStore.getState().project!.tracks[0].effects ?? [];
    expect(effects).toHaveLength(1);
    expect(effects[0].type).toBe('delay');
  });

  it('allows more than 4 insert effects (no hardcoded limit)', () => {
    const tracks = useProjectStore.getState().project!.tracks;
    for (let i = 0; i < 6; i++) {
      useProjectStore.getState().addTrackEffect(tracks[0].id, 'reverb');
    }
    render(<MixerPanel />);
    const strips = screen.getAllByTestId('channel-strip');
    const insertsSection = within(strips[0]).getByTestId('inserts-section');
    const slots = within(insertsSection).getAllByTestId(/^insert-slot-/);
    expect(slots).toHaveLength(6);
  });

  it('disables add-insert button when track is frozen', () => {
    const track = useProjectStore.getState().project!.tracks[0];
    useProjectStore.getState().updateTrack(track.id, { frozen: true });
    render(<MixerPanel />);
    const strips = screen.getAllByTestId('channel-strip');
    const insertsSection = within(strips[0]).getByTestId('inserts-section');
    expect(within(insertsSection).getByTestId('add-insert-btn')).toBeDisabled();
  });
});

describe('ChannelStrip — Dynamic Sends section', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    setupProject();
  });

  it('renders one send slot per return track', () => {
    useProjectStore.getState().addReturnTrack('FX A');
    useProjectStore.getState().addReturnTrack('FX B');
    useProjectStore.getState().addReturnTrack('FX C');
    render(<MixerPanel />);
    const strips = screen.getAllByTestId('channel-strip');
    const sendsSection = within(strips[0]).getByTestId('sends-section');
    const slots = within(sendsSection).getAllByTestId(/^send-slot-/);
    expect(slots).toHaveLength(3);
  });

  it('shows no send slots when no return tracks exist, only add button', () => {
    render(<MixerPanel />);
    const strips = screen.getAllByTestId('channel-strip');
    const sendsSection = within(strips[0]).getByTestId('sends-section');
    const slots = sendsSection.querySelectorAll('[data-testid^="send-slot-"]');
    expect(slots).toHaveLength(0);
    expect(within(sendsSection).getByTestId('add-send-btn')).toBeInTheDocument();
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

  it('allows more than 2 sends (no hardcoded limit)', () => {
    for (let i = 0; i < 5; i++) {
      useProjectStore.getState().addReturnTrack(`FX ${String.fromCharCode(65 + i)}`);
    }
    render(<MixerPanel />);
    const strips = screen.getAllByTestId('channel-strip');
    const sendsSection = within(strips[0]).getByTestId('sends-section');
    const slots = within(sendsSection).getAllByTestId(/^send-slot-/);
    expect(slots).toHaveLength(5);
  });

  it('adds a return track when the add-send button is clicked', () => {
    render(<MixerPanel />);
    const strips = screen.getAllByTestId('channel-strip');
    const sendsSection = within(strips[0]).getByTestId('sends-section');
    fireEvent.click(within(sendsSection).getByTestId('add-send-btn'));
    const returnTracks = useProjectStore.getState().project!.returnTracks ?? [];
    expect(returnTracks.length).toBeGreaterThanOrEqual(1);
  });

  it('removes a return track when the remove button on a send slot is clicked', () => {
    useProjectStore.getState().addReturnTrack('FX A');
    useProjectStore.getState().addReturnTrack('FX B');
    render(<MixerPanel />);
    const strips = screen.getAllByTestId('channel-strip');
    const sendsSection = within(strips[0]).getByTestId('sends-section');
    const removeButtons = within(sendsSection).getAllByTestId(/^remove-send-btn-/);
    expect(removeButtons).toHaveLength(2);
    fireEvent.click(removeButtons[0]);
    const returnTracks = useProjectStore.getState().project!.returnTracks ?? [];
    expect(returnTracks).toHaveLength(1);
    expect(returnTracks[0].name).toBe('FX B');
  });

  it('has an add-send button at the end of the sends list', () => {
    useProjectStore.getState().addReturnTrack('FX A');
    render(<MixerPanel />);
    const strips = screen.getAllByTestId('channel-strip');
    const sendsSection = within(strips[0]).getByTestId('sends-section');
    expect(within(sendsSection).getByTestId('add-send-btn')).toBeInTheDocument();
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
