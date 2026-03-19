import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PianoRollCanvas } from '../../src/components/pianoroll/PianoRollCanvas';
import type { Clip, MidiNote, Track } from '../../src/types/project';

// Mock stores
vi.mock('../../src/store/projectStore', () => ({
  useProjectStore: vi.fn((selector) => {
    const state: Record<string, unknown> = {
      addMidiNote: vi.fn(),
      removeMidiNote: vi.fn(),
      updateMidiNote: vi.fn(),
      quantizeMidiNotes: vi.fn(),
      beginDrag: vi.fn(),
      endDrag: vi.fn(),
      project: { bpm: 120 },
    };
    return selector(state);
  }),
}));

vi.mock('../../src/store/uiStore', () => ({
  useUIStore: vi.fn((selector) => {
    const state: Record<string, unknown> = {
      openQuantizeDialog: vi.fn(),
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
        drawMode={false}
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
        drawMode={false}
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
    expect(quantizeButton).toBeTruthy();
  });

  it('does not show context menu when right-clicking empty space with no selection', () => {
    const clip = makeClip([]);

    const { container } = render(
      <PianoRollCanvas
        clip={clip}
        track={makeTrack()}
        drawMode={false}
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
});
