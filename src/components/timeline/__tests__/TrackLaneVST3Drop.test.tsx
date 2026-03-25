import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock heavy child components to avoid pulling in complex dependencies
vi.mock('../ClipBlock', () => ({ ClipBlock: () => <div data-testid="clip-block" /> }));
vi.mock('../TakeLaneStrip', () => ({ TakeLaneStrip: () => null }));
vi.mock('../AutomationLaneView', () => ({ AutomationLaneView: () => null }));
vi.mock('../../generation/AddLayerModal', () => ({ AddLayerModal: () => null }));
vi.mock('../CanvasContextMenu', () => ({ CanvasContextMenu: () => null }));
vi.mock('../CrossfadeOverlay', () => ({ CrossfadeOverlay: () => null }));
vi.mock('../../../hooks/useAudioImport', () => ({
  useAudioImport: () => ({
    importAssetAsQuickSampler: vi.fn(),
    importAudioFileAsSampler: vi.fn(),
    importAudioFileAsNewQuickSampler: vi.fn(),
    importAudioToTrack: vi.fn(),
    importMidiFile: vi.fn(),
    importLoopToTrack: vi.fn(),
    importAssetToTrack: vi.fn(),
  }),
}));
vi.mock('../../../services/projectStorage', () => ({ saveProject: vi.fn() }));

import { TrackLane } from '../TrackLane';
import { useProjectStore } from '../../../store/projectStore';
import { useVST3Store } from '../../../store/vst3Store';
import type { Track } from '../../../types/project';

const TRACK: Track = {
  id: 'track-1',
  displayName: 'Test Track',
  trackName: 'custom',
  trackType: 'stems',
  color: '#5e59ff',
  volume: 0.8,
  pan: 0,
  muted: false,
  soloed: false,
  clips: [],
};

describe('TrackLane VST3 plugin drop', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: {
        id: 'proj-1',
        name: 'Test Project',
        bpm: 120,
        timeSignature: 4,
        timeSignatureDenominator: 4,
        totalDuration: 120,
        tracks: [TRACK],
        automationLanes: [],
      } as any,
    });

    useVST3Store.setState({
      connectionStatus: 'connected',
      plugins: [
        { id: 'plug-1', name: 'TestSynth', vendor: 'TestVendor', version: '1.0', subcategory: 'Synth', category: 'instrument' as const },
      ],
      scanning: false,
      scanProgress: null,
    });
  });

  it('accepts VST3 plugin drag over', () => {
    render(<TrackLane track={TRACK} />);
    const lane = screen.getByTestId(`track-lane-${TRACK.id}`);

    const dataTransfer = {
      types: ['application/x-vst3-plugin'],
      getData: vi.fn(() => 'plug-1'),
      dropEffect: '',
    };

    fireEvent.dragEnter(lane, { dataTransfer });
    fireEvent.dragOver(lane, { dataTransfer });

    // dragOver should set dropEffect to 'copy'
    expect(dataTransfer.dropEffect).toBe('copy');
  });

  it('shows highlight on VST3 plugin drag over', () => {
    render(<TrackLane track={TRACK} />);
    const lane = screen.getByTestId(`track-lane-${TRACK.id}`);

    const dataTransfer = {
      types: ['application/x-vst3-plugin'],
      getData: vi.fn(() => 'plug-1'),
      dropEffect: '',
    };

    fireEvent.dragEnter(lane, { dataTransfer });

    // Should have the blue highlight class for plugin drop
    expect(lane.className).toContain('bg-blue-900/20');
  });

  it('calls loadPlugin on drop with correct pluginId and trackId', async () => {
    const loadPluginSpy = vi.fn().mockResolvedValue(undefined);
    useVST3Store.setState({ loadPlugin: loadPluginSpy });

    render(<TrackLane track={TRACK} />);
    const lane = screen.getByTestId(`track-lane-${TRACK.id}`);

    const dataTransfer = {
      types: ['application/x-vst3-plugin'],
      getData: vi.fn((type: string) => (type === 'application/x-vst3-plugin' ? 'plug-1' : '')),
      files: { length: 0 },
      dropEffect: '',
    };

    fireEvent.dragEnter(lane, { dataTransfer });
    fireEvent.drop(lane, { dataTransfer });

    expect(loadPluginSpy).toHaveBeenCalledWith('plug-1', 'track-1');
  });
});
