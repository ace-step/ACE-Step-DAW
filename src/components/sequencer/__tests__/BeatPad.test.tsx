import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BeatPad } from '../BeatPad';
import { useProjectStore } from '../../../store/projectStore';

vi.mock('../../../engine/DrumEngine', () => ({
  drumEngine: {
    ensureTrack: vi.fn().mockResolvedValue(undefined),
    syncTrackPadParams: vi.fn(),
    triggerPad: vi.fn(),
  },
  DRUM_PAD_NAMES: [
    'Kick', 'Snare', 'Closed HH', 'Open HH',
    'Low Tom', 'Mid Tom', 'High Tom', 'Clap',
    'Rim', 'Cowbell', 'Ride', 'Crash',
    'Shaker', 'Tamb', 'Clave', 'Conga',
  ],
  BEAT_PAD_KEYS: [
    'z', 'x', 'c', 'v',
    'a', 's', 'd', 'f',
    'q', 'w', 'e', 'r',
    '1', '2', '3', '4',
  ],
}));

function setupWithDrumTrack() {
  useProjectStore.getState().createProject();
  useProjectStore.getState().addTrack('drumMachine');
  const tracks = useProjectStore.getState().project!.tracks;
  return tracks[tracks.length - 1].id;
}

describe('BeatPad', () => {
  let trackId: string;

  beforeEach(() => {
    trackId = setupWithDrumTrack();
  });

  it('renders 16 pad buttons', async () => {
    await act(async () => {
      render(<BeatPad trackId={trackId} />);
    });
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(16);
  });

  it('renders pad names', async () => {
    await act(async () => {
      render(<BeatPad trackId={trackId} />);
    });
    expect(screen.getByText('Kick')).toBeInTheDocument();
    expect(screen.getByText('Snare')).toBeInTheDocument();
  });

  it('renders Beat Pads title', async () => {
    await act(async () => {
      render(<BeatPad trackId={trackId} />);
    });
    expect(screen.getByText('Beat Pads')).toBeInTheDocument();
  });

  it('renders keyboard shortcut labels', async () => {
    await act(async () => {
      render(<BeatPad trackId={trackId} />);
    });
    expect(screen.getByText('Z')).toBeInTheDocument();
    expect(screen.getByText('X')).toBeInTheDocument();
  });

  it('triggers pad on mouseDown', async () => {
    const { drumEngine } = await import('../../../engine/DrumEngine');
    await act(async () => {
      render(<BeatPad trackId={trackId} />);
    });
    // Allow ensureTrack promise to resolve
    await act(async () => {
      await vi.mocked(drumEngine.ensureTrack).mock.results[0]?.value;
    });
    vi.mocked(drumEngine.triggerPad).mockClear();
    const buttons = screen.getAllByRole('button');
    fireEvent.mouseDown(buttons[0]);
    expect(drumEngine.triggerPad).toHaveBeenCalledWith(
      trackId, 0, 100, '808', undefined,
    );
  });

  it('triggers pad on keyboard shortcut', async () => {
    const { drumEngine } = await import('../../../engine/DrumEngine');
    await act(async () => {
      render(<BeatPad trackId={trackId} />);
    });
    await act(async () => {
      await vi.mocked(drumEngine.ensureTrack).mock.results[0]?.value;
    });
    vi.mocked(drumEngine.triggerPad).mockClear();
    fireEvent.keyDown(window, { key: 'z' });
    expect(drumEngine.triggerPad).toHaveBeenCalledWith(
      trackId, 0, 100, '808', undefined,
    );
  });

  it('does not trigger on keyboard when input is focused', async () => {
    const { drumEngine } = await import('../../../engine/DrumEngine');
    await act(async () => {
      render(
        <div>
          <input data-testid="text-input" type="text" />
          <BeatPad trackId={trackId} />
        </div>,
      );
    });
    await act(async () => {
      await vi.mocked(drumEngine.ensureTrack).mock.results[0]?.value;
    });
    vi.mocked(drumEngine.triggerPad).mockClear();
    const input = screen.getByTestId('text-input') as HTMLInputElement;
    input.focus();
    // The BeatPad checks (e.target as HTMLElement).tagName === 'INPUT'
    // Fire keydown on the input element itself
    fireEvent.keyDown(input, { key: 'z' });
    expect(drumEngine.triggerPad).not.toHaveBeenCalled();
  });
});
