import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuantizeDialog } from '../QuantizeDialog';
import { useUIStore } from '../../../store/uiStore';
import { useProjectStore } from '../../../store/projectStore';

function setupDialog() {
  useProjectStore.getState().createProject();
  useProjectStore.getState().addTrack('midi');
  useUIStore.setState({
    showQuantizeDialog: true,
    quantizeTarget: {
      clipId: 'clip-1',
      noteIds: ['note-1', 'note-2', 'note-3'],
    },
  });
}

describe('QuantizeDialog', () => {
  beforeEach(() => {
    setupDialog();
  });

  it('renders nothing when not shown', () => {
    useUIStore.setState({ showQuantizeDialog: false });
    const { container } = render(<QuantizeDialog />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when no target', () => {
    useUIStore.setState({ quantizeTarget: null });
    const { container } = render(<QuantizeDialog />);
    expect(container.innerHTML).toBe('');
  });

  it('renders dialog title with note count', () => {
    render(<QuantizeDialog />);
    expect(screen.getByText('Quantize 3 notes')).toBeInTheDocument();
  });

  it('uses singular for 1 note', () => {
    useUIStore.setState({
      quantizeTarget: { clipId: 'clip-1', noteIds: ['note-1'] },
    });
    render(<QuantizeDialog />);
    expect(screen.getByText('Quantize 1 note')).toBeInTheDocument();
  });

  it('renders grid size selector', () => {
    render(<QuantizeDialog />);
    expect(screen.getByText('Grid size')).toBeInTheDocument();
    const gridSelect = screen.getAllByRole('combobox')[0];
    expect(gridSelect).toBeInTheDocument();
  });

  it('renders strength slider', () => {
    render(<QuantizeDialog />);
    expect(screen.getByText('Strength')).toBeInTheDocument();
    const sliders = screen.getAllByRole('slider');
    expect(sliders.length).toBeGreaterThanOrEqual(1);
  });

  it('renders swing slider', () => {
    render(<QuantizeDialog />);
    expect(screen.getByText('Swing')).toBeInTheDocument();
  });

  it('renders scope selector', () => {
    render(<QuantizeDialog />);
    expect(screen.getByText('Scope')).toBeInTheDocument();
    // Should have scope options
    const scopeSelect = screen.getAllByRole('combobox').find(
      (el) => (el as HTMLSelectElement).value === 'start',
    );
    expect(scopeSelect).toBeDefined();
  });

  it('renders Apply and Cancel buttons', () => {
    render(<QuantizeDialog />);
    expect(screen.getByText('Apply')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('closes on Cancel', () => {
    render(<QuantizeDialog />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(useUIStore.getState().showQuantizeDialog).toBe(false);
  });

  it('displays initial strength value of 100%', () => {
    render(<QuantizeDialog />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('changes strength when slider moves', () => {
    render(<QuantizeDialog />);
    const sliders = screen.getAllByRole('slider');
    // First slider should be strength
    fireEvent.change(sliders[0], { target: { value: '75' } });
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('has grid options 1/4 through 1/32', () => {
    render(<QuantizeDialog />);
    const gridSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    const options = Array.from(gridSelect.options).map((o) => o.textContent);
    expect(options).toContain('1/4');
    expect(options).toContain('1/8');
    expect(options).toContain('1/16');
    expect(options).toContain('1/32');
  });
});
