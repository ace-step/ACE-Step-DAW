import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PianoRollCanvas } from '../../src/components/pianoroll/PianoRollCanvas';
import type { Clip, MidiNote, Track } from '../../src/types/project';

const mockAddMidiNote = vi.fn();
const mockStampChord = vi.fn();
const mockRemoveMidiNote = vi.fn();
const mockUpdateMidiNote = vi.fn();
const mockResizeMidiNote = vi.fn();
const mockQuantizeMidiNotes = vi.fn();
const mockBeginDrag = vi.fn();
const mockEndDrag = vi.fn();
const mockOpenQuantizeDialog = vi.fn();

// Mock stores
vi.mock('../../src/store/projectStore', () => ({
  useProjectStore: vi.fn((selector) => {
    const state: Record<string, unknown> = {
      addMidiNote: mockAddMidiNote,
      stampChord: mockStampChord,
      removeMidiNote: mockRemoveMidiNote,
      updateMidiNote: mockUpdateMidiNote,
      resizeMidiNote: mockResizeMidiNote,
      quantizeMidiNotes: mockQuantizeMidiNotes,
      beginDrag: mockBeginDrag,
      endDrag: mockEndDrag,
      project: { bpm: 120 },
    };
    return selector(state);
  }),
}));

vi.mock('../../src/store/uiStore', () => ({
  useUIStore: vi.fn((selector) => {
    const state: Record<string, unknown> = {
      openQuantizeDialog: mockOpenQuantizeDialog,
    };
    return selector(state);
  }),
}));

vi.mock('../../src/store/transportStore', () => ({
  useTransportStore: vi.fn((selector) => {
    const state: Record<string, unknown> = {
      currentTime: 0,
    };
    return selector(state);
  }),
}));

vi.mock('../../src/engine/SynthEngine', () => ({
  synthEngine: {
    previewNote: vi.fn(),
  },
}));

// Mock canvas getContext
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  scale: vi.fn(),
  fillRect: vi.fn(),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  clip: vi.fn(),
  rect: vi.fn(),
  fillText: vi.fn(),
  font: '',
  textAlign: '',
  textBaseline: '',
  clearRect: vi.fn(),
  measureText: vi.fn().mockReturnValue({ width: 0 }),
  setLineDash: vi.fn(),
  globalAlpha: 1,
  roundRect: vi.fn(),
  strokeRect: vi.fn(),
});

const makeNote = (overrides: Partial<MidiNote> = {}): MidiNote => ({
  id: 'note-1',
  pitch: 60,
  startBeat: 0,
  durationBeats: 1,
  velocity: 100,
  ...overrides,
});

const makeClip = (notes: MidiNote[] = []): Clip => ({
  id: 'clip-1',
  trackId: 'track-1',
  name: 'Test Clip',
  startBeat: 0,
  durationBeats: 8,
  color: '#8b5cf6',
  type: 'midi',
  midiData: { notes },
});

const makeTrack = (): Track =>
  ({
    id: 'track-1',
    name: 'Test Track',
    type: 'pianoroll',
    color: '#8b5cf6',
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
    armed: false,
    clips: [],
    synthPreset: 'piano',
  }) as Track;

// Note at pitch=60, startBeat=0 with default zoom/scroll:
//   beatToX(0) = PIANO_KEYBOARD_WIDTH(56) + 0*40 - scrollX(0) = 56
//   pitchToY(60) = (127-60)*14 - scrollY(780) = 158
//   noteWidth = 1*40 = 40, noteHeight = 14-1 = 13
// So note occupies canvas-local x=[56..96], y=[158..171]
// With canvas at left=0, top=0, clientX=70 clientY=165 hits the note body.
const NOTE_HIT_CLIENT_X = 70;
const NOTE_HIT_CLIENT_Y = 165;

