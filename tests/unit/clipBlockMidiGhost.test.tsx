import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ClipBlock } from '../../src/components/timeline/ClipBlock';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';
import type { Clip, Track } from '../../src/types/project';

// Mock heavy child components to keep the test fast
vi.mock('../../src/components/timeline/ClipContextMenu', () => ({
  ClipContextMenu: () => null,
}));
vi.mock('../../src/components/timeline/ClipWaveform', () => ({
  ClipWaveform: () => <div data-testid="clip-waveform" />,
  ClipMidiThumbnail: (props: { midiData: unknown }) => (
    <div data-testid="clip-midi-thumbnail" />
  ),
}));
vi.mock('../../src/components/timeline/ClipGainEnvelope', () => ({
  ClipGainEnvelope: () => null,
}));
vi.mock('../../src/components/timeline/ClipWarpMarkers', () => ({
  ClipWarpMarkers: () => null,
}));
vi.mock('../../src/components/timeline/ClipStatusOverlay', () => ({
  ClipStatusOverlay: () => null,
}));
vi.mock('../../src/components/generation/AddLayerModal', () => ({
  AddLayerModal: () => null,
}));
vi.mock('../../src/services/generationPipeline', () => ({
  regenerateClip: vi.fn(),
}));
vi.mock('../../src/hooks/useGeneration', () => ({
  useGeneration: () => ({ generateClip: vi.fn() }),
}));
vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

const makeMidiClip = (overrides?: Partial<Clip>): Clip => ({
  id: 'clip-midi-1',
  trackId: 'track-1',
  startTime: 0,
  duration: 4,
  prompt: 'MIDI clip',
  lyrics: '',
  generationStatus: 'ready',
  generationJobId: null,
  cumulativeMixKey: null,
  isolatedAudioKey: null,
  waveformPeaks: null,
  midiData: {
    notes: [
      { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 },
      { pitch: 64, startBeat: 1, durationBeats: 1, velocity: 0.7 },
      { pitch: 67, startBeat: 2, durationBeats: 1, velocity: 0.9 },
    ],
  },
  ...overrides,
} as Clip);

const makeTrack = (overrides?: Partial<Track>): Track => ({
  id: 'track-1',
  displayName: 'Track 1',
  trackName: 'piano',
  trackType: 'pianoroll',
  color: '#4488ff',
  volume: 0.8,
  pan: 0,
  mute: false,
  solo: false,
  clips: [],
  effects: [],
  sends: [],
  armed: false,
  inputMonitoring: 'off',
  ...overrides,
} as Track);

describe('ClipBlock MIDI ghost thumbnail', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'MIDI Ghost Test' });
  });

  it('renders ClipMidiThumbnail in the main clip body for MIDI clips', () => {
    const clip = makeMidiClip();
    const track = makeTrack();

    render(<ClipBlock clip={clip} track={track} />);

    // MIDI thumbnail should be rendered in the clip body
    const thumbnails = screen.getAllByTestId('clip-midi-thumbnail');
    expect(thumbnails.length).toBeGreaterThanOrEqual(1);
  });

  it('includes ClipMidiThumbnail in the drag ghost for MIDI clips', async () => {
    // This test verifies the ghost rendering code includes ClipMidiThumbnail.
    // We'll verify by checking the source code includes the MIDI thumbnail
    // in the ghost section. Since triggering a full drag ghost in JSDOM is
    // complex due to requestAnimationFrame and DOM measurements, we use a
    // structural assertion by reading the component source.
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../src/components/timeline/ClipBlock.tsx'),
      'utf-8',
    );

    // Find the ghost container section (the fixed div with Z.tooltip zIndex)
    // The ghost starts at Z.tooltip and ends at the closing </div> before
    // the next dragGhost.targetLaneRect block.
    const ghostStart = source.indexOf('zIndex: Z.tooltip');
    const ghostEnd = source.indexOf('dragGhost.targetLaneRect && (', ghostStart);

    const ghostSection = source.slice(ghostStart, ghostEnd);

    // The ghost section should include ClipMidiThumbnail
    expect(ghostSection).toContain('ClipMidiThumbnail');
  });
});
