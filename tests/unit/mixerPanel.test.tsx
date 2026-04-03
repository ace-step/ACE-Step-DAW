import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
  }),
}));

describe('MixerPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);

    useProjectStore.getState().createProject({ name: 'Mixer Layout Test' });
    useProjectStore.getState().addTrack('drums');
    useUIStore.getState().setShowMixer(true);
    useUIStore.getState().setMixerHeight(160);
  });

  it('keeps the master strip fader accessible at the minimum mixer height', () => {
    render(<MixerPanel />);

    expect(screen.getByRole('button', { name: 'Analyze mix for AI mastering' })).toBeInTheDocument();

    const masterFader = screen.getByRole('slider', { name: 'Master volume fader' });
    expect(masterFader).toBeInTheDocument();
    // VerticalFader uses absolute inset-0 to overlay the LevelMeter
    expect(masterFader).toHaveClass('absolute', 'inset-0');

    expect(screen.getByTestId('master-controls-region')).toHaveClass('overflow-y-auto');
    expect(screen.getByTestId('master-fader-region')).toHaveClass('min-h-[96px]');

    const trackFader = screen.getByRole('slider', { name: 'Drums volume fader' });
    expect(trackFader).toBeInTheDocument();
    expect(trackFader).toHaveClass('absolute', 'inset-0');
  });

  it('fader section does not shrink when mixer panel is small (#268)', () => {
    useUIStore.getState().setMixerHeight(160);
    render(<MixerPanel />);

    // Channel strip fader region must have shrink-0 to prevent clipping
    const trackStrips = screen.getAllByTestId('channel-strip');
    const faderRegion = trackStrips[0].querySelector('[data-testid="fader-region"]');
    expect(faderRegion).toBeInTheDocument();
    expect(faderRegion).toHaveClass('shrink-0');

    // Master fader region must also not shrink
    const masterFaderRegion = screen.getByTestId('master-fader-region');
    expect(masterFaderRegion).toHaveClass('shrink-0');
  });

  describe('channel strip visual density (#553)', () => {
    it('has a wider minimum channel width for readability', () => {
      render(<MixerPanel />);
      const strip = screen.getAllByTestId('channel-strip')[0];
      expect(strip).toHaveClass('min-w-[132px]');
    });

    it('groups controls into distinct visual sections with separators', () => {
      render(<MixerPanel />);
      const strip = screen.getAllByTestId('channel-strip')[0];

      // Verify section containers exist
      expect(strip.querySelector('[data-testid="channel-header"]')).toBeInTheDocument();
      expect(strip.querySelector('[data-testid="pan-section"]')).toBeInTheDocument();
      expect(strip.querySelector('[data-testid="inserts-section"]')).toBeInTheDocument();
      expect(strip.querySelector('[data-testid="sends-section"]')).toBeInTheDocument();
      expect(strip.querySelector('[data-testid="eq-section"]')).toBeInTheDocument();
      expect(strip.querySelector('[data-testid="comp-section"]')).toBeInTheDocument();
    });

    it('has visual separators between control sections', () => {
      render(<MixerPanel />);
      const strip = screen.getAllByTestId('channel-strip')[0];
      // The scrollable area should contain separator divs (gradient h-px elements)
      const scrollArea = strip.querySelector('.overflow-y-auto');
      expect(scrollArea).toBeInTheDocument();
      const separators = scrollArea!.querySelectorAll('.h-px');
      // There should be 4 separators: after pan, after inserts, after sends, after EQ
      expect(separators.length).toBe(4);
    });

    it('fader region has a top border separator', () => {
      render(<MixerPanel />);
      const faderRegion = screen.getAllByTestId('fader-region')[0];
      expect(faderRegion).toHaveClass('border-t');
      expect(faderRegion).toHaveClass('border-[#3a3a3a]');
    });
  });

  it('surfaces the active mixer scope and selected channel strip', () => {
    const bass = useProjectStore.getState().addTrack('bass');
    useUIStore.getState().setKeyboardContext('mixer', bass.id);

    render(<MixerPanel />);

    const bassStrip = screen.getByRole('group', { name: 'Mixer channel Bass' });
    fireEvent.focus(bassStrip);

    expect(screen.getByLabelText('Mixer navigation status')).toHaveTextContent('Scope: Mixer');
    expect(screen.getByLabelText('Mixer navigation status')).toHaveTextContent('Bass');
    expect(bassStrip).toHaveAttribute('aria-selected', 'true');
  });
});
