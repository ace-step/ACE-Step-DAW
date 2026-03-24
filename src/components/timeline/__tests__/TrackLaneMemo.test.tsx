import { describe, it, expect, vi } from 'vitest';
import React from 'react';

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

describe('TrackLane memoization', () => {
  it('is wrapped in React.memo', () => {
    // React.memo wraps the component — its $$typeof is REACT_MEMO_TYPE
    // and it exposes a .type property pointing to the inner component
    expect((TrackLane as any).$$typeof).toBe(Symbol.for('react.memo'));
  });
});
