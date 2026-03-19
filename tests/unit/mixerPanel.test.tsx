import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    expect(masterFader).toHaveStyle({ minHeight: '96px', height: '100%' });

    expect(screen.getByTestId('master-controls-region')).toHaveClass('overflow-y-auto');
    expect(screen.getByTestId('master-fader-region')).toHaveClass('min-h-[96px]');

    const trackFader = screen.getByRole('slider', { name: 'Drums volume fader' });
    expect(trackFader).toBeInTheDocument();
    expect(trackFader).toHaveStyle({ minHeight: '96px', height: '100%' });
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
});
