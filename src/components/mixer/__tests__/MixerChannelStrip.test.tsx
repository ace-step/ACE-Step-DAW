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

function setupWithTrack() {
  useProjectStore.getState().createProject();
  useProjectStore.getState().addTrack('stems');
  useUIStore.setState({ showMixer: true, mixerHeight: 500 });
}

describe('Channel strip improvements', () => {
  describe('solo/mute visual states', () => {
    it('mute button has red background when muted', () => {
      setupWithTrack();
      const tracks = useProjectStore.getState().project!.tracks;
      useProjectStore.getState().updateTrack(tracks[0].id, { muted: true });

      render(<MixerPanel />);
      const muteBtn = screen.getAllByTestId('mute-btn')[0];
      expect(muteBtn.className).toContain('bg-red-500');
      expect(muteBtn.getAttribute('aria-pressed')).toBe('true');
    });

    it('mute button has default background when not muted', () => {
      setupWithTrack();
      render(<MixerPanel />);
      const muteBtn = screen.getAllByTestId('mute-btn')[0];
      expect(muteBtn.className).toContain('bg-[#444]');
      expect(muteBtn.getAttribute('aria-pressed')).toBe('false');
    });

    it('solo button has yellow background when soloed', () => {
      setupWithTrack();
      const tracks = useProjectStore.getState().project!.tracks;
      useProjectStore.getState().updateTrack(tracks[0].id, { soloed: true });

      render(<MixerPanel />);
      const soloBtn = screen.getAllByTestId('solo-btn')[0];
      expect(soloBtn.className).toContain('bg-amber-400');
      expect(soloBtn.getAttribute('aria-pressed')).toBe('true');
    });

    it('solo button has default background when not soloed', () => {
      setupWithTrack();
      render(<MixerPanel />);
      const soloBtn = screen.getAllByTestId('solo-btn')[0];
      expect(soloBtn.className).toContain('bg-[#444]');
      expect(soloBtn.getAttribute('aria-pressed')).toBe('false');
    });

    it('clicking mute toggles muted state', () => {
      setupWithTrack();
      render(<MixerPanel />);
      const muteBtn = screen.getAllByTestId('mute-btn')[0];
      fireEvent.click(muteBtn);
      const track = useProjectStore.getState().project!.tracks[0];
      expect(track.muted).toBe(true);
    });

    it('clicking solo toggles soloed state', () => {
      setupWithTrack();
      render(<MixerPanel />);
      const soloBtn = screen.getAllByTestId('solo-btn')[0];
      fireEvent.click(soloBtn);
      const track = useProjectStore.getState().project!.tracks[0];
      expect(track.soloed).toBe(true);
    });
  });

  describe('double-click to rename', () => {
    it('shows rename input on double-click', () => {
      setupWithTrack();
      render(<MixerPanel />);
      const nameEl = screen.getAllByTestId('channel-name')[0];
      fireEvent.doubleClick(nameEl);
      const input = screen.getByTestId('channel-rename-input'); // getBy* throws if not found
      expect((input as HTMLInputElement).value).toBe(
        useProjectStore.getState().project!.tracks[0].displayName,
      );
    });

    it('commits rename on Enter key', () => {
      setupWithTrack();
      render(<MixerPanel />);
      const nameEl = screen.getAllByTestId('channel-name')[0];
      fireEvent.doubleClick(nameEl);
      const input = screen.getByTestId('channel-rename-input');
      fireEvent.change(input, { target: { value: 'NewName' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      const track = useProjectStore.getState().project!.tracks[0];
      expect(track.displayName).toBe('NewName');
    });

    it('cancels rename on Escape key', () => {
      setupWithTrack();
      const originalName = useProjectStore.getState().project!.tracks[0].displayName;
      render(<MixerPanel />);
      const nameEl = screen.getAllByTestId('channel-name')[0];
      fireEvent.doubleClick(nameEl);
      const input = screen.getByTestId('channel-rename-input');
      fireEvent.change(input, { target: { value: 'Discarded' } });
      fireEvent.keyDown(input, { key: 'Escape' });
      const track = useProjectStore.getState().project!.tracks[0];
      expect(track.displayName).toBe(originalName);
    });

    it('commits rename on blur', () => {
      setupWithTrack();
      render(<MixerPanel />);
      const nameEl = screen.getAllByTestId('channel-name')[0];
      fireEvent.doubleClick(nameEl);
      const input = screen.getByTestId('channel-rename-input');
      fireEvent.change(input, { target: { value: 'BlurName' } });
      fireEvent.blur(input);
      const track = useProjectStore.getState().project!.tracks[0];
      expect(track.displayName).toBe('BlurName');
    });

    it('does not rename if value is empty after trim', () => {
      setupWithTrack();
      const originalName = useProjectStore.getState().project!.tracks[0].displayName;
      render(<MixerPanel />);
      const nameEl = screen.getAllByTestId('channel-name')[0];
      fireEvent.doubleClick(nameEl);
      const input = screen.getByTestId('channel-rename-input');
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      const track = useProjectStore.getState().project!.tracks[0];
      expect(track.displayName).toBe(originalName);
    });
  });

  describe('track color strip', () => {
    it('renders color strip with track color', () => {
      setupWithTrack();
      render(<MixerPanel />);
      const strip = screen.getAllByTestId('track-color-strip-top')[0];
      // backgroundColor is set via inline style; jsdom converts hex to rgb
      expect(strip.style.backgroundColor).not.toBe('');
      // Verify it's actually a color value (not empty)
      expect(strip.style.backgroundColor.length).toBeGreaterThan(0);
    });
  });

  describe('group track effects support', () => {
    function setupWithGroupTrack() {
      useProjectStore.getState().createProject();
      const group = useProjectStore.getState().createGroupTrack('Bus A');
      useUIStore.setState({ showMixer: true, mixerHeight: 500 });
      return group;
    }

    function getGroupStrip(trackId: string): HTMLElement {
      const strips = screen.getAllByTestId('channel-strip');
      const strip = strips.find((el) => el.getAttribute('data-track-id') === trackId);
      expect(strip).not.toBeUndefined();
      return strip!;
    }

    it('renders FX bypass button on group track channel strip', () => {
      const group = setupWithGroupTrack();
      render(<MixerPanel />);
      const groupStrip = getGroupStrip(group.id);
      const fxBtn = groupStrip.querySelector('[aria-label*="FX bypass"]');
      expect(fxBtn).not.toBeNull();
    });

    it('renders inserts section on group track channel strip', () => {
      const group = setupWithGroupTrack();
      render(<MixerPanel />);
      const groupStrip = getGroupStrip(group.id);
      const insertsSection = groupStrip.querySelector('[data-testid="inserts-section"]');
      expect(insertsSection).not.toBeNull();
    });

    it('can add an effect insert to a group track', () => {
      const group = setupWithGroupTrack();
      render(<MixerPanel />);
      const groupStrip = getGroupStrip(group.id);
      const addBtn = groupStrip.querySelector('[data-testid="add-insert-btn"]');
      expect(addBtn).not.toBeNull();
      fireEvent.click(addBtn!);
      const updatedGroup = useProjectStore.getState().project!.tracks.find((t) => t.id === group.id);
      expect(updatedGroup!.effects).toHaveLength(1);
      expect(updatedGroup!.effects![0].type).toBe('reverb');
    });

    it('toggles FX bypass on group track', () => {
      const group = setupWithGroupTrack();
      useProjectStore.getState().addTrackEffect(group.id, 'compressor');
      render(<MixerPanel />);
      const groupStrip = getGroupStrip(group.id);
      const fxBtn = groupStrip.querySelector('[aria-label*="FX bypass"]') as HTMLButtonElement;
      expect(fxBtn).not.toBeNull();
      fireEvent.click(fxBtn);
      const updatedGroup = useProjectStore.getState().project!.tracks.find((t) => t.id === group.id);
      expect(updatedGroup!.effectsBypassed).toBe(true);
    });
  });

  describe('master channel strip', () => {
    it('renders master strip with data-testid', () => {
      setupWithTrack();
      render(<MixerPanel />);
      screen.getByTestId('master-strip'); // getBy* throws if not found
    });

    it('renders master label text', () => {
      setupWithTrack();
      render(<MixerPanel />);
      screen.getByText('Master'); // getBy* throws if not found
    });

    it('renders IN and OUT meter labels', () => {
      setupWithTrack();
      render(<MixerPanel />);
      screen.getByText('IN'); // getBy* throws if not found
      screen.getByText('OUT');
    });
  });
});
