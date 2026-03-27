import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrackHeader } from '../TrackHeader';
import { useProjectStore } from '../../../store/projectStore';
import type { Track } from '../../../types/project';

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));
vi.mock('../../../hooks/useRecording', () => ({
  useRecording: () => ({
    armedTrackIds: [],
    toggleArmTrack: vi.fn(),
  }),
}));
vi.mock('../../../services/freezeTrack', () => ({
  freezeTrackToAudio: vi.fn(),
  flattenTrackToAudio: vi.fn(),
}));
vi.mock('../../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    getTrackLevel: () => 0,
  }),
}));

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    trackName: 'vocals',
    trackType: 'stems',
    displayName: 'Vocals',
    color: '#f43f5e',
    volume: 0.8,
    pan: 0,
    muted: false,
    soloed: false,
    armed: false,
    clips: [],
    laneHeight: 64,
    frozen: false,
    ...overrides,
  } as Track;
}

describe('TrackHeader fade-in animation', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  it('keeps the header row box stable while animating the inner content shell', () => {
    render(
      <TrackHeader
        track={makeTrack()}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDrop={vi.fn()}
        isDragOver={false}
        dragOverPosition={null}
      />
    );
    const header = screen.getByRole('button', { name: /Track: Vocals/i });
    const motionShell = screen.getByTestId('track-header-motion-shell');

    expect(header.className).not.toContain('animate-[fadeIn_150ms_ease-out]');
    expect(motionShell.className).toContain('animate-[fadeIn_150ms_ease-out]');
  });
});