describe('PianoRollCanvas — context menu accessibility (#298)', () => {
  let setSelectedNoteIds: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAddMidiNote.mockReset();
    mockStampChord.mockReset();
    mockStampChord.mockReturnValue(['chord-note-1', 'chord-note-2', 'chord-note-3']);
    mockRemoveMidiNote.mockReset();
    mockUpdateMidiNote.mockReset();
    mockResizeMidiNote.mockReset();
    mockQuantizeMidiNotes.mockReset();
    mockBeginDrag.mockReset();
    mockEndDrag.mockReset();
    mockOpenQuantizeDialog.mockReset();
    setSelectedNoteIds = vi.fn();
    // Mock getBoundingClientRect on all elements so canvas has real dimensions
    Element.prototype.getBoundingClientRect = vi.fn().mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      x: 0,
      y: 0,
    });
  });

  it('shows context menu when right-clicking an unselected note', () => {
    const note = makeNote();
    const clip = makeClip([note]);

    const { container } = render(
      <PianoRollCanvas
        clip={clip}
        track={makeTrack()}
        activeTool="select"
        activeChordShapeAbbr="maj"
        gridSize="1/4"
        prZoomX={1}
        onZoomXChange={vi.fn()}
        selectedNoteIds={new Set<string>()}
        onSelectedNoteIdsChange={setSelectedNoteIds}
      />,
    );

    const canvas = container.querySelector('canvas')!;

    // Right-click on the canvas where the note exists
    fireEvent.contextMenu(canvas, {
      clientX: NOTE_HIT_CLIENT_X,
      clientY: NOTE_HIT_CLIENT_Y,
    });

    // The handler should auto-select the note under cursor
    expect(setSelectedNoteIds).toHaveBeenCalledWith(new Set(['note-1']));
  });

  it('shows context menu when right-clicking with notes already selected', () => {
    const note = makeNote();
    const clip = makeClip([note]);

    const { container } = render(
      <PianoRollCanvas
        clip={clip}
        track={makeTrack()}
        activeTool="select"
        activeChordShapeAbbr="maj"
        gridSize="1/4"
        prZoomX={1}
        onZoomXChange={vi.fn()}
        selectedNoteIds={new Set(['note-1'])}
        onSelectedNoteIdsChange={setSelectedNoteIds}
      />,
    );

    const canvas = container.querySelector('canvas')!;

    fireEvent.contextMenu(canvas, {
      clientX: NOTE_HIT_CLIENT_X,
      clientY: NOTE_HIT_CLIENT_Y,
    });

    // Context menu should appear (rendered in the DOM)
    const menuButtons = container.querySelectorAll('button');
    const quantizeButton = Array.from(menuButtons).find((b) =>
      b.textContent?.includes('Quantize'),
    );
    expect(quantizeButton).not.toBeNull();
  });

  it('does not show context menu when right-clicking empty space with no selection', () => {
    const clip = makeClip([]);

    const { container } = render(
      <PianoRollCanvas
        clip={clip}
        track={makeTrack()}
        activeTool="select"
        activeChordShapeAbbr="maj"
        gridSize="1/4"
        prZoomX={1}
        onZoomXChange={vi.fn()}
        selectedNoteIds={new Set<string>()}
        onSelectedNoteIdsChange={setSelectedNoteIds}
      />,
    );

    const canvas = container.querySelector('canvas')!;

    fireEvent.contextMenu(canvas, {
      clientX: 300,
      clientY: 300,
    });

    // No context menu should appear
    const menuButtons = container.querySelectorAll('button');
    const quantizeButton = Array.from(menuButtons).find((b) =>
      b.textContent?.includes('Quantize'),
    );
    expect(quantizeButton).toBeFalsy();
  });

  it('creates slide notes through the explicit slide tool', () => {
    const clip = makeClip([]);

    const { container } = render(
      <PianoRollCanvas
        clip={clip}
        track={makeTrack()}
        activeTool="slide"
        activeChordShapeAbbr="maj"
        gridSize="1/4"
        prZoomX={1}
        onZoomXChange={vi.fn()}
        selectedNoteIds={new Set<string>()}
        onSelectedNoteIdsChange={setSelectedNoteIds}
      />,
    );

    const canvas = container.querySelector('canvas')!;
    fireEvent.mouseDown(canvas, {
      clientX: 120,
      clientY: NOTE_HIT_CLIENT_Y,
    });

    expect(mockAddMidiNote).toHaveBeenCalledTimes(1);
    const [, note] = mockAddMidiNote.mock.calls[0];
    expect(note).toMatchObject({
      isSlide: true,
      durationBeats: 1,
      velocity: 100,
    });
  });

  it('routes Shift-click chord stamping through the shared store action', () => {
    const clip = makeClip([]);

    const { container } = render(
      <PianoRollCanvas
        clip={clip}
        track={makeTrack()}
        activeTool="select"
        activeChordShapeAbbr="min"
        gridSize="1/4"
        prZoomX={1}
        onZoomXChange={vi.fn()}
        selectedNoteIds={new Set<string>()}
        onSelectedNoteIdsChange={setSelectedNoteIds}
      />,
    );

    const canvas = container.querySelector('canvas')!;

    fireEvent.click(canvas, {
      clientX: 160,
      clientY: NOTE_HIT_CLIENT_Y,
      shiftKey: true,
    });

    expect(mockStampChord).toHaveBeenCalledWith(clip.id, 60, [0, 3, 7], 3, 1, 100);
    expect(setSelectedNoteIds).toHaveBeenCalledWith(new Set(['chord-note-1', 'chord-note-2', 'chord-note-3']));
  });

  it('starts marquee selection when dragging empty space in select mode without Shift (#393)', () => {
    const note = makeNote();
    const clip = makeClip([note]);

    const { container } = render(
      <PianoRollCanvas
        clip={clip}
        track={makeTrack()}
        activeTool="select"
        activeChordShapeAbbr="maj"
        gridSize="1/4"
        prZoomX={1}
        onZoomXChange={vi.fn()}
        selectedNoteIds={new Set<string>()}
        onSelectedNoteIdsChange={setSelectedNoteIds}
      />,
    );

    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, {
      clientX: 110,
      clientY: 150,
    });
    fireEvent.mouseMove(window, {
      clientX: 50,
      clientY: 180,
    });

    const lastSelection = setSelectedNoteIds.mock.calls.at(-1)?.[0];
    expect(lastSelection).toEqual(new Set(['note-1']));
  });

  it('keeps the existing selection when Shift-dragging an additive marquee (#393)', () => {
    const noteOne = makeNote();
    const noteTwo = makeNote({
      id: 'note-2',
      pitch: 72,
      startBeat: 4,
    });
    const clip = makeClip([noteOne, noteTwo]);

    const { container } = render(
      <PianoRollCanvas
        clip={clip}
        track={makeTrack()}
        activeTool="select"
        activeChordShapeAbbr="maj"
        gridSize="1/4"
        prZoomX={1}
        onZoomXChange={vi.fn()}
        selectedNoteIds={new Set(['note-2'])}
        onSelectedNoteIdsChange={setSelectedNoteIds}
      />,
    );

    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, {
      clientX: 110,
      clientY: 150,
      shiftKey: true,
    });
    fireEvent.mouseMove(window, {
      clientX: 50,
      clientY: 180,
      shiftKey: true,
    });

    const lastSelection = setSelectedNoteIds.mock.calls.at(-1)?.[0];
    expect(lastSelection).toEqual(new Set(['note-1', 'note-2']));
  });

  it('does not paint notes on hover without the primary mouse button pressed (#394)', () => {
    const clip = makeClip([]);

    const { container } = render(
      <PianoRollCanvas
        clip={clip}
        track={makeTrack()}
        activeTool="paint"
        activeChordShapeAbbr="maj"
        gridSize="1/4"
        prZoomX={1}
        onZoomXChange={vi.fn()}
        selectedNoteIds={new Set<string>()}
        onSelectedNoteIdsChange={setSelectedNoteIds}
      />,
    );

    fireEvent.mouseMove(window, {
      clientX: 120,
      clientY: NOTE_HIT_CLIENT_Y,
      buttons: 0,
    });

    expect(mockAddMidiNote).not.toHaveBeenCalled();

    const canvas = container.querySelector('canvas')!;
    fireEvent.mouseMove(canvas, {
      clientX: 120,
      clientY: NOTE_HIT_CLIENT_Y,
      buttons: 1,
    });

    expect(mockAddMidiNote).toHaveBeenCalledTimes(1);
  });

  it('paints repeated notes while dragging with the primary button held', () => {
    const clip = makeClip([]);

    const { container } = render(
      <PianoRollCanvas
        clip={clip}
        track={makeTrack()}
        activeTool="paint"
        activeChordShapeAbbr="maj"
        gridSize="1/4"
        prZoomX={1}
        onZoomXChange={vi.fn()}
        selectedNoteIds={new Set<string>()}
        onSelectedNoteIdsChange={setSelectedNoteIds}
      />,
    );

    const canvas = container.querySelector('canvas')!;

    fireEvent.mouseDown(canvas, {
      clientX: 120,
      clientY: NOTE_HIT_CLIENT_Y,
      buttons: 1,
    });
    fireEvent.mouseMove(window, {
      clientX: 160,
      clientY: NOTE_HIT_CLIENT_Y,
      buttons: 1,
    });
    fireEvent.mouseMove(window, {
      clientX: 200,
      clientY: NOTE_HIT_CLIENT_Y,
      buttons: 1,
    });

    expect(mockAddMidiNote).toHaveBeenCalledTimes(3);
    expect(mockBeginDrag).not.toHaveBeenCalled();
    expect(mockUpdateMidiNote).not.toHaveBeenCalled();
  });

  it('does not erase notes on hover without the primary mouse button pressed (#394)', () => {
    const note = makeNote();
    const clip = makeClip([note]);

    const { container } = render(
      <PianoRollCanvas
        clip={clip}
        track={makeTrack()}
        activeTool="erase"
        activeChordShapeAbbr="maj"
        gridSize="1/4"
        prZoomX={1}
        onZoomXChange={vi.fn()}
        selectedNoteIds={new Set<string>()}
        onSelectedNoteIdsChange={setSelectedNoteIds}
      />,
    );

    fireEvent.mouseMove(window, {
      clientX: NOTE_HIT_CLIENT_X,
      clientY: NOTE_HIT_CLIENT_Y,
      buttons: 0,
    });

    expect(mockRemoveMidiNote).not.toHaveBeenCalled();

    const canvas = container.querySelector('canvas')!;
    fireEvent.mouseMove(canvas, {
      clientX: NOTE_HIT_CLIENT_X,
      clientY: NOTE_HIT_CLIENT_Y,
      buttons: 1,
    });

    expect(mockRemoveMidiNote).toHaveBeenCalledTimes(1);
    expect(mockRemoveMidiNote).toHaveBeenCalledWith('clip-1', 'note-1');
  });

  it('exposes velocity lane geometry through the piano roll helper for agent workflows', () => {
    const clip = makeClip([makeNote()]);

    render(
      <PianoRollCanvas
        clip={clip}
        track={makeTrack()}
        activeTool="select"
        activeChordShapeAbbr="maj"
        gridSize="1/4"
        prZoomX={1}
        onZoomXChange={vi.fn()}
        selectedNoteIds={new Set<string>()}
        onSelectedNoteIdsChange={setSelectedNoteIds}
      />,
    );

    const helpers = (
      window as Window & {
        __pianoRollHelpers?: {
          velocityLaneTop?: number;
          velocityLaneHeight?: number;
        };
      }
    ).__pianoRollHelpers;

    expect(helpers?.velocityLaneTop).toBeTypeOf('number');
    expect(helpers?.velocityLaneHeight).toBeGreaterThan(0);
  });

  it('selects a note before starting velocity-lane editing so UI state stays in sync (#449)', () => {
    const clip = makeClip([makeNote()]);

    const { container } = render(
      <PianoRollCanvas
        clip={clip}
        track={makeTrack()}
        activeTool="select"
        activeChordShapeAbbr="maj"
        gridSize="1/4"
        prZoomX={1}
        onZoomXChange={vi.fn()}
        selectedNoteIds={new Set<string>()}
        onSelectedNoteIdsChange={setSelectedNoteIds}
      />,
    );

    const canvas = container.querySelector('canvas')!;
    fireEvent.mouseDown(canvas, {
      clientX: NOTE_HIT_CLIENT_X,
      clientY: 560,
    });

    expect(setSelectedNoteIds).toHaveBeenCalledWith(new Set(['note-1']));
    expect(mockBeginDrag).toHaveBeenCalledTimes(1);
    expect(mockUpdateMidiNote).toHaveBeenCalledWith(
      'clip-1',
      'note-1',
      expect.objectContaining({
        velocity: expect.any(Number),
      }),
    );
  });

  it('shows a resize cursor when hovering a note edge', () => {
    const clip = makeClip([makeNote()]);

    const { container } = render(
      <PianoRollCanvas
        clip={clip}
        track={makeTrack()}
        activeTool="select"
        gridSize="1/4"
        prZoomX={1}
        onZoomXChange={vi.fn()}
        selectedNoteIds={new Set<string>()}
        onSelectedNoteIdsChange={setSelectedNoteIds}
      />,
    );

    const canvas = container.querySelector('canvas')!;
    fireEvent.mouseMove(canvas, {
      clientX: 94,
      clientY: NOTE_HIT_CLIENT_Y,
      buttons: 0,
    });

    expect(canvas.style.cursor).toBe('col-resize');
  });

  it('routes note-edge drags through the shared resize action', () => {
    const clip = makeClip([makeNote()]);

    const { container } = render(
      <PianoRollCanvas
        clip={clip}
        track={makeTrack()}
        activeTool="select"
        gridSize="1/4"
        prZoomX={1}
        onZoomXChange={vi.fn()}
        selectedNoteIds={new Set<string>()}
        onSelectedNoteIdsChange={setSelectedNoteIds}
      />,
    );

    const canvas = container.querySelector('canvas')!;
    fireEvent.mouseDown(canvas, {
      clientX: 94,
      clientY: NOTE_HIT_CLIENT_Y,
    });
    fireEvent.mouseMove(window, {
      clientX: 134,
      clientY: NOTE_HIT_CLIENT_Y,
      buttons: 1,
    });

    expect(mockResizeMidiNote).toHaveBeenCalledWith(
      'clip-1',
      'note-1',
      expect.objectContaining({
        edge: 'right',
        endBeat: expect.any(Number),
      }),
    );
  });
});
