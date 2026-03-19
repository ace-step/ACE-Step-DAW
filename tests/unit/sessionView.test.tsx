import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SessionView } from '../../src/components/session/SessionView';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe.skip('SessionView', () => {
  beforeEach(() => {
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useProjectStore.getState().createProject();
  });

  it('renders a launch grid and triggers launch actions from the UI', async () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('synth', 'pianoRoll');
    store.addClip(track.id, {
      startTime: 0,
      duration: 2,
      prompt: 'Lead hook',
      globalCaption: '',
      lyrics: '',
      midiData: {
        notes: [{ id: 'note-1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 }],
        grid: '1/16',
      },
      source: 'uploaded',
    });

    render(<SessionView />);

    expect(screen.getByText('Session View clip launcher')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Launch scene 1' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Launch Lead hook on Synth in scene 1' }));

    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(useTransportStore.getState().launchedSessionClips[track.id]?.clipId).toBeTruthy();
  });
});
