import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SequencerStepGridRow } from '../SequencerStepGridRow';
import type { SequencerRow, SequencerStep } from '../../../types/project';

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

function renderGridRow(overrides: Partial<Parameters<typeof SequencerStepGridRow>[0]> = {}) {
  const defaults = {
    row: makeRow(),
    rowIdx: 0,
    patternStepsPerBar: 16,
    stepH: 28,
    stepW: 28,
    stepsPerBeat: 4,
    currentStep: -1,
    isPreviewPlaying: false,
    isAudible: true,
    selection: null,
    copyGhostOffset: null,
    isSelectedCell: () => false,
    onGridMouseDown: vi.fn(),
    onVelocityMouseDown: vi.fn(),
    onStepContextMenu: vi.fn(),
    onAddBar: vi.fn(),
  };
  const props = { ...defaults, ...overrides };
  return { ...render(<SequencerStepGridRow {...props} />), props };
}

describe('SequencerStepGridRow', () => {
  it('renders correct number of step cells', () => {
    const row = makeRow({ steps: Array.from({ length: 16 }, () => makeStep()) });
    const { container } = renderGridRow({ row });
    // 16 steps + 1 add-bar button
    const cells = container.querySelectorAll('[data-seq-step]');
    expect(cells).toHaveLength(16);
  });

  it('marks each cell with correct data attributes', () => {
    const row = makeRow({ id: 'row-kick' });
    const { container } = renderGridRow({ row });
    const cells = container.querySelectorAll('[data-seq-step]');
    expect(cells[0].getAttribute('data-seq-row')).toBe('row-kick');
    expect(cells[0].getAttribute('data-seq-step')).toBe('0');
    expect(cells[15].getAttribute('data-seq-step')).toBe('15');
  });

  it('renders with reduced opacity when not audible', () => {
    const { container } = renderGridRow({ isAudible: false });
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.opacity).toBe('0.3');
  });

  it('renders with full opacity when audible', () => {
    const { container } = renderGridRow({ isAudible: true });
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.opacity).toBe('1');
  });

  it('shows active step with row color', () => {
    const steps = Array.from({ length: 16 }, () => makeStep());
    steps[0] = makeStep({ active: true, velocity: 1 });
    const row = makeRow({ steps, color: '#ef4444' });
    const { container } = renderGridRow({ row });
    const firstCell = container.querySelector('[data-seq-step="0"]')!;
    const fill = firstCell.querySelector('div') as HTMLElement;
    expect(fill.style.background).toContain('239, 68, 68'); // #ef4444 in rgb
  });

  it('shows probability indicator for steps with probability < 1', () => {
    const steps = Array.from({ length: 16 }, () => makeStep());
    steps[0] = makeStep({ active: true, probability: 0.5 });
    const row = makeRow({ steps });
    renderGridRow({ row });
    expect(screen.getByTestId('probability-indicator')).toBeInTheDocument();
  });

  it('does not show probability indicator for 100% probability', () => {
    const steps = Array.from({ length: 16 }, () => makeStep());
    steps[0] = makeStep({ active: true, probability: 1 });
    const row = makeRow({ steps });
    renderGridRow({ row });
    expect(screen.queryByTestId('probability-indicator')).not.toBeInTheDocument();
  });

  it('shows param lock indicator for steps with params', () => {
    const steps = Array.from({ length: 16 }, () => makeStep());
    steps[0] = makeStep({ active: true, stepParams: { pitch: 0.7 } });
    const row = makeRow({ steps });
    renderGridRow({ row });
    expect(screen.getByTestId('param-lock-indicator')).toBeInTheDocument();
  });

  it('does not show param lock indicator for steps without params', () => {
    const steps = Array.from({ length: 16 }, () => makeStep());
    steps[0] = makeStep({ active: true, stepParams: {} });
    const row = makeRow({ steps });
    renderGridRow({ row });
    expect(screen.queryByTestId('param-lock-indicator')).not.toBeInTheDocument();
  });

  it('calls onGridMouseDown when clicking a step', () => {
    const row = makeRow();
    const { props, container } = renderGridRow({ row });
    const firstCell = container.querySelector('[data-seq-step="0"]')!;
    fireEvent.mouseDown(firstCell);
    expect(props.onGridMouseDown).toHaveBeenCalledWith('row-1', 0, expect.anything());
  });

  it('calls onStepContextMenu on right-click of active step', () => {
    const steps = Array.from({ length: 16 }, () => makeStep());
    steps[3] = makeStep({ active: true });
    const row = makeRow({ steps });
    const { props, container } = renderGridRow({ row });
    const cell = container.querySelector('[data-seq-step="3"]')!;
    fireEvent.contextMenu(cell);
    expect(props.onStepContextMenu).toHaveBeenCalledWith('row-1', 3, expect.any(Number), expect.any(Number));
  });

  it('calls onVelocityMouseDown on right-click of inactive step', () => {
    const row = makeRow(); // All inactive
    const { props, container } = renderGridRow({ row });
    const cell = container.querySelector('[data-seq-step="5"]')!;
    fireEvent.contextMenu(cell);
    expect(props.onVelocityMouseDown).toHaveBeenCalledWith('row-1', 5, expect.anything());
  });

  it('renders add bar button', () => {
    const { container } = renderGridRow();
    const addBarBtn = container.querySelector('[title="Add 1 bar"]');
    expect(addBarBtn).toBeInTheDocument();
  });

  it('calls onAddBar when clicking add bar button', () => {
    const { props, container } = renderGridRow();
    const addBarBtn = container.querySelector('[title="Add 1 bar"]')!;
    fireEvent.click(addBarBtn);
    expect(props.onAddBar).toHaveBeenCalledOnce();
  });

  it('highlights selected cells', () => {
    const isSelectedCell = vi.fn((_rowIdx: number, stepIdx: number) => stepIdx === 2);
    const { container } = renderGridRow({ isSelectedCell });
    // The selected cell should have a selection overlay
    const cell = container.querySelector('[data-seq-step="2"]')!;
    // Selection overlay has inset: 0 and a blue-tinted background
    const overlays = cell.querySelectorAll('div');
    const selectionOverlay = Array.from(overlays).find(
      (div) => {
        const el = div as HTMLElement;
        return el.style.inset === '0px' && el.style.background?.includes('52, 152, 219');
      },
    );
    expect(selectionOverlay).toBeDefined();
  });

  it('shows copy ghost for offset steps', () => {
    const steps = Array.from({ length: 16 }, () => makeStep());
    steps[2] = makeStep({ active: true });
    const row = makeRow({ steps });
    const selection = { rowStart: 0, rowEnd: 0, stepStart: 2, stepEnd: 2 };
    const { container } = renderGridRow({
      row,
      selection,
      copyGhostOffset: 3,
      isSelectedCell: () => false,
    });
    // The ghost should appear at step 5 (2 + 3)
    const cell5 = container.querySelector('[data-seq-step="5"]')!;
    const ghostOverlays = cell5.querySelectorAll('div');
    const ghost = Array.from(ghostOverlays).find(
      (div) => (div as HTMLElement).style.opacity === '0.35',
    );
    expect(ghost).toBeDefined();
  });
});
