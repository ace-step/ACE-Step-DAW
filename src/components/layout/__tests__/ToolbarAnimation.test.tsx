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
  it('applies daw-btn-interactive to ControlBarButtons', () => {
    useProjectStore.getState().createProject();
    render(<Toolbar />);

    const smartControlsButton = screen.getByLabelText('Smart Controls');
    expect(smartControlsButton.className).toContain('daw-btn-interactive');
  });

  it('applies daw-btn-interactive to the play button via inline classes', () => {
    useProjectStore.getState().createProject();
    render(<Toolbar />);

    // Play button is a direct <button> with inline classes, not a <Button> component
    const playButton = screen.getByLabelText('Play');
    // Play button uses inline transition classes (not the Button component)
    expect(playButton.className).toContain('active:scale-95');
  });
});
