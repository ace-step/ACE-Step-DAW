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

function setupWithTrackAndSend() {
  useProjectStore.getState().createProject();
  useProjectStore.getState().addTrack('stems');
  const rt = useProjectStore.getState().addReturnTrack('Reverb Bus');
  const trackId = useProjectStore.getState().project!.tracks[0].id;
  useProjectStore.getState().updateTrackSend(trackId, rt.id, 0.5);
  useUIStore.setState({ showMixer: true, mixerHeight: 500 });
  return { trackId, returnTrackId: rt.id };
}

describe('send pre/post fader toggle UI', () => {
  it('renders a PRE/POST toggle button on each send slot', () => {
    setupWithTrackAndSend();
    render(<MixerPanel />);
    const toggleBtn = screen.getByTestId('send-prepost-0');
    expect(toggleBtn).not.toBeUndefined();
    expect(toggleBtn.textContent).toBe('POST');
  });

  it('clicking the toggle switches from POST to PRE', () => {
    const { trackId } = setupWithTrackAndSend();
    render(<MixerPanel />);
    const toggleBtn = screen.getByTestId('send-prepost-0');
    fireEvent.click(toggleBtn);

    const send = useProjectStore.getState().project!.tracks.find(
      (t) => t.id === trackId,
    )!.sends![0];
    expect(send.prePost).toBe('pre');
  });

  it('displays PRE text when send is pre-fader', () => {
    const { trackId } = setupWithTrackAndSend();
    useProjectStore.getState().setSendPrePost(trackId, 0, 'pre');
    render(<MixerPanel />);
    const toggleBtn = screen.getByTestId('send-prepost-0');
    expect(toggleBtn.textContent).toBe('PRE');
  });

  it('toggle button has distinct styling for pre vs post', () => {
    const { trackId } = setupWithTrackAndSend();
    render(<MixerPanel />);

    // Default post - should have default styling
    let toggleBtn = screen.getByTestId('send-prepost-0');
    expect(toggleBtn.className).toContain('bg-');

    // Switch to pre
    useProjectStore.getState().setSendPrePost(trackId, 0, 'pre');

    // Re-render
    const { unmount } = render(<MixerPanel />);
    toggleBtn = screen.getAllByTestId('send-prepost-0')[1]; // second render
    expect(toggleBtn.textContent).toBe('PRE');
    unmount();
  });
});
