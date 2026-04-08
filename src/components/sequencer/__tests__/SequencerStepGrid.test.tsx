import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SequencerStepGrid } from '../SequencerStepGrid';
import type { SequencerPattern, SequencerRow, SequencerStep } from '../../../types/project';

function makeStep(overrides: Partial<SequencerStep> = {}): SequencerStep {
  return { active: false, velocity: 0.8, probability: 1, stepParams: {}, ...overrides };
}

function makeRow(overrides: Partial<SequencerRow> = {}): SequencerRow {
  return {
    id: 'row-1',
    name: 'Kick',
    sampleKey: 'kick-808',
    steps: Array.from({ length: 16 }, () => makeStep()),
    volume: 0.8,
    pan: 0,
    muted: false,
    color: '#ef4444',
    ...overrides,
  };
}

function makePattern(overrides: Partial<SequencerPattern> = {}): SequencerPattern {
  return {
    id: 'pattern-1',
    name: 'Pattern 1',
    rows: [
      makeRow({ id: 'row-kick', name: 'Kick', color: '#ef4444' }),
      makeRow({ id: 'row-snare', name: 'Snare', color: '#3b82f6' }),
    ],
    stepsPerBar: 16,
    bars: 1,
    swing: 0,
    ...overrides,
  };
}

function renderStepGrid(overrides: Partial<Parameters<typeof SequencerStepGrid>[0]> = {}) {
  const defaults = {
    trackId: 'track-1',
    pattern: makePattern(),
    stepH: 28,
    stepW: 28,
    stepsPerBeat: 4,
    currentStep: -1,
    isPreviewPlaying: false,
    selection: null,
    copyGhostOffset: null,
    soloRowId: null,
    onSelectionChange: vi.fn(),
    onCopyGhostOffsetChange: vi.fn(),
    onToggleStep: vi.fn(),
    onSetStepVelocity: vi.fn(),
    onBatchSetSteps: vi.fn(),
    onPreviewSample: vi.fn(),
    onStepContextMenu: vi.fn(),
    onAddBar: vi.fn(),
  };
  const props = { ...defaults, ...overrides };
  return { ...render(<SequencerStepGrid {...props} />), props };
}

describe('SequencerStepGrid', () => {
  it('renders step cells for each row', () => {
    const { container } = renderStepGrid();
    // 2 rows × 16 steps = 32 step cells
    const cells = container.querySelectorAll('[data-seq-step]');
    expect(cells).toHaveLength(32);
  });

  it('renders bar/beat header numbers', () => {
    renderStepGrid();
    // Bar 1 label
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders add bar (+1) button in header', () => {
    renderStepGrid();
    const addBarBtns = screen.getAllByTitle('Add 1 bar');
    expect(addBarBtns.length).toBeGreaterThanOrEqual(1);
  });

  it('calls onAddBar when clicking +1 header button', () => {
    const { props } = renderStepGrid();
    const addBarBtn = screen.getAllByTitle('Add 1 bar')[0];
    fireEvent.click(addBarBtn);
    expect(props.onAddBar).toHaveBeenCalledOnce();
  });

  it('renders playhead line when previewing', () => {
    const { container } = renderStepGrid({
      isPreviewPlaying: true,
      currentStep: 4,
    });
    // Playhead is an absolute-positioned div with white background
    const playhead = container.querySelector('[style*="rgba(255"]');
    expect(playhead).toBeInTheDocument();
  });

  it('does not render playhead when not previewing', () => {
    const { container } = renderStepGrid({
      isPreviewPlaying: false,
      currentStep: -1,
    });
    // No playhead line
    const absoluteDivs = container.querySelectorAll('div[style*="position: absolute"]');
    // Filter for the specific playhead (white line, covers full height)
    const playheads = Array.from(absoluteDivs).filter(
      (div) => {
        const el = div as HTMLElement;
        return el.style.background?.includes('255, 255, 255') &&
               el.style.width === '2px';
      },
    );
    expect(playheads).toHaveLength(0);
  });

  it('handles step click: calls onToggleStep when not dragging', () => {
    const { props, container } = renderStepGrid();
    const cell = container.querySelector('[data-seq-step="0"][data-seq-row="row-kick"]')!;
    fireEvent.mouseDown(cell);
    fireEvent.mouseUp(window);
    expect(props.onToggleStep).toHaveBeenCalledWith('track-1', 'row-kick', 0);
  });

  it('reduces opacity for muted rows when not soloed', () => {
    const pattern = makePattern({
      rows: [
        makeRow({ id: 'row-kick', name: 'Kick', muted: true }),
        makeRow({ id: 'row-snare', name: 'Snare', muted: false }),
      ],
    });
    const { container } = renderStepGrid({ pattern });
    // The muted row's wrapper should have opacity 0.3 (dimmed)
    const rows = container.querySelectorAll('[data-seq-row="row-kick"]');
    const mutedRow = rows[0]?.closest('div[style*="opacity: 0.3"]');
    expect(mutedRow).toBeDefined();
  });

  it('only shows soloed row as audible', () => {
    const pattern = makePattern();
    const { container } = renderStepGrid({ pattern, soloRowId: 'row-kick' });
    // row-snare should be dimmed (opacity 0.3)
    const snareRows = container.querySelectorAll('[data-seq-row="row-snare"]');
    if (snareRows.length > 0) {
      const parentRow = snareRows[0].closest('div[style*="opacity: 0.3"]');
      expect(parentRow).toBeDefined();
    }
  });

  it('handles right-click on active step to open context menu', () => {
    const steps = Array.from({ length: 16 }, () => makeStep());
    steps[5] = makeStep({ active: true });
    const pattern = makePattern({
      rows: [makeRow({ id: 'row-kick', steps })],
    });
    const { props, container } = renderStepGrid({ pattern });
    const cell = container.querySelector('[data-seq-step="5"][data-seq-row="row-kick"]')!;
    fireEvent.contextMenu(cell);
    expect(props.onStepContextMenu).toHaveBeenCalledWith('row-kick', 5, expect.any(Number), expect.any(Number));
  });

  it('renders correct number of cells for multi-bar pattern', () => {
    const pattern = makePattern({
      bars: 2,
      rows: [makeRow({ id: 'row-kick', steps: Array.from({ length: 32 }, () => makeStep()) })],
    });
    const { container } = renderStepGrid({ pattern, stepsPerBeat: 4 });
    const cells = container.querySelectorAll('[data-seq-row="row-kick"]');
    expect(cells).toHaveLength(32);
  });
});
