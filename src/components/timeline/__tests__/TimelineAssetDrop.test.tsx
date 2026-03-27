import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Timeline } from '../Timeline';
import { useProjectStore } from '../../../store/projectStore';

const importAssetAsNewTrack = vi.fn();
const importAssetAsQuickSampler = vi.fn();

vi.mock('../TrackLane', () => ({ TrackLane: () => null }));
vi.mock('../../tracks/TrackHeader', () => ({ TrackHeader: () => null }));
vi.mock('../../tracks/TrackListDisplayToggle', () => ({ TrackListDisplayToggle: () => null }));
vi.mock('../TimeRuler', () => ({ TimeRuler: () => null }));
vi.mock('../Playhead', () => ({ Playhead: () => null }));
vi.mock('../GridOverlay', () => ({ GridOverlay: () => null }));
vi.mock('../../generation/MultiTrackGenerateModal', () => ({ MultiTrackGenerateModal: () => null }));
vi.mock('../../generation/RegionRegenerateModal', () => ({ RegionRegenerateModal: () => null }));
vi.mock('../RegionContextMenu', () => ({ RegionContextMenu: () => null }));
vi.mock('../CanvasContextMenu', () => ({ CanvasContextMenu: () => null }));
vi.mock('../InlineSuggestionBadge', () => ({ InlineSuggestionBadge: () => null }));
vi.mock('../Minimap', () => ({ Minimap: () => null }));
vi.mock('../TempoLane', () => ({ TempoLane: () => null }));
vi.mock('../TimeSignatureLane', () => ({ TimeSignatureLane: () => null }));
vi.mock('../ArrangementMarkers', () => ({ ArrangementMarkers: () => null }));
vi.mock('../SelectionFloatingToolbar', () => ({ SelectionFloatingToolbar: () => null }));
vi.mock('../../../hooks/useNonPassiveWheel', () => ({ useNonPassiveWheel: () => vi.fn() }));
vi.mock('../../../hooks/useAudioImport', () => ({
  useAudioImport: () => ({
    importAudioFile: vi.fn(),
    importAudioToTrack: vi.fn(),
    importMultipleFiles: vi.fn(),
    importLoopToTrack: vi.fn(),
    importAssetToTrack: vi.fn(),
    importAudioFileAsNewQuickSampler: vi.fn(),
    importAssetAsQuickSampler,
    importAssetAsNewTrack,
  }),
}));
vi.mock('../../../services/projectStorage', () => ({ saveProject: vi.fn() }));
vi.mock('../../../utils/timelineCoords', () => ({ clientXToLaneX: vi.fn(() => 0) }));

describe('Timeline asset drop', () => {
  beforeEach(() => {
    importAssetAsNewTrack.mockReset();
    importAssetAsQuickSampler.mockReset();

    useProjectStore.getState().createProject();
    const project = useProjectStore.getState().project!;
    useProjectStore.setState({
      project: {
        ...project,
        totalDuration: 32,
        tracks: [],
        assets: [{
          id: 'asset-1',
          clipId: 'clip-1',
          trackDisplayName: 'Synth',
          prompt: 'Glass lead hook',
          source: 'generated',
          isolatedAudioKey: 'audio:isolated:lead',
          cumulativeMixKey: 'audio:cumulative:lead',
          waveformPeaks: [0.2, 0.6, 0.3],
          starred: false,
          createdAt: Date.now(),
          duration: 6,
        }],
      } as any,
    });
  });

  it('routes generated library asset drops through the generated-track restore path', async () => {
    render(<Timeline />);
    const emptyRow = screen.getByTestId('empty-row-0');

    const dataTransfer = {
      types: ['application/x-asset-id'],
      getData: vi.fn((type: string) => (type === 'application/x-asset-id' ? 'asset-1' : '')),
      files: { length: 0 },
      dropEffect: '',
    };

    fireEvent.dragEnter(emptyRow, { dataTransfer });
    fireEvent.drop(emptyRow, { dataTransfer, clientX: 0 });

    await waitFor(() => {
      expect(importAssetAsNewTrack).toHaveBeenCalledWith('asset-1', 0, { order: 1 });
    });
    expect(importAssetAsQuickSampler).not.toHaveBeenCalled();
  });
});
