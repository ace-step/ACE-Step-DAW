import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toolbar } from '../Toolbar';
import { useProjectStore } from '../../../store/projectStore';

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../../hooks/useAudioEngine', () => ({
  useAudioEngine: () => ({
    resumeOnGesture: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useTransport', () => ({
  useTransport: () => ({
    isPlaying: false,
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useRecording', () => ({
  useRecording: () => ({
    toggleRecord: vi.fn(),
    armedTrackIds: [],
    toggleArmTrack: vi.fn(),
  }),
}));

vi.mock('../../../services/midiCaptureService', () => ({
  getMidiCaptureService: () => ({
    getBufferedNotes: () => [],
  }),
}));

describe('Toolbar button micro-animations', () => {
  it('applies active:scale-95 and transition duration to ControlBarButtons', () => {
    useProjectStore.getState().createProject();
    render(<Toolbar />);

    const smartControlsButton = screen.getByLabelText('Smart Controls');
    expect(smartControlsButton.className).toContain('active:scale-95');
    expect(smartControlsButton.className).toContain('duration-150');
  });

  it('applies active:scale-95 to the play button', () => {
    useProjectStore.getState().createProject();
    render(<Toolbar />);

    const playButton = screen.getByTitle('Play (Space)');
    expect(playButton.className).toContain('active:scale-95');
    expect(playButton.className).toContain('duration-150');
  });
});
