import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CanvasContextMenu } from '../../src/components/timeline/CanvasContextMenu';

describe('CanvasContextMenu', () => {
  const defaultProps = {
    x: 100,
    y: 200,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with correct test id', () => {
    render(<CanvasContextMenu {...defaultProps} />);
    expect(screen.getByTestId('canvas-context-menu')).toBeInTheDocument();
  });

  it('renders AI Tools submenu trigger', () => {
    render(<CanvasContextMenu {...defaultProps} />);
    expect(screen.getByText('AI Tools')).toBeInTheDocument();
  });

  it('renders Paste item with shortcut', () => {
    render(<CanvasContextMenu {...defaultProps} />);
    expect(screen.getByText('Paste')).toBeInTheDocument();
  });

  it('renders Select All item with shortcut', () => {
    render(<CanvasContextMenu {...defaultProps} />);
    expect(screen.getByText('Select All')).toBeInTheDocument();
  });

  it('renders Import item', () => {
    render(<CanvasContextMenu {...defaultProps} />);
    expect(screen.getByText('Import')).toBeInTheDocument();
  });

  it('renders Loop Selection item', () => {
    render(<CanvasContextMenu {...defaultProps} />);
    expect(screen.getByText('Loop Selection')).toBeInTheDocument();
  });

  it('renders Grid & Snap item', () => {
    render(<CanvasContextMenu {...defaultProps} />);
    expect(screen.getByText('Grid & Snap')).toBeInTheDocument();
  });

  it('shows AI Tools submenu on hover', () => {
    render(<CanvasContextMenu {...defaultProps} />);
    const aiToolsBtn = screen.getByText('AI Tools').closest('div')!;
    fireEvent.mouseEnter(aiToolsBtn);
    expect(screen.getByText('Inspire Me')).toBeInTheDocument();
    expect(screen.getByText('Add a Layer')).toBeInTheDocument();
    expect(screen.getByText('Music Enhancer')).toBeInTheDocument();
    expect(screen.getByText('Voice Changer')).toBeInTheDocument();
    expect(screen.getByText('Stem Splitter')).toBeInTheDocument();
    expect(screen.getByText('Sound Effects')).toBeInTheDocument();
  });

  it('hides AI Tools submenu on mouse leave', () => {
    render(<CanvasContextMenu {...defaultProps} />);
    const aiToolsBtn = screen.getByText('AI Tools').closest('div')!;
    fireEvent.mouseEnter(aiToolsBtn);
    expect(screen.getByText('Inspire Me')).toBeInTheDocument();
    fireEvent.mouseLeave(aiToolsBtn);
    expect(screen.queryByText('Inspire Me')).not.toBeInTheDocument();
  });

  it('marks Voice Changer, Stem Splitter, Sound Effects as disabled', () => {
    render(<CanvasContextMenu {...defaultProps} />);
    const aiToolsBtn = screen.getByText('AI Tools').closest('div')!;
    fireEvent.mouseEnter(aiToolsBtn);

    const voiceChanger = screen.getByText('Voice Changer').closest('button')!;
    const stemSplitter = screen.getByText('Stem Splitter').closest('button')!;
    const soundEffects = screen.getByText('Sound Effects').closest('button')!;

    expect(voiceChanger).toBeDisabled();
    expect(stemSplitter).toBeDisabled();
    expect(soundEffects).toBeDisabled();
  });

  it('calls onClose when clicking Inspire Me', () => {
    render(<CanvasContextMenu {...defaultProps} />);
    const aiToolsBtn = screen.getByText('AI Tools').closest('div')!;
    fireEvent.mouseEnter(aiToolsBtn);
    fireEvent.click(screen.getByText('Inspire Me'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when clicking Select All', () => {
    render(<CanvasContextMenu {...defaultProps} />);
    fireEvent.click(screen.getByText('Select All'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', () => {
    render(<CanvasContextMenu {...defaultProps} />);
    const menu = screen.getByTestId('canvas-context-menu');
    const backdrop = menu.previousElementSibling! as HTMLElement;
    fireEvent.click(backdrop);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
