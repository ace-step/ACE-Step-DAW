import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CanvasClipMidiThumbnail } from '../CanvasClipMidiThumbnail';
import type { MidiClipData } from '../../../types/project';

const mockCtx = {
  scale: vi.fn(),
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  roundRect: vi.fn(),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  globalAlpha: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 60,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeMidiData(noteCount: number): MidiClipData {
  return {
    notes: Array.from({ length: noteCount }, (_, i) => ({
      id: `n${i}`,
      pitch: 60 + (i % 12),
      startBeat: i * 0.5,
      durationBeats: 0.25,
      velocity: 80,
    })),
  };
}

describe('CanvasClipMidiThumbnail', () => {
  it('returns null for empty notes', () => {
    const { container } = render(
      <CanvasClipMidiThumbnail
        midiData={{ notes: [] }}
        width={200}
        duration={5}
        bpm={120}
        color="#000"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a canvas element', () => {
    render(
      <CanvasClipMidiThumbnail
        midiData={makeMidiData(5)}
        width={200}
        duration={5}
        bpm={120}
        color="#abc"
      />,
    );
    expect(screen.getByTestId('canvas-midi-thumbnail')).toBeInTheDocument();
  });

  it('draws rectangles via canvas context', () => {
    render(
      <CanvasClipMidiThumbnail
        midiData={makeMidiData(3)}
        width={200}
        duration={5}
        bpm={120}
        color="#abc"
      />,
    );
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d');
    expect(mockCtx.roundRect).toHaveBeenCalledTimes(3);
    expect(mockCtx.fill).toHaveBeenCalledTimes(3);
  });

  it('has pointer-events-none on container', () => {
    const { container } = render(
      <CanvasClipMidiThumbnail
        midiData={makeMidiData(3)}
        width={200}
        duration={5}
        bpm={120}
        color="#abc"
      />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('pointer-events-none');
  });
});
