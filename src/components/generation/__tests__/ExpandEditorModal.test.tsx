import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExpandEditorModal } from '../ExpandEditorModal';

describe('ExpandEditorModal', () => {
  const makeProps = () => ({
    isOpen: true,
    title: 'Music Caption',
    value: 'A bright pop-rock track',
    onChange: vi.fn(),
    onClose: vi.fn(),
  });

  // Shared default for tests that don't need isolated mocks
  const defaultProps = makeProps();

  it('renders nothing when closed', () => {
    const { container } = render(
      <ExpandEditorModal {...defaultProps} isOpen={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with title and textarea when open', () => {
    render(<ExpandEditorModal {...defaultProps} />);
    expect(screen.getByText('Music Caption')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('A bright pop-rock track');
  });

  it('calls onChange when textarea content changes', () => {
    render(<ExpandEditorModal {...defaultProps} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'New content' } });
    expect(defaultProps.onChange).toHaveBeenCalledWith('New content');
  });

  it('calls onClose when Done button is clicked', () => {
    render(<ExpandEditorModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Done'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    render(<ExpandEditorModal {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when clicking the backdrop', () => {
    render(<ExpandEditorModal {...defaultProps} />);
    const backdrop = screen.getByTestId('expand-editor-backdrop');
    fireEvent.mouseDown(backdrop);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('does not close when clicking inside the modal content', () => {
    const props = makeProps();
    render(<ExpandEditorModal {...props} />);
    fireEvent.click(screen.getByRole('textbox'));
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('renders enhance button when onEnhance is provided', () => {
    render(
      <ExpandEditorModal {...defaultProps} onEnhance={vi.fn()} />
    );
    expect(screen.getByTitle('AI enhance')).toBeInTheDocument();
  });

  it('does not render enhance button when onEnhance is not provided', () => {
    render(<ExpandEditorModal {...defaultProps} />);
    expect(screen.queryByTitle('AI enhance')).not.toBeInTheDocument();
  });

  it('calls onEnhance when enhance button is clicked', () => {
    const onEnhance = vi.fn();
    render(<ExpandEditorModal {...defaultProps} onEnhance={onEnhance} />);
    fireEvent.click(screen.getByTitle('AI enhance'));
    expect(onEnhance).toHaveBeenCalled();
  });

  it('uses monospace font when mono prop is true', () => {
    render(<ExpandEditorModal {...defaultProps} mono />);
    const textarea = screen.getByRole('textbox');
    expect(textarea.className).toContain('font-mono');
  });

  it('disables textarea when disabled prop is true', () => {
    render(<ExpandEditorModal {...defaultProps} disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});
