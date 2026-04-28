import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SequencerToolbar } from '../SequencerToolbar';

function renderToolbar(overrides: Partial<Parameters<typeof SequencerToolbar>[0]> = {}) {
  const defaults = {
    trackName: 'Drums',
    stepsPerBar: 16,
    bars: 2,
    swing: 0,
    rowSize: 'normal' as const,
    isPreviewPlaying: false,
    isBouncing: false,
    onSetStepsPerBar: vi.fn(),
    onSetBars: vi.fn(),
    onSetSwing: vi.fn(),
    onSetRowSize: vi.fn(),
    onTogglePreview: vi.fn(),
    onBounce: vi.fn(),
    onClose: vi.fn(),
  };
  const props = { ...defaults, ...overrides };
  return { ...render(<SequencerToolbar {...props} />), props };
}

describe('SequencerToolbar', () => {
  it('renders track name', () => {
    renderToolbar({ trackName: 'My Drums' });
    expect(screen.getByText('My Drums')).toBeInTheDocument();
  });

  it('renders CHANNEL RACK label', () => {
    renderToolbar();
    expect(screen.getByText('CHANNEL RACK')).toBeInTheDocument();
  });

  it('highlights the active steps-per-bar button', () => {
    renderToolbar({ stepsPerBar: 16 });
    const btn16 = screen.getByText('16');
    // Active button has fontWeight 700
    expect(btn16.style.fontWeight).toBe('700');
    const btn8 = screen.getByText('8');
    expect(btn8.style.fontWeight).toBe('400');
  });

  it('calls onSetStepsPerBar when clicking a step button', () => {
    const { props } = renderToolbar({ stepsPerBar: 16 });
    fireEvent.click(screen.getByText('32'));
    expect(props.onSetStepsPerBar).toHaveBeenCalledWith(32);
  });

  it('displays current bar count', () => {
    renderToolbar({ bars: 4 });
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('calls onSetBars when clicking + button', () => {
    const { props } = renderToolbar({ bars: 2 });
    // The + button increments bars
    const plusBtn = screen.getAllByRole('button').find(
      (btn) => btn.textContent === '+',
    )!;
    fireEvent.click(plusBtn);
    expect(props.onSetBars).toHaveBeenCalledWith(3);
  });

  it('calls onSetBars when clicking - button', () => {
    const { props } = renderToolbar({ bars: 3 });
    const minusBtn = screen.getAllByRole('button').find(
      (btn) => btn.textContent === '-',
    )!;
    fireEvent.click(minusBtn);
    expect(props.onSetBars).toHaveBeenCalledWith(2);
  });

  it('disables - button when bars is 1', () => {
    renderToolbar({ bars: 1 });
    const minusBtn = screen.getAllByRole('button').find(
      (btn) => btn.textContent === '-',
    )!;
    expect(minusBtn).toBeDisabled();
  });

  it('shows Play button when not previewing', () => {
    renderToolbar({ isPreviewPlaying: false });
    expect(screen.getByText('▶ Play')).toBeInTheDocument();
  });

  it('shows Stop button when previewing', () => {
    renderToolbar({ isPreviewPlaying: true });
    expect(screen.getByText('■ Stop')).toBeInTheDocument();
  });

  it('calls onTogglePreview when clicking Play/Stop', () => {
    const { props } = renderToolbar({ isPreviewPlaying: false });
    fireEvent.click(screen.getByText('▶ Play'));
    expect(props.onTogglePreview).toHaveBeenCalledOnce();
  });

  it('shows Bounce button', () => {
    renderToolbar();
    expect(screen.getByText('Bounce')).toBeInTheDocument();
  });

  it('shows Bouncing... when isBouncing', () => {
    renderToolbar({ isBouncing: true });
    expect(screen.getByText('Bouncing...')).toBeInTheDocument();
  });

  it('disables bounce button when bouncing', () => {
    renderToolbar({ isBouncing: true });
    const bounceBtn = screen.getByText('Bouncing...');
    expect(bounceBtn).toBeDisabled();
  });

  it('calls onBounce when clicking Bounce', () => {
    const { props } = renderToolbar();
    fireEvent.click(screen.getByText('Bounce'));
    expect(props.onBounce).toHaveBeenCalledOnce();
  });

  it('calls onClose when clicking close button', () => {
    const { props } = renderToolbar();
    const closeBtn = screen.getByTitle('Esc');
    fireEvent.click(closeBtn);
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('renders row size selector buttons for all sizes', () => {
    renderToolbar({ rowSize: 'compact' });
    // compact, normal, expanded - buttons without text
    const sizeButtons = screen.getAllByRole('button').filter(
      (btn) => btn.title === 'compact' || btn.title === 'normal' || btn.title === 'expanded',
    );
    expect(sizeButtons).toHaveLength(3);
  });

  it('calls onSetRowSize when clicking a size button', () => {
    const { props } = renderToolbar({ rowSize: 'compact' });
    const expandedBtn = screen.getByTitle('expanded');
    fireEvent.click(expandedBtn);
    expect(props.onSetRowSize).toHaveBeenCalledWith('expanded');
  });
});
