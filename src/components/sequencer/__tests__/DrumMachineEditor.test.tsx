import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DrumMachineEditor } from '../DrumMachineEditor';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';

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

vi.mock('../../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    ctx: { decodeAudioData: vi.fn().mockResolvedValue({}) },
    resume: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../../services/sampleManager', () => ({
  cacheUserSample: vi.fn(),
}));

vi.mock('../../../hooks/useNonPassiveWheel', () => ({
  useNonPassiveWheel: () => () => {},
}));

function setupDrumMachineEditor() {
  useProjectStore.getState().createProject();
  useProjectStore.getState().addTrack('drumMachine');
  const tracks = useProjectStore.getState().project!.tracks;
  const drumTrack = tracks[tracks.length - 1];
  useUIStore.setState({
    openDrumMachineTrackId: drumTrack.id,
    drumMachineEditorHeight: 400,
  });
  return drumTrack.id;
}

describe('DrumMachineEditor', () => {
  let trackId: string;

  beforeEach(() => {
    trackId = setupDrumMachineEditor();
  });

  it('renders nothing when no track is open', async () => {
    useUIStore.setState({ openDrumMachineTrackId: null });
    const { container } = await act(async () => render(<DrumMachineEditor />));
    expect(container.innerHTML).toBe('');
  });

  it('renders Drum Machine header', async () => {
    await act(async () => {
      render(<DrumMachineEditor />);
    });
    expect(screen.getByText('Drum Machine')).toBeInTheDocument();
  });

  it('renders track name', async () => {
    await act(async () => {
      render(<DrumMachineEditor />);
    });
    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    expect(screen.getByText(track.displayName)).toBeInTheDocument();
  });

  it('renders 16 pad buttons', async () => {
    await act(async () => {
      render(<DrumMachineEditor />);
    });
    const pads = screen.getAllByRole('button').filter(
      (btn) => btn.getAttribute('data-pad-index') !== null,
    );
    expect(pads).toHaveLength(16);
  });

  it('renders kit selector with 808 default', async () => {
    await act(async () => {
      render(<DrumMachineEditor />);
    });
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect((select as HTMLSelectElement).value).toBe('808');
  });

  it('renders all kit options', async () => {
    await act(async () => {
      render(<DrumMachineEditor />);
    });
    expect(screen.getByText('808')).toBeInTheDocument();
    expect(screen.getByText('Acoustic')).toBeInTheDocument();
    expect(screen.getByText('Electronic')).toBeInTheDocument();
    expect(screen.getByText('Lo-Fi')).toBeInTheDocument();
  });

  it('shows pad detail panel placeholder when no pad selected', async () => {
    await act(async () => {
      render(<DrumMachineEditor />);
    });
    expect(screen.getByText('Click a pad to see its details')).toBeInTheDocument();
  });

  it('renders close button', async () => {
    await act(async () => {
      render(<DrumMachineEditor />);
    });
    const closeBtn = screen.getByTitle('Close');
    expect(closeBtn).toBeInTheDocument();
  });

  it('closes editor when clicking close', async () => {
    await act(async () => {
      render(<DrumMachineEditor />);
    });
    fireEvent.click(screen.getByTitle('Close'));
    expect(useUIStore.getState().openDrumMachineTrackId).toBeNull();
  });

  it('renders velocity hint text', async () => {
    await act(async () => {
      render(<DrumMachineEditor />);
    });
    expect(screen.getByText(/Velocity: click higher/)).toBeInTheDocument();
  });

  it('renders keyboard shortcut hints', async () => {
    await act(async () => {
      render(<DrumMachineEditor />);
    });
    expect(screen.getByText(/Keys: Z-V, A-F, Q-R, 1-4/)).toBeInTheDocument();
  });

  it('triggers pad and shows details on click', async () => {
    const { drumEngine } = await import('../../../engine/DrumEngine');
    await act(async () => {
      render(<DrumMachineEditor />);
    });
    const pads = screen.getAllByRole('button').filter(
      (btn) => btn.getAttribute('data-pad-index') !== null,
    );
    fireEvent.mouseDown(pads[0]);
    expect(drumEngine.triggerPad).toHaveBeenCalled();
  });

  it('has resize handle', async () => {
    await act(async () => {
      render(<DrumMachineEditor />);
    });
    const resizeHandle = screen.getByText('Drum Machine')
      .closest('[style]')!
      .parentElement!
      .querySelector('.cursor-row-resize');
    expect(resizeHandle).toBeInTheDocument();
  });

  it('renders Load Sample button in detail panel when pad selected', async () => {
    await act(async () => {
      render(<DrumMachineEditor />);
    });
    // Click a pad to select it
    const pads = screen.getAllByRole('button').filter(
      (btn) => btn.getAttribute('data-pad-index') !== null,
    );
    fireEvent.mouseDown(pads[0]);
    expect(screen.getByText('Load Sample...')).toBeInTheDocument();
  });
});
