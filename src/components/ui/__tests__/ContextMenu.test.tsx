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
    screen.getByText('Menu content'); // getBy* throws if not found
  });

  it('has role="menu"', () => {
    render(
      <ContextMenuWrapper x={100} y={100} onClose={vi.fn()}>
        <span>Menu content</span>
      </ContextMenuWrapper>,
    );
    screen.getByRole('menu'); // getBy* throws if not found
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
    screen.getByText('Copy'); // getBy* throws if not found
  });

  it('has role="menuitem"', () => {
    render(<ContextMenuItem label="Copy" onClick={vi.fn()} />);
    screen.getByRole('menuitem'); // getBy* throws if not found
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
    screen.getByText('Cmd+C'); // getBy* throws if not found
  });

  it('renders icon when provided', () => {
    render(
      <ContextMenuItem
        label="Delete"
        onClick={vi.fn()}
        icon={<span data-testid="trash-icon">🗑</span>}
      />,
    );
    screen.getByTestId('trash-icon'); // getBy* throws if not found
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
    screen.getByRole('separator'); // getBy* throws if not found
  });
});
