import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PianoRoll } from '../../src/components/pianoroll/PianoRoll';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';
import { useTransportStore } from '../../src/store/transportStore';

vi.mock('../../src/hooks/useAudioImport', () => ({
  useAudioImport: () => ({
    importAudioFileAsSampler: vi.fn(),
    importAssetAsQuickSampler: vi.fn(),
    openSamplerFilePicker: vi.fn(),
  }),
}));

vi.mock('../../src/components/pianoroll/PianoRollCanvas', () => ({
  PianoRollCanvas: ({
    activeTool,
    activeChordShapeAbbr,
    selectedNoteIds,
  }: {
    activeTool: string;
    activeChordShapeAbbr: string;
    selectedNoteIds: Set<string>;
  }) => (
    <div
      aria-label="Piano roll canvas stub"
      data-active-tool={activeTool}
      data-active-chord-shape={activeChordShapeAbbr}
      data-selected-note-ids={Array.from(selectedNoteIds).join(',')}
    >
      canvas
    </div>
  ),
}));

vi.mock('../../src/components/pianoroll/QuickSamplerEditor', () => ({
  QuickSamplerEditor: () => <div>sampler</div>,
}));

vi.mock('../../src/components/pianoroll/GeneratePatternDialog', () => ({
  GeneratePatternDialog: () => null,
}));

vi.mock('../../src/components/pianoroll/QuantizeDialog', () => ({
  QuantizeDialog: () => null,
}));

vi.mock('../../src/components/pianoroll/TransformMenu', () => ({
  TransformMenu: () => <div>transform</div>,
}));

describe('PianoRoll', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);

    useProjectStore.getState().createProject({ name: 'Piano Roll Tools' });
    const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    const clip = useProjectStore.getState().ensureMidiClip(track.id);
    useUIStore.getState().setOpenPianoRoll(track.id, clip.id);
  });

  it('renders four dedicated piano roll tool buttons with store-backed active state', () => {
    render(<PianoRoll />);

    expect(screen.getByLabelText('Activate select tool')).toBeInTheDocument();
    expect(screen.getByLabelText('Activate pencil tool')).toBeInTheDocument();
    expect(screen.getByLabelText('Activate paint tool')).toBeInTheDocument();
    expect(screen.getByLabelText('Activate erase tool')).toBeInTheDocument();
    expect(screen.queryByLabelText('Activate slide tool')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Activate paint tool'));

    expect(useUIStore.getState().activePianoRollTool).toBe('paint');
    expect(screen.getByLabelText('Piano roll tool status')).toHaveTextContent('Paint');
    expect(screen.getByLabelText('Piano roll canvas stub')).toHaveAttribute('data-active-tool', 'paint');
  });

  it('switches tools with 1-4 only while piano roll keyboard focus is active', () => {
    render(<PianoRoll />);

    const region = screen.getByRole('region');
    region.focus();

    fireEvent.keyDown(window, { key: '3', code: 'Digit3' });
    expect(useUIStore.getState().activePianoRollTool).toBe('paint');

    useUIStore.getState().setKeyboardContext('timeline', null);
    fireEvent.keyDown(window, { key: '4', code: 'Digit4' });
    expect(useUIStore.getState().activePianoRollTool).toBe('paint');

    useUIStore.getState().setKeyboardContext('pianoRoll', useUIStore.getState().openPianoRollTrackId);
    fireEvent.keyDown(window, { key: '4', code: 'Digit4' });
    expect(useUIStore.getState().activePianoRollTool).toBe('erase');
  });

  it('switches tools with ACE Studio single-key shortcuts while piano roll focus is active', () => {
    render(<PianoRoll />);

    const region = screen.getByRole('region');
    region.focus();

    fireEvent.keyDown(window, { key: 'b', code: 'KeyB' });
    expect(useUIStore.getState().activePianoRollTool).toBe('pencil');
    expect(screen.getByLabelText('Piano roll tool status')).toHaveTextContent('Pencil');

    fireEvent.keyDown(window, { key: 'x', code: 'KeyX' });
    expect(useUIStore.getState().activePianoRollTool).toBe('erase');
    expect(screen.getByLabelText('Piano roll tool status')).toHaveTextContent('Erase');

    fireEvent.keyDown(window, { key: 'v', code: 'KeyV' });
    expect(useUIStore.getState().activePianoRollTool).toBe('select');
    expect(screen.getByLabelText('Piano roll tool status')).toHaveTextContent('Select');

    useUIStore.getState().setKeyboardContext('timeline', null);
    fireEvent.keyDown(window, { key: 'b', code: 'KeyB' });
    expect(useUIStore.getState().activePianoRollTool).toBe('select');
  });

  it('lets the user select the active chord stamp shape for Shift-click placement', () => {
    render(<PianoRoll />);

    const chordShapeSelect = screen.getByLabelText('Piano roll chord shape');
    expect(chordShapeSelect).toHaveValue('maj');

    fireEvent.change(chordShapeSelect, { target: { value: '7' } });

    expect(useUIStore.getState().activePianoRollChordShape).toBe('7');
    expect(screen.getByText('Chord stamp:', { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('Piano roll canvas stub')).toHaveAttribute('data-active-chord-shape', '7');
  });

  it('shows the active piano roll scope and selected notes from store state', () => {
    const clipId = useUIStore.getState().openPianoRollClipId!;
    useProjectStore.getState().addMidiNote(clipId, {
      id: 'note-c4',
      pitch: 60,
      startBeat: 0,
      durationBeats: 1,
      velocity: 0.8,
    });
    useProjectStore.getState().addMidiNote(clipId, {
      id: 'note-e4',
      pitch: 64,
      startBeat: 1,
      durationBeats: 1,
      velocity: 0.8,
    });
    useUIStore.getState().setSelectedPianoRollNoteIds(['note-c4']);

    render(<PianoRoll />);

    expect(screen.getByLabelText('Piano roll tool status')).toHaveTextContent('Tool: Select');
    expect(screen.getByLabelText('Piano roll navigation status')).toHaveTextContent('Scope: Piano Roll');
    expect(screen.getByLabelText('Piano roll navigation status')).toHaveTextContent('1 note selected');
    expect(screen.getByLabelText('Piano roll canvas stub')).toHaveAttribute('data-selected-note-ids', 'note-c4');
  });
});
