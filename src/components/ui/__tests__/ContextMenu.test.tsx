import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ContextMenuWrapper,
  ContextMenuItem,
  ContextMenuSeparator,
} from '../ContextMenu';

describe('ContextMenuWrapper', () => {
  it('renders children', () => {
    render(
      <ContextMenuWrapper x={100} y={100} onClose={vi.fn()}>
        <span>Menu content</span>
      </ContextMenuWrapper>,
    );
    expect(screen.getByText('Menu content')).toBeDefined();
  });

  it('has role="menu"', () => {
    render(
      <ContextMenuWrapper x={100} y={100} onClose={vi.fn()}>
        <span>Menu content</span>
      </ContextMenuWrapper>,
    );
    expect(screen.getByRole('menu')).toBeDefined();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(
      <ContextMenuWrapper x={100} y={100} onClose={onClose}>
        <span>Menu</span>
      </ContextMenuWrapper>,
    );
    // Click the backdrop (first child)
    const backdrop = screen.getByRole('menu').previousElementSibling!;
    fireEvent.click(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(
      <ContextMenuWrapper x={100} y={100} onClose={onClose}>
        <ContextMenuItem label="Item" onClick={vi.fn()} />
      </ContextMenuWrapper>,
    );
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ContextMenuItem', () => {
  it('renders label text', () => {
    render(<ContextMenuItem label="Copy" onClick={vi.fn()} />);
    expect(screen.getByText('Copy')).toBeDefined();
  });

  it('has role="menuitem"', () => {
    render(<ContextMenuItem label="Copy" onClick={vi.fn()} />);
    expect(screen.getByRole('menuitem')).toBeDefined();
  });

  it('fires onClick when clicked', () => {
    const onClick = vi.fn();
    render(<ContextMenuItem label="Copy" onClick={onClick} />);
    fireEvent.click(screen.getByRole('menuitem'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', () => {
    const onClick = vi.fn();
    render(<ContextMenuItem label="Copy" onClick={onClick} disabled />);
    fireEvent.click(screen.getByRole('menuitem'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders shortcut text', () => {
    render(<ContextMenuItem label="Copy" onClick={vi.fn()} shortcut="Cmd+C" />);
    expect(screen.getByText('Cmd+C')).toBeDefined();
  });

  it('renders icon when provided', () => {
    render(
      <ContextMenuItem
        label="Delete"
        onClick={vi.fn()}
        icon={<span data-testid="trash-icon">🗑</span>}
      />,
    );
    expect(screen.getByTestId('trash-icon')).toBeDefined();
  });

  it('applies opacity-40 when disabled', () => {
    render(<ContextMenuItem label="Copy" onClick={vi.fn()} disabled />);
    const item = screen.getByRole('menuitem');
    expect(item.className).toContain('opacity-40');
  });
});

describe('ContextMenuSeparator', () => {
  it('renders a separator with role', () => {
    render(<ContextMenuSeparator />);
    expect(screen.getByRole('separator')).toBeDefined();
  });
});
